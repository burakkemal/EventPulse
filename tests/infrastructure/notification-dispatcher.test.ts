import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infrastructure/notifications/slack.js', () => ({
  sendSlackNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/infrastructure/notifications/email.js', () => ({
  sendEmailNotification: vi.fn().mockResolvedValue(undefined),
}));

import { createNotificationDispatcher } from '../../src/infrastructure/notifications/dispatcher.js';
import { sendSlackNotification } from '../../src/infrastructure/notifications/slack.js';
import { sendEmailNotification } from '../../src/infrastructure/notifications/email.js';
import type { AnomalyNotificationPayload } from '../../src/infrastructure/redis/anomaly-notifier.js';
import type { NotificationConfig } from '../../src/infrastructure/notifications/config.js';

const mockSlack = vi.mocked(sendSlackNotification);
const mockEmail = vi.mocked(sendEmailNotification);

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

const defaultConfig: NotificationConfig = {
  websocket: { enabled: true },
  slack: { enabled: false, webhook_url: '' },
  email: { enabled: false, smtp_host: '', recipients: [] },
};

describe('createNotificationDispatcher', () => {
  let log: ReturnType<typeof fakeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    log = fakeLogger();
  });

  it('calls WebSocket broadcast when enabled', () => {
    const mockBroadcast = vi.fn();
    const wsServer = { broadcast: mockBroadcast } as any;
    const dispatch = createNotificationDispatcher(defaultConfig, log, wsServer);

    dispatch(samplePayload);

    expect(mockBroadcast).toHaveBeenCalledWith(samplePayload);
  });

  it('skips WebSocket broadcast when wsServer is null', () => {
    const dispatch = createNotificationDispatcher(defaultConfig, log, null);
    // Should not throw
    dispatch(samplePayload);
  });

  it('skips WebSocket broadcast when disabled', () => {
    const mockBroadcast = vi.fn();
    const wsServer = { broadcast: mockBroadcast } as any;
    const config = { ...defaultConfig, websocket: { enabled: false } };
    const dispatch = createNotificationDispatcher(config, log, wsServer);

    dispatch(samplePayload);

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('calls Slack and Email channels', async () => {
    const dispatch = createNotificationDispatcher(defaultConfig, log, null);
    dispatch(samplePayload);

    // Wait for fire-and-forget promises
    await new Promise((r) => setTimeout(r, 10));

    expect(mockSlack).toHaveBeenCalledWith(defaultConfig.slack, log, samplePayload);
    expect(mockEmail).toHaveBeenCalledWith(defaultConfig.email, log, samplePayload);
  });

  it('catches WebSocket broadcast errors', () => {
    const wsServer = {
      broadcast: vi.fn().mockImplementation(() => { throw new Error('ws fail'); }),
    } as any;
    const dispatch = createNotificationDispatcher(defaultConfig, log, wsServer);

    // Should not throw
    dispatch(samplePayload);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'WebSocket broadcast failed',
    );
  });
});
