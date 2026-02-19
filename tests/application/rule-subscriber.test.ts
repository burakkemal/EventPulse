import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ESM-safe mock: vi.mock is hoisted above imports by Vitest.
 * We mock the DB barrel to control findEnabledRules.
 */
vi.mock('../../src/infrastructure/db/index.js', () => ({
  findEnabledRules: vi.fn(),
}));

import { reloadRules } from '../../src/infrastructure/worker/rule-subscriber.js';
import { RuleStore } from '../../src/application/rule-store.js';
import { findEnabledRules } from '../../src/infrastructure/db/index.js';

const mockFindEnabledRules = vi.mocked(findEnabledRules);

/** Minimal fake logger. */
function fakeLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as import('pino').Logger;
}

/** Minimal RuleRow factory. */
function fakeRule(id: string) {
  return {
    rule_id: id,
    name: `rule-${id}`,
    enabled: true,
    severity: 'warning',
    window_seconds: 60,
    cooldown_seconds: 0,
    condition: { type: 'threshold', metric: 'count', operator: '>', value: 5 },
    created_at: new Date(),
    updated_at: new Date(),
  };
}

const fakeDb = {} as import('../../src/infrastructure/db/index.js').Database;

describe('reloadRules', () => {
  let store: RuleStore;
  let log: ReturnType<typeof fakeLogger>;
  let reloading: boolean;
  let getReloading: () => boolean;
  let setReloading: (v: boolean) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new RuleStore();
    log = fakeLogger();
    reloading = false;
    getReloading = () => reloading;
    setReloading = (v) => { reloading = v; };
  });

  it('fetches enabled rules and swaps the store snapshot', async () => {
    const rules = [fakeRule('r1'), fakeRule('r2')];
    mockFindEnabledRules.mockResolvedValueOnce(rules as any);

    await reloadRules(fakeDb, log, store, '{"reason":"create","rule_id":"r1"}', getReloading, setReloading);

    expect(mockFindEnabledRules).toHaveBeenCalledWith(fakeDb);
    expect(store.get()).toHaveLength(2);
    expect(store.get()[0]?.rule_id).toBe('r1');
  });

  it('logs ruleCount and ruleIds after reload', async () => {
    mockFindEnabledRules.mockResolvedValueOnce([fakeRule('r1')] as any);

    await reloadRules(fakeDb, log, store, '{"reason":"update","rule_id":"r1"}', getReloading, setReloading);

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ ruleCount: 1, ruleIds: ['r1'] }),
      'Rules reloaded successfully',
    );
  });

  it('skips reload when already reloading', async () => {
    reloading = true;

    await reloadRules(fakeDb, log, store, '{}', getReloading, setReloading);

    expect(mockFindEnabledRules).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith('Reload already in progress, skipping');
  });

  it('resets reloading flag after successful reload', async () => {
    mockFindEnabledRules.mockResolvedValueOnce([] as any);

    await reloadRules(fakeDb, log, store, '{}', getReloading, setReloading);

    expect(reloading).toBe(false);
  });

  it('resets reloading flag after failed reload', async () => {
    mockFindEnabledRules.mockRejectedValueOnce(new Error('DB down'));

    await reloadRules(fakeDb, log, store, '{}', getReloading, setReloading);

    expect(reloading).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to reload rules from database',
    );
  });

  it('does not update store on DB error', async () => {
    store.set([fakeRule('existing')] as any);
    mockFindEnabledRules.mockRejectedValueOnce(new Error('DB down'));

    await reloadRules(fakeDb, log, store, '{}', getReloading, setReloading);

    // Store retains old snapshot
    expect(store.get()).toHaveLength(1);
    expect(store.get()[0]?.rule_id).toBe('existing');
  });

  it('handles non-JSON message gracefully', async () => {
    mockFindEnabledRules.mockResolvedValueOnce([fakeRule('r1')] as any);

    await reloadRules(fakeDb, log, store, 'not-json', getReloading, setReloading);

    // Should still reload successfully
    expect(store.get()).toHaveLength(1);
  });

  it('parses reason and rule_id from message for logging', async () => {
    mockFindEnabledRules.mockResolvedValueOnce([] as any);

    await reloadRules(
      fakeDb, log, store,
      '{"reason":"delete","rule_id":"abc-123"}',
      getReloading, setReloading,
    );

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'delete', rule_id: 'abc-123' }),
      'Rule change detected, reloading rules from database…',
    );
  });
});
