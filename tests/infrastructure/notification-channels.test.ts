import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSlackNotification } from '../../src/infrastructure/notifications/slack.js';
import { sendEmailNotification } from '../../src/infrastructure/notifications/email.js';
import type { AnomalyNotificationPayload } from '../../src/infrastructure/redis/anomaly-notifier.js';

function fakeLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as import('pino').Logger;
}

const samplePayload: AnomalyNotificationPayload = {
  anomaly_id: 'a-001',
  rule_id: 'r-001',
  severity: 'critical',
  message: 'Error burst detected',
  detected_at: '2026-02-19T12:00:00Z',
};

describe('sendSlackNotification', () => {
  let log: ReturnType<typeof fakeLogger>;

  beforeEach(() => {
    log = fakeLogger();
    vi.restoreAllMocks();
  });

  it('logs skip when disabled', async () => {
    await sendSlackNotification({ enabled: false, webhook_url: '' }, log, samplePayload);
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: 'r-001' }),
      'Slack notification skipped (disabled)',
    );
  });

  it('logs warning when enabled but webhook_url empty', async () => {
    await sendSlackNotification({ enabled: true, webhook_url: '' }, log, samplePayload);
    expect(log.warn).toHaveBeenCalledWith('Slack enabled but webhook_url is empty, skipping');
  });

  it('calls fetch when enabled with webhook_url', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await sendSlackNotification(
      { enabled: true, webhook_url: 'https://hooks.slack.com/test' },
      log,
      samplePayload,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith('https://hooks.slack.com/test', expect.objectContaining({
      method: 'POST',
    }));
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: 'r-001' }),
      'Slack notification sent',
    );
  });

  it('handles fetch failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await sendSlackNotification(
      { enabled: true, webhook_url: 'https://hooks.slack.com/test' },
      log,
      samplePayload,
    );

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to send Slack notification',
    );
  });
});

describe('sendEmailNotification', () => {
  let log: ReturnType<typeof fakeLogger>;

  beforeEach(() => {
    log = fakeLogger();
  });

  it('logs skip when disabled', async () => {
    await sendEmailNotification(
      { enabled: false, smtp_host: '', recipients: [] },
      log,
      samplePayload,
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: 'r-001' }),
      'Email notification skipped (disabled)',
    );
  });

  it('logs stub message when enabled', async () => {
    await sendEmailNotification(
      { enabled: true, smtp_host: 'smtp.example.com', recipients: ['admin@example.com'] },
      log,
      samplePayload,
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ['admin@example.com'],
        smtp_host: 'smtp.example.com',
        anomaly_id: 'a-001',
        severity: 'critical',
      }),
      'Email notification (stub) — SMTP not implemented',
    );
  });
});
