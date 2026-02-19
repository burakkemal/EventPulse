import type Redis from 'ioredis';
import type { Logger } from 'pino';

const CHANNEL = 'anomaly_notifications';

export interface AnomalyNotificationPayload {
  anomaly_id: string;
  rule_id: string;
  severity: string;
  message: string;
  detected_at: string;
}

/**
 * Publishes an anomaly notification to the "anomaly_notifications" Pub/Sub channel.
 *
 * Best-effort: publish failures are logged but never block anomaly persistence.
 */
export async function publishAnomalyNotification(
  redis: Redis,
  log: Logger,
  payload: AnomalyNotificationPayload,
): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify(payload));
    log.debug(
      { channel: CHANNEL, anomaly_id: payload.anomaly_id, rule_id: payload.rule_id },
      'Publishing anomaly notification',
    );
  } catch (err: unknown) {
    log.warn({ err, anomaly_id: payload.anomaly_id }, 'Failed to publish anomaly notification');
  }
}
