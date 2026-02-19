import type { Logger } from 'pino';
import type { NotificationConfig } from './config.js';
import type { AnomalyNotificationPayload } from '../redis/anomaly-notifier.js';

/**
 * Sends (or skips) a Slack notification for an anomaly.
 *
 * If Slack is disabled in config, logs a skip message.
 * If enabled, POSTs a formatted JSON payload to the configured webhook URL.
 * Failures are caught and logged — never crash the notification pipeline.
 */
export async function sendSlackNotification(
  config: NotificationConfig['slack'],
  log: Logger,
  payload: AnomalyNotificationPayload,
): Promise<void> {
  if (!config.enabled) {
    log.debug(
      { rule_id: payload.rule_id, severity: payload.severity },
      'Slack notification skipped (disabled)',
    );
    return;
  }

  if (!config.webhook_url) {
    log.warn('Slack enabled but webhook_url is empty, skipping');
    return;
  }

  try {
    const body = JSON.stringify({
      text: `*[${payload.severity.toUpperCase()}]* Anomaly detected\n>${payload.message}\nRule: \`${payload.rule_id}\` | Detected: ${payload.detected_at}`,
    });

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.ok) {
      log.info(
        { rule_id: payload.rule_id, severity: payload.severity },
        'Slack notification sent',
      );
    } else {
      log.warn(
        { status: response.status, rule_id: payload.rule_id },
        'Slack webhook returned non-OK status',
      );
    }
  } catch (err: unknown) {
    log.warn({ err, rule_id: payload.rule_id }, 'Failed to send Slack notification');
  }
}
