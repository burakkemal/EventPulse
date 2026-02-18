import type { Event } from '../event.js';

/** Severity levels for detected anomalies. */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * An anomaly detected by a rule.
 *
 * Contains enough context for downstream alerting without
 * carrying the full event payload.
 */
export interface Anomaly {
  readonly rule_id: string;
  readonly event_id: string;
  readonly severity: Severity;
  readonly message: string;
  readonly detected_at: string; // ISO-8601
}

/**
 * Result of evaluating a single rule against an event.
 *
 * `triggered === false` means the event passed the rule.
 * `triggered === true` includes the anomaly detail.
 */
export type RuleResult =
  | { readonly triggered: false; readonly rule_id: string }
  | { readonly triggered: true; readonly rule_id: string; readonly anomaly: Anomaly };

/**
 * Context provided to rules that need historical awareness.
 *
 * The rule engine populates this from an in-memory sliding window.
 * Rules that don't need context can ignore it.
 */
export interface RuleContext {
  /** Recent events from the same source, ordered oldest → newest. */
  readonly recentEventsBySource: readonly Event[];
}

/**
 * A rule is a pure, deterministic function.
 *
 * Given an event and optional context, it returns a RuleResult.
 * Rules must be side-effect-free — no I/O, no mutation.
 */
export interface Rule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: Severity;
  evaluate(event: Event, context: RuleContext): RuleResult;
}
