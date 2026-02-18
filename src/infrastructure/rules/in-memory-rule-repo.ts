import type { Rule } from '../../domain/rules/index.js';
import {
  createRateSpikeRule,
  createInvalidPayloadRule,
  createTimestampDriftRule,
} from '../../domain/rules/index.js';

/**
 * In-memory rule repository.
 *
 * Temporary stub — rules are hardcoded here until a persistence
 * layer (DB-backed rule config) is implemented.
 *
 * Provides a consistent interface so the worker doesn't need
 * to know where rules come from.
 */
export class InMemoryRuleRepository {
  private readonly rules: Map<string, Rule> = new Map();

  constructor(rules?: Rule[]) {
    const initial = rules ?? InMemoryRuleRepository.defaults();
    for (const rule of initial) {
      this.rules.set(rule.id, rule);
    }
  }

  /** Return all active rules. */
  getAll(): Rule[] {
    return [...this.rules.values()];
  }

  /** Look up a rule by ID. */
  getById(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  /** Register a new rule at runtime (useful for testing). */
  add(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  /** Default rule set for local development. */
  static defaults(): Rule[] {
    return [
      createRateSpikeRule(50, 60),
      createInvalidPayloadRule(),
      createTimestampDriftRule(300),
    ];
  }
}
