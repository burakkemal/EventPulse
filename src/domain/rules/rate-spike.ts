import type { Event } from '../event.js';
import type { Rule, RuleContext, RuleResult } from './types.js';

const RULE_ID = 'rate-spike';

/**
 * Rate spike detection rule.
 *
 * Triggers when more than `maxEvents` events from the same source
 * appear within `windowSeconds` seconds (including the current event).
 *
 * Pure function — uses only the provided context, no external state.
 */
export function createRateSpikeRule(
  maxEvents: number = 50,
  windowSeconds: number = 60,
): Rule {
  return {
    id: RULE_ID,
    name: 'Rate Spike',
    description: `Triggers when >${maxEvents} events from same source within ${windowSeconds}s`,
    severity: 'high',

    evaluate(event: Event, context: RuleContext): RuleResult {
      const now = new Date(event.timestamp).getTime();
      const windowStart = now - windowSeconds * 1000;

      // Count events within the time window (including current event)
      const countInWindow = context.recentEventsBySource.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= windowStart && t <= now;
      }).length + 1; // +1 for the current event (not yet in context)

      if (countInWindow > maxEvents) {
        return {
          triggered: true,
          rule_id: RULE_ID,
          anomaly: {
            rule_id: RULE_ID,
            event_id: event.event_id,
            severity: 'high',
            message: `Rate spike: ${countInWindow} events from source "${event.source}" in ${windowSeconds}s (threshold: ${maxEvents})`,
            detected_at: new Date().toISOString(),
          },
        };
      }

      return { triggered: false, rule_id: RULE_ID };
    },
  };
}
