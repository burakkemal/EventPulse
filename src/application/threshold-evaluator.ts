import type { RuleRow } from '../infrastructure/db/index.js';
import type { ThresholdCondition } from './rule-schema.js';

/**
 * Anomaly produced by threshold evaluation.
 * Matches the shape expected by insertAnomaly().
 */
export interface ThresholdAnomaly {
  readonly rule_id: string;
  readonly event_id: string;
  readonly severity: string;
  readonly message: string;
  readonly detected_at: string; // ISO-8601
}

/** Minimal event shape needed for threshold evaluation. */
export interface EvaluatableEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly source: string;
  readonly timestamp: string;
}

/**
 * Compares a count against a threshold value using the specified operator.
 */
function compare(count: number, operator: string, value: number): boolean {
  switch (operator) {
    case '>':  return count > value;
    case '>=': return count >= value;
    case '<':  return count < value;
    case '<=': return count <= value;
    case '==': return count === value;
    case '!=': return count !== value;
    default:   return false;
  }
}

/**
 * Checks if an event matches a rule's filter criteria.
 * A missing filter field means "match all".
 */
function matchesFilters(event: EvaluatableEvent, filters: ThresholdCondition['filters']): boolean {
  if (filters === undefined) return true;
  if (filters.event_type !== undefined && event.event_type !== filters.event_type) return false;
  if (filters.source !== undefined && event.source !== filters.source) return false;
  return true;
}

/**
 * ThresholdEvaluator — evaluates DB-backed threshold rules against events.
 *
 * Maintains per-rule state:
 * - Sliding window: sorted array of timestamps (ms) for matched events.
 *   Pruned from the front on each evaluate() call since entries are
 *   chronologically ordered, giving O(k) prune where k = expired entries.
 * - Cooldown map: last trigger timestamp per rule to suppress rapid-fire anomalies.
 *
 * Injectable `nowFn` allows deterministic testing.
 */
export class ThresholdEvaluator {
  /** Per-rule sliding window: rule_id → sorted timestamp array (ms). */
  private readonly windows: Map<string, number[]> = new Map();
  /** Per-rule cooldown: rule_id → last trigger time (ms). */
  private readonly cooldowns: Map<string, number> = new Map();
  /** Clock function — injectable for tests. */
  private readonly nowFn: () => number;

  constructor(nowFn: () => number = Date.now) {
    this.nowFn = nowFn;
  }

  /**
   * Evaluate an event against a list of DB-backed rules.
   *
   * For each enabled rule:
   * 1. Check filter match (skip rule if no match).
   * 2. Add event timestamp to rule's sliding window.
   * 3. Prune expired entries (older than window_seconds).
   * 4. Count remaining entries.
   * 5. Apply operator comparison.
   * 6. If triggered, check cooldown (skip if within cooldown_seconds).
   * 7. If not cooled down, emit anomaly and update cooldown.
   *
   * Returns array of anomalies (may be empty).
   */
  evaluate(event: EvaluatableEvent, dbRules: readonly RuleRow[]): ThresholdAnomaly[] {
    const anomalies: ThresholdAnomaly[] = [];
    const eventTimeMs = new Date(event.timestamp).getTime();
    const now = this.nowFn();

    for (const rule of dbRules) {
      if (!rule.enabled) continue;

      const condition = rule.condition as ThresholdCondition;

      // 1. Filter match
      if (!matchesFilters(event, condition.filters)) continue;

      // 2. Add to window
      const ruleId = rule.rule_id;
      let window = this.windows.get(ruleId);
      if (window === undefined) {
        window = [];
        this.windows.set(ruleId, window);
      }
      window.push(eventTimeMs);

      // 3. Prune expired entries from the front
      const cutoff = eventTimeMs - (rule.window_seconds * 1000);
      let pruneIndex = 0;
      while (pruneIndex < window.length && window[pruneIndex]! < cutoff) {
        pruneIndex++;
      }
      if (pruneIndex > 0) {
        window.splice(0, pruneIndex);
      }

      // 4. Count
      const count = window.length;

      // 5. Compare
      if (!compare(count, condition.operator, condition.value)) continue;

      // 6. Cooldown check
      if (rule.cooldown_seconds > 0) {
        const lastTrigger = this.cooldowns.get(ruleId) ?? 0;
        if (now - lastTrigger < rule.cooldown_seconds * 1000) continue;
      }

      // 7. Emit anomaly + update cooldown
      this.cooldowns.set(ruleId, now);

      anomalies.push({
        rule_id: ruleId,
        event_id: event.event_id,
        severity: rule.severity,
        message: `Threshold rule "${rule.name}" triggered: count(${count}) ${condition.operator} ${condition.value}`,
        detected_at: new Date(now).toISOString(),
      });
    }

    return anomalies;
  }

  /** For testing — number of windows tracked. */
  get windowCount(): number {
    return this.windows.size;
  }

  /** For testing — total entries across all windows. */
  get totalEntries(): number {
    let total = 0;
    for (const w of this.windows.values()) total += w.length;
    return total;
  }
}
