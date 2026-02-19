import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Notification channel configuration loaded from YAML.
 */
export interface NotificationConfig {
  websocket: { enabled: boolean };
  slack: { enabled: boolean; webhook_url: string };
  email: { enabled: boolean; smtp_host: string; recipients: string[] };
}

/**
 * Default configuration — WebSocket enabled, Slack/Email disabled.
 */
export const DEFAULT_CONFIG: NotificationConfig = {
  websocket: { enabled: true },
  slack: { enabled: false, webhook_url: '' },
  email: { enabled: false, smtp_host: '', recipients: [] },
};

/**
 * Minimal YAML parser for the flat notification config structure.
 *
 * Handles only the subset of YAML used in config/notifications.yaml:
 * top-level keys with indented scalar and array values.
 * Not a general-purpose YAML parser — intentionally limited.
 */
function parseSimpleYaml(content: string): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  let currentSection = '';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '' || line.startsWith('#')) continue;

    // Top-level key (no leading whitespace)
    if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
      currentSection = line.split(':')[0]!.trim();
      result[currentSection] = {};
      continue;
    }

    // Indented key-value under current section
    if (currentSection && line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      let value: unknown = line.slice(colonIdx + 1).trim();

      // Handle YAML array value: "[]" → empty array
      if (value === '[]') {
        value = [];
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (value === '""' || value === "''") {
        value = '';
      } else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      result[currentSection]![key] = value;
    }

    // Handle YAML array items: "  - item"
    if (currentSection && line.trim().startsWith('- ')) {
      // Find the last key that was set to an array
      const section = result[currentSection]!;
      const lastKey = Object.keys(section).at(-1);
      if (lastKey && Array.isArray(section[lastKey])) {
        (section[lastKey] as string[]).push(line.trim().slice(2));
      }
    }
  }

  return result;
}

/**
 * Loads notification configuration from the YAML file.
 *
 * Falls back to DEFAULT_CONFIG if the file is missing or unparseable.
 * Merges loaded values over defaults so missing keys get default values.
 */
export function loadNotificationConfig(
  configPath?: string,
): NotificationConfig {
  const filePath = configPath ?? resolve(process.cwd(), 'config', 'notifications.yaml');

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseSimpleYaml(content);

    const ws = parsed['websocket'] ?? {};
    const slack = parsed['slack'] ?? {};
    const email = parsed['email'] ?? {};

    return {
      websocket: {
        enabled: typeof ws['enabled'] === 'boolean' ? ws['enabled'] : DEFAULT_CONFIG.websocket.enabled,
      },
      slack: {
        enabled: typeof slack['enabled'] === 'boolean' ? slack['enabled'] : DEFAULT_CONFIG.slack.enabled,
        webhook_url: typeof slack['webhook_url'] === 'string' ? slack['webhook_url'] : DEFAULT_CONFIG.slack.webhook_url,
      },
      email: {
        enabled: typeof email['enabled'] === 'boolean' ? email['enabled'] : DEFAULT_CONFIG.email.enabled,
        smtp_host: typeof email['smtp_host'] === 'string' ? email['smtp_host'] : DEFAULT_CONFIG.email.smtp_host,
        recipients: Array.isArray(email['recipients']) ? email['recipients'] as string[] : DEFAULT_CONFIG.email.recipients,
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
