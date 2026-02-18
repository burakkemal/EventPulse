import type { Event } from '../event.js';
import type { Rule, RuleContext, RuleResult } from './types.js';

const RULE_ID = 'invalid-payload';

/**
 * Required fields per event type.
 *
 * Each entry maps an event_type to the payload keys that must be
 * present and non-nullish. Unknown event types pass by default —
 * this rule only enforces known schemas.
 */
const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  page_view: ['url'],
  button_click: ['url', 'element_id'],
  form_submit: ['url', 'form_name'],
};

/**
 * Invalid payload detection rule.
 *
 * Triggers when a known event type is missing required logical fields
 * in its payload. Unknown event types are allowed through.
 *
 * Pure function — no I/O, deterministic.
 */
export function createInvalidPayloadRule(
  requiredFields: Record<string, readonly string[]> = REQUIRED_FIELDS,
): Rule {
  return {
    id: RULE_ID,
    name: 'Invalid Payload',
    description: 'Triggers when known event types are missing required payload fields',
    severity: 'medium',

    evaluate(event: Event, _context: RuleContext): RuleResult {
      const required = requiredFields[event.event_type];

      // Unknown event types pass — we only validate known schemas
      if (required === undefined) {
        return { triggered: false, rule_id: RULE_ID };
      }

      const missing = required.filter(
        (field) => !(field in event.payload) || event.payload[field] == null,
      );

      if (missing.length > 0) {
        return {
          triggered: true,
          rule_id: RULE_ID,
          anomaly: {
            rule_id: RULE_ID,
            event_id: event.event_id,
            severity: 'medium',
            message: `Missing required payload fields for "${event.event_type}": ${missing.join(', ')}`,
            detected_at: new Date().toISOString(),
          },
        };
      }

      return { triggered: false, rule_id: RULE_ID };
    },
  };
}
