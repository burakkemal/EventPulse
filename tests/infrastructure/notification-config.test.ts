import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadNotificationConfig, DEFAULT_CONFIG } from '../../src/infrastructure/notifications/config.js';

const TMP_DIR = join(process.cwd(), '.tmp-test-config');

function writeTmpYaml(content: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, 'notifications.yaml');
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('loadNotificationConfig', () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('returns defaults when file does not exist', () => {
    const config = loadNotificationConfig('/nonexistent/path.yaml');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults for empty file', () => {
    const path = writeTmpYaml('');
    const config = loadNotificationConfig(path);
    expect(config.websocket.enabled).toBe(true);
    expect(config.slack.enabled).toBe(false);
    expect(config.email.enabled).toBe(false);
  });

  it('parses websocket enabled=true', () => {
    const path = writeTmpYaml('websocket:\n  enabled: true\n');
    const config = loadNotificationConfig(path);
    expect(config.websocket.enabled).toBe(true);
  });

  it('parses websocket enabled=false', () => {
    const path = writeTmpYaml('websocket:\n  enabled: false\n');
    const config = loadNotificationConfig(path);
    expect(config.websocket.enabled).toBe(false);
  });

  it('parses slack config', () => {
    const path = writeTmpYaml(
      'slack:\n  enabled: true\n  webhook_url: "https://hooks.slack.com/test"\n',
    );
    const config = loadNotificationConfig(path);
    expect(config.slack.enabled).toBe(true);
    expect(config.slack.webhook_url).toBe('https://hooks.slack.com/test');
  });

  it('parses email config with empty recipients', () => {
    const path = writeTmpYaml(
      'email:\n  enabled: true\n  smtp_host: "smtp.example.com"\n  recipients: []\n',
    );
    const config = loadNotificationConfig(path);
    expect(config.email.enabled).toBe(true);
    expect(config.email.smtp_host).toBe('smtp.example.com');
    expect(config.email.recipients).toEqual([]);
  });

  it('uses defaults for missing sections', () => {
    const path = writeTmpYaml('websocket:\n  enabled: false\n');
    const config = loadNotificationConfig(path);
    // Slack and email should get defaults
    expect(config.slack.enabled).toBe(false);
    expect(config.email.enabled).toBe(false);
  });

  it('full config parse', () => {
    const yaml = [
      'websocket:',
      '  enabled: true',
      '',
      'slack:',
      '  enabled: false',
      '  webhook_url: ""',
      '',
      'email:',
      '  enabled: false',
      '  smtp_host: ""',
      '  recipients: []',
    ].join('\n');
    const path = writeTmpYaml(yaml);
    const config = loadNotificationConfig(path);
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
