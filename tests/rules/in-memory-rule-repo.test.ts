import { describe, it, expect } from 'vitest';
import { InMemoryRuleRepository } from '../../src/infrastructure/rules/in-memory-rule-repo.js';
import type { Rule, RuleContext, RuleResult } from '../../src/domain/rules/types.js';

describe('InMemoryRuleRepository', () => {
  it('should load default rules', () => {
    const repo = new InMemoryRuleRepository();
    const rules = repo.getAll();
    expect(rules.length).toBe(3);
    expect(rules.map((r) => r.id)).toContain('rate-spike');
    expect(rules.map((r) => r.id)).toContain('invalid-payload');
    expect(rules.map((r) => r.id)).toContain('timestamp-drift');
  });

  it('should look up rule by id', () => {
    const repo = new InMemoryRuleRepository();
    const rule = repo.getById('rate-spike');
    expect(rule).toBeDefined();
    expect(rule?.name).toBe('Rate Spike');
  });

  it('should return undefined for unknown id', () => {
    const repo = new InMemoryRuleRepository();
    expect(repo.getById('nonexistent')).toBeUndefined();
  });

  it('should accept custom rules via constructor', () => {
    const custom: Rule = {
      id: 'custom',
      name: 'Custom',
      description: 'Test',
      severity: 'low',
      evaluate(_event, _context: RuleContext): RuleResult {
        return { triggered: false, rule_id: 'custom' };
      },
    };
    const repo = new InMemoryRuleRepository([custom]);
    expect(repo.getAll()).toHaveLength(1);
    expect(repo.getById('custom')).toBeDefined();
  });

  it('should allow adding rules at runtime', () => {
    const repo = new InMemoryRuleRepository([]);
    expect(repo.getAll()).toHaveLength(0);

    const rule: Rule = {
      id: 'added',
      name: 'Added',
      description: 'Runtime-added',
      severity: 'medium',
      evaluate(_event, _context: RuleContext): RuleResult {
        return { triggered: false, rule_id: 'added' };
      },
    };
    repo.add(rule);
    expect(repo.getAll()).toHaveLength(1);
    expect(repo.getById('added')).toBeDefined();
  });

  it('should overwrite rule with same id', () => {
    const repo = new InMemoryRuleRepository();
    const replacement: Rule = {
      id: 'rate-spike',
      name: 'Replaced Rate Spike',
      description: 'Replaced',
      severity: 'critical',
      evaluate(_event, _context: RuleContext): RuleResult {
        return { triggered: false, rule_id: 'rate-spike' };
      },
    };
    repo.add(replacement);
    expect(repo.getById('rate-spike')?.name).toBe('Replaced Rate Spike');
    // Count should stay the same (3 defaults, one replaced)
    expect(repo.getAll()).toHaveLength(3);
  });
});
