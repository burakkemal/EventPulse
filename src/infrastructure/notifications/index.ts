export { loadNotificationConfig, DEFAULT_CONFIG } from './config.js';
export type { NotificationConfig } from './config.js';
export { sendSlackNotification } from './slack.js';
export { sendEmailNotification } from './email.js';
export { createNotificationDispatcher } from './dispatcher.js';
