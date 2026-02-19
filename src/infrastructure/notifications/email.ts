import type { Logger } from 'pino';
import type { NotificationConfig } from './config.js';
import type { AnomalyNotificationPayload } from '../redis/anomaly-notifier.js';

/**
 * Stub email notification handler.
 *
 * No actual SMTP integration — logs a structured message when enabled.
 * When disabled, logs a skip message at debug level.
 */
export async function sendEmailNotification(
  config: NotificationConfig['email'],
  log: Logger,
  payload: AnomalyNotificationPayload,
): Promise<void> {
  if (!config.enabled) {
    log.debug(
      { rule_id: payload.rule_id, severity: payload.severity },
      'Email notification skipped (disabled)',
    );
    return;
  }

  log.info(
    {
      recipients: config.recipients,
      smtp_host: config.smtp_host,
      anomaly_id: payload.anomaly_id,
      rule_id: payload.rule_id,
      severity: payload.severity,
      message: payload.message,
      detected_at: payload.detected_at,
    },
    'Email notification (stub) — SMTP not implemented',
  );
}
