import type { Event } from '../event.js';
import type { Rule, RuleContext, RuleResult } from './types.js';

const RULE_ID = 'timestamp-drift';

/**
 * Suspicious timestamp drift detection rule.
 *
 * Triggers when an event's timestamp deviates from a reference time
 * by more than `maxDriftSeconds`. This catches:
 * - Clock skew on producer machines
 * - Replay attacks (timestamps far in the past)
 * - Fabricated future timestamps
 *
 * The reference time is injectable for testability — defaults to Date.now().
 * Pure function (when `nowFn` is fixed).
 */
export function createTimestampDriftRule(
  maxDriftSeconds: number = 300,  // 5 minutes default
  nowFn: () => number = Date.now,
): Rule {
  return {
    id: RULE_ID,
    name: 'Timestamp Drift',
    description: `Triggers when event timestamp drifts >${maxDriftSeconds}s from server time`,
    severity: 'low',

    evaluate(event: Event, _context: RuleContext): RuleResult {
      const eventTime = new Date(event.timestamp).getTime();

      // Invalid date parsing → always trigger
      if (Number.isNaN(eventTime)) {
        return {
          triggered: true,
          rule_id: RULE_ID,
          anomaly: {
            rule_id: RULE_ID,
            event_id: event.event_id,
            severity: 'low',
            message: `Unparseable timestamp: "${event.timestamp}"`,
            detected_at: new Date().toISOString(),
          },
        };
      }

      const now = nowFn();
      const driftMs = Math.abs(now - eventTime);
      const driftSeconds = driftMs / 1000;

      if (driftSeconds > maxDriftSeconds) {
        const direction = eventTime < now ? 'past' : 'future';
        return {
          triggered: true,
          rule_id: RULE_ID,
          anomaly: {
            rule_id: RULE_ID,
            event_id: event.event_id,
            severity: 'low',
            message: `Timestamp drift: ${Math.round(driftSeconds)}s in the ${direction} (threshold: ${maxDriftSeconds}s)`,
            detected_at: new Date().toISOString(),
          },
        };
      }

      return { triggered: false, rule_id: RULE_ID };
    },
  };
}
