/* ------------------------------------------------------------------ */
/*  Tests for src/frontend/api/client.ts                               */
/*  Verifies URL construction and error handling.                      */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// We test the module by importing AFTER mocking fetch
const {
  fetchEvents,
  fetchEvent,
  fetchAnomalies,
  fetchMetrics,
  fetchHealth,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = await import('../../src/frontend/api/client.js');

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) };
}

function fail(status: number) {
  return { ok: false, status, statusText: 'Not Found', json: () => Promise.resolve({}) };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('fetchEvents', () => {
  it('builds URL with no params', async () => {
    fetchMock.mockResolvedValue(ok({ data: [], pagination: { limit: 50, offset: 0, count: 0 } }));
    await fetchEvents();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/events');
  });

  it('builds URL with all params', async () => {
    fetchMock.mockResolvedValue(ok({ data: [], pagination: { limit: 10, offset: 5, count: 0 } }));
    await fetchEvents({ limit: 10, offset: 5, event_type: 'cpu_spike', source: 'web-01', from: '2026-01-01T00:00:00Z' });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/v1/events?');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
    expect(url).toContain('event_type=cpu_spike');
    expect(url).toContain('source=web-01');
    expect(url).toContain('from=');
  });

  it('throws on non-OK response', async () => {
    fetchMock.mockResolvedValue(fail(500));
    await expect(fetchEvents()).rejects.toThrow('API 500');
  });
});

describe('fetchEvent', () => {
  it('fetches single event by ID', async () => {
    const ev = { event_id: 'abc', event_type: 'x', source: 's', timestamp: '', payload: {}, metadata: {} };
    fetchMock.mockResolvedValue(ok(ev));
    const result = await fetchEvent('abc');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/events/abc');
    expect(result.event_id).toBe('abc');
  });
});

describe('fetchAnomalies', () => {
  it('builds URL with severity filter', async () => {
    fetchMock.mockResolvedValue(ok({ data: [], pagination: { limit: 50, offset: 0, count: 0 } }));
    await fetchAnomalies({ severity: 'critical' });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('severity=critical');
  });
});

describe('fetchMetrics', () => {
  it('builds URL with window_seconds and group_by', async () => {
    fetchMock.mockResolvedValue(ok({ window_seconds: 60, group_by: 'event_type', from: '', to: '', metrics: [] }));
    await fetchMetrics({ window_seconds: 300, group_by: 'source' });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('window_seconds=300');
    expect(url).toContain('group_by=source');
  });
});

describe('fetchHealth', () => {
  it('calls health endpoint', async () => {
    fetchMock.mockResolvedValue(ok({ status: 'ok', redis: 'PONG' }));
    const result = await fetchHealth();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/events/health');
    expect(result.status).toBe('ok');
  });
});
