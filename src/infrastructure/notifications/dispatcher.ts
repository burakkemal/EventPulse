import type { Logger } from 'pino';
import type { NotificationConfig } from './config.js';
import type { AnomalyNotificationPayload } from '../redis/anomaly-notifier.js';
import type { WebSocketServer } from '../../interfaces/ws/websocket-server.js';
import { sendSlackNotification } from './slack.js';
import { sendEmailNotification } from './email.js';

/**
 * Dispatches an anomaly notification to all configured channels.
 *
 * Each channel is invoked independently — a failure in one channel
 * does not prevent others from executing. All errors are caught and logged.
 */
export function createNotificationDispatcher(
  config: NotificationConfig,
  log: Logger,
  wsServer: WebSocketServer | null,
) {
  return (payload: AnomalyNotificationPayload): void => {
    // WebSocket (P0) — synchronous broadcast, no await needed
    if (config.websocket.enabled && wsServer) {
      try {
        wsServer.broadcast(payload);
      } catch (err: unknown) {
        log.warn({ err }, 'WebSocket broadcast failed');
      }
    }

    // Slack (P1) — fire-and-forget
    void sendSlackNotification(config.slack, log, payload).catch((err: unknown) => {
      log.warn({ err }, 'Slack dispatch failed');
    });

    // Email (P1 stub) — fire-and-forget
    void sendEmailNotification(config.email, log, payload).catch((err: unknown) => {
      log.warn({ err }, 'Email dispatch failed');
    });
  };
}
