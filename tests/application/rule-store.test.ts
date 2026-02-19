import { describe, it, expect } from 'vitest';
import { RuleStore } from '../../src/application/rule-store.js';
import type { RuleRow } from '../../src/infrastructure/db/index.js';

/** Minimal RuleRow factory for testing. */
function fakeRule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    rule_id: overrides.rule_id ?? 'aaaaaaaa-0000-0000-0000-000000000001',
    name: overrides.name ?? 'test-rule',
    enabled: overrides.enabled ?? true,
    severity: overrides.severity ?? 'warning',
    window_seconds: overrides.window_seconds ?? 60,
    cooldown_seconds: overrides.cooldown_seconds ?? 0,
    condition: overrides.condition ?? { type: 'threshold', metric: 'count', operator: '>', value: 5 },
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
  };
}

describe('RuleStore', () => {
  it('initialises with empty array by default', () => {
    const store = new RuleStore();
    expect(store.get()).toEqual([]);
  });

  it('initialises with provided rules', () => {
    const rules = [fakeRule({ rule_id: 'r1' }), fakeRule({ rule_id: 'r2' })];
    const store = new RuleStore(rules);
    expect(store.get()).toHaveLength(2);
    expect(store.get()[0]?.rule_id).toBe('r1');
  });

  it('set() replaces the snapshot atomically', () => {
    const store = new RuleStore([fakeRule({ rule_id: 'old' })]);
    const next = [fakeRule({ rule_id: 'new-1' }), fakeRule({ rule_id: 'new-2' })];
    store.set(next);
    expect(store.get()).toHaveLength(2);
    expect(store.get()[0]?.rule_id).toBe('new-1');
  });

  it('get() returns the same reference (no defensive copy)', () => {
    const rules = [fakeRule()];
    const store = new RuleStore(rules);
    expect(store.get()).toBe(rules);
  });

  it('set() with empty array clears rules', () => {
    const store = new RuleStore([fakeRule(), fakeRule()]);
    store.set([]);
    expect(store.get()).toHaveLength(0);
  });

  it('consecutive set() calls always reflect the latest snapshot', () => {
    const store = new RuleStore();
    store.set([fakeRule({ rule_id: 'v1' })]);
    store.set([fakeRule({ rule_id: 'v2' })]);
    store.set([fakeRule({ rule_id: 'v3' })]);
    expect(store.get()).toHaveLength(1);
    expect(store.get()[0]?.rule_id).toBe('v3');
  });
});
