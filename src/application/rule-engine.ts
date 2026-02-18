import type { Event } from '../domain/index.js';
import type { Rule, RuleResult, RuleContext, Anomaly } from '../domain/rules/index.js';

/**
 * Sliding window that tracks recent events per source for context-aware rules.
 *
 * Backed by a simple Map<source, Event[]>. Events older than `windowMs`
 * are pruned on each `add()` call to bound memory.
 */
export class EventWindow {
  private readonly window: Map<string, Event[]> = new Map();
  private readonly windowMs: number;

  constructor(windowMs: number = 60_000) {
    this.windowMs = windowMs;
  }

  /** Add an event and prune stale entries for its source. */
  add(event: Event): void {
    const cutoff = new Date(event.timestamp).getTime() - this.windowMs;
    const existing = this.window.get(event.source) ?? [];

    // Prune events outside the window
    const pruned = existing.filter(
      (e) => new Date(e.timestamp).getTime() >= cutoff,
    );

    pruned.push(event);
    this.window.set(event.source, pruned);
  }

  /** Get recent events for a source (excluding the current event). */
  getRecentBySource(source: string, excludeEventId: string): Event[] {
    const events = this.window.get(source) ?? [];
    return events.filter((e) => e.event_id !== excludeEventId);
  }

  /** For testing — total events tracked across all sources. */
  get size(): number {
    let total = 0;
    for (const events of this.window.values()) {
      total += events.length;
    }
    return total;
  }
}

/**
 * Rule engine — evaluates an event against a list of rules.
 *
 * Pure orchestration:
 * 1. Builds the RuleContext from the sliding window.
 * 2. Runs each rule's `evaluate()` function.
 * 3. Collects and returns all RuleResults.
 *
 * The engine itself has no side effects — callers decide
 * what to do with the results (log, persist, alert).
 */
export function evaluateEvent(
  event: Event,
  rules: readonly Rule[],
  window: EventWindow,
): { results: RuleResult[]; anomalies: Anomaly[] } {
  const context: RuleContext = {
    recentEventsBySource: window.getRecentBySource(event.source, event.event_id),
  };

  const results: RuleResult[] = [];
  const anomalies: Anomaly[] = [];

  for (const rule of rules) {
    const result = rule.evaluate(event, context);
    results.push(result);

    if (result.triggered) {
      anomalies.push(result.anomaly);
    }
  }

  // Add to window AFTER evaluation so the current event
  // isn't double-counted in context-aware rules
  window.add(event);

  return { results, anomalies };
}
