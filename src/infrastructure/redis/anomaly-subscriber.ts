import Redis from 'ioredis';
import type { Logger } from 'pino';
import type { AnomalyNotificationPayload } from './anomaly-notifier.js';

const CHANNEL = 'anomaly_notifications';

export type AnomalyHandler = (payload: AnomalyNotificationPayload) => void;

/**
 * Subscribes to the "anomaly_notifications" Pub/Sub channel in the app process.
 *
 * ioredis requires a dedicated connection for subscriber mode.
 * Dispatches parsed payloads to the provided handler(s).
 * Malformed payloads are logged and skipped — never crash.
 *
 * Returns a cleanup function for graceful shutdown.
 */
export async function startAnomalySubscriber(
  redisUrl: string,
  log: Logger,
  handler: AnomalyHandler,
): Promise<() => Promise<void>> {
  const sub = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  await sub.connect();
  log.info('Anomaly subscriber Redis connection established');

  sub.on('message', (channel: string, message: string) => {
    if (channel !== CHANNEL) return;

    try {
      const payload = JSON.parse(message) as AnomalyNotificationPayload;

      // Basic payload validation
      if (!payload.anomaly_id || !payload.rule_id || !payload.severity) {
        log.warn({ message }, 'Malformed anomaly notification payload, skipping');
        return;
      }

      log.info(
        { anomaly_id: payload.anomaly_id, rule_id: payload.rule_id, severity: payload.severity },
        'Anomaly notification received',
      );

      handler(payload);
    } catch (err: unknown) {
      log.warn({ err, message }, 'Failed to parse anomaly notification');
    }
  });

  await sub.subscribe(CHANNEL);
  log.info({ channel: CHANNEL }, 'Subscribed to anomaly notifications');

  return async () => {
    await sub.unsubscribe(CHANNEL).catch(() => {});
    await sub.quit().catch(() => {});
    log.info('Anomaly subscriber disconnected');
  };
}
