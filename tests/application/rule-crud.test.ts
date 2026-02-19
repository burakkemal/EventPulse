import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ESM-safe mock: vi.mock is hoisted above imports by Vitest.
 * We mock the infrastructure/db barrel for rule repository functions.
 */
vi.mock('../../src/infrastructure/db/index.js', () => ({
  insertRule: vi.fn(),
  findAllRules: vi.fn(),
  findRuleById: vi.fn(),
  updateRule: vi.fn(),
  patchRule: vi.fn(),
  deleteRule: vi.fn(),
}));

import {
  createRule,
  listRules,
  getRule,
  updateRuleFull,
  patchRulePartial,
  removeRule,
} from '../../src/application/rule-crud.js';

import {
  insertRule,
  findAllRules,
  findRuleById,
  updateRule,
  patchRule,
  deleteRule,
} from '../../src/infrastructure/db/index.js';

const mockInsertRule = vi.mocked(insertRule);
const mockFindAllRules = vi.mocked(findAllRules);
const mockFindRuleById = vi.mocked(findRuleById);
const mockUpdateRule = vi.mocked(updateRule);
const mockPatchRule = vi.mocked(patchRule);
const mockDeleteRule = vi.mocked(deleteRule);

const db = {} as Parameters<typeof createRule>[0];

const SAMPLE_RULE = {
  rule_id: '11111111-2222-3333-4444-555555555555',
  name: 'High error rate',
  enabled: true,
  severity: 'critical',
  window_seconds: 60,
  cooldown_seconds: 300,
  condition: {
    type: 'threshold',
    metric: 'count',
    filters: { event_type: 'error' },
    operator: '>',
    value: 10,
  },
  created_at: new Date('2026-02-18T12:00:00Z'),
  updated_at: new Date('2026-02-18T12:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createRule ──────────────────────────────────────────────

describe('createRule', () => {
  it('calls insertRule and returns the row', async () => {
    mockInsertRule.mockResolvedValue(SAMPLE_RULE);

    const result = await createRule(db, {
      name: 'High error rate',
      severity: 'critical',
      window_seconds: 60,
      cooldown_seconds: 300,
      condition: SAMPLE_RULE.condition as Record<string, unknown>,
    });

    expect(mockInsertRule).toHaveBeenCalledWith(db, {
      name: 'High error rate',
      severity: 'critical',
      window_seconds: 60,
      cooldown_seconds: 300,
      condition: SAMPLE_RULE.condition,
    });
    expect(result).toEqual(SAMPLE_RULE);
  });
});

// ─── listRules ───────────────────────────────────────────────

describe('listRules', () => {
  it('returns all rules from findAllRules', async () => {
    mockFindAllRules.mockResolvedValue([SAMPLE_RULE]);

    const result = await listRules(db);

    expect(mockFindAllRules).toHaveBeenCalledWith(db);
    expect(result).toEqual([SAMPLE_RULE]);
  });

  it('returns empty array when no rules exist', async () => {
    mockFindAllRules.mockResolvedValue([]);

    const result = await listRules(db);
    expect(result).toEqual([]);
  });
});

// ─── getRule ─────────────────────────────────────────────────

describe('getRule', () => {
  it('returns the rule when found', async () => {
    mockFindRuleById.mockResolvedValue(SAMPLE_RULE);

    const result = await getRule(db, SAMPLE_RULE.rule_id);

    expect(mockFindRuleById).toHaveBeenCalledWith(db, SAMPLE_RULE.rule_id);
    expect(result).toEqual(SAMPLE_RULE);
  });

  it('returns null when not found', async () => {
    mockFindRuleById.mockResolvedValue(undefined);

    const result = await getRule(db, 'nonexistent-id');
    expect(result).toBeNull();
  });
});

// ─── updateRuleFull ──────────────────────────────────────────

describe('updateRuleFull', () => {
  it('returns updated row on success', async () => {
    const updated = { ...SAMPLE_RULE, name: 'Updated name' };
    mockUpdateRule.mockResolvedValue(updated);

    const result = await updateRuleFull(db, SAMPLE_RULE.rule_id, {
      name: 'Updated name',
      enabled: true,
      severity: 'critical',
      window_seconds: 60,
      cooldown_seconds: 300,
      condition: SAMPLE_RULE.condition as Record<string, unknown>,
    });

    expect(mockUpdateRule).toHaveBeenCalledWith(db, SAMPLE_RULE.rule_id, expect.objectContaining({ name: 'Updated name' }));
    expect(result).toEqual(updated);
  });

  it('returns null when rule not found', async () => {
    mockUpdateRule.mockResolvedValue(undefined);

    const result = await updateRuleFull(db, 'nonexistent', {
      name: 'X',
      enabled: true,
      severity: 'info',
      window_seconds: 1,
      cooldown_seconds: 0,
      condition: {} as Record<string, unknown>,
    });

    expect(result).toBeNull();
  });
});

// ─── patchRulePartial ────────────────────────────────────────

describe('patchRulePartial', () => {
  it('returns patched row on success', async () => {
    const patched = { ...SAMPLE_RULE, enabled: false };
    mockPatchRule.mockResolvedValue(patched);

    const result = await patchRulePartial(db, SAMPLE_RULE.rule_id, { enabled: false });

    expect(mockPatchRule).toHaveBeenCalledWith(db, SAMPLE_RULE.rule_id, { enabled: false });
    expect(result).toEqual(patched);
  });

  it('returns null when rule not found', async () => {
    mockPatchRule.mockResolvedValue(undefined);

    const result = await patchRulePartial(db, 'nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });
});

// ─── removeRule ──────────────────────────────────────────────

describe('removeRule', () => {
  it('returns true when deleted', async () => {
    mockDeleteRule.mockResolvedValue(true);

    const result = await removeRule(db, SAMPLE_RULE.rule_id);

    expect(mockDeleteRule).toHaveBeenCalledWith(db, SAMPLE_RULE.rule_id);
    expect(result).toBe(true);
  });

  it('returns false when not found', async () => {
    mockDeleteRule.mockResolvedValue(false);

    const result = await removeRule(db, 'nonexistent');
    expect(result).toBe(false);
  });
});
