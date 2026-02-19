import type Redis from 'ioredis';
import type { Logger } from 'pino';

const CHANNEL = 'rules_changed';

export type RuleChangeReason = 'create' | 'update' | 'patch' | 'delete';

export interface RuleChangePayload {
  ts: string;
  reason: RuleChangeReason;
  rule_id: string;
}

/**
 * Publishes a lightweight notification to the "rules_changed" Pub/Sub channel.
 *
 * Best-effort: publish failures are logged but never propagated to the caller.
 * This ensures rule CRUD HTTP responses are never affected by Pub/Sub issues.
 */
export async function publishRuleChange(
  redis: Redis,
  log: Logger,
  reason: RuleChangeReason,
  ruleId: string,
): Promise<void> {
  try {
    const payload: RuleChangePayload = {
      ts: new Date().toISOString(),
      reason,
      rule_id: ruleId,
    };
    await redis.publish(CHANNEL, JSON.stringify(payload));
    log.debug({ channel: CHANNEL, reason, rule_id: ruleId }, 'Published rule change notification');
  } catch (err: unknown) {
    log.error({ err, reason, rule_id: ruleId }, 'Failed to publish rule change notification');
  }
}
