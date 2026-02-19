import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ESM-safe mock: vi.mock is hoisted above imports by Vitest.
 * We mock the infrastructure/db barrel for queryMetrics.
 */
vi.mock('../../src/infrastructure/db/index.js', () => ({
  queryMetrics: vi.fn(),
}));

import { getMetrics, resolveWindow, resolveGroupBy } from '../../src/application/metrics.js';
import { queryMetrics } from '../../src/infrastructure/db/index.js';

const mockQueryMetrics = vi.mocked(queryMetrics);
const fakeDb = {} as import('../../src/infrastructure/db/index.js').Database;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── resolveWindow ────────────────────────────────────────

describe('resolveWindow', () => {
  it('returns 60 when undefined', () => {
    expect(resolveWindow(undefined)).toBe(60);
  });

  it('returns the value when within range', () => {
    expect(resolveWindow(120)).toBe(120);
  });

  it('clamps below MIN_WINDOW to 10', () => {
    expect(resolveWindow(5)).toBe(10);
  });

  it('clamps above MAX_WINDOW to 3600', () => {
    expect(resolveWindow(9999)).toBe(3600);
  });

  it('returns null for NaN', () => {
    expect(resolveWindow(NaN)).toBeNull();
  });

  it('returns null for non-integer', () => {
    expect(resolveWindow(30.5)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(resolveWindow(Infinity)).toBeNull();
  });
});

// ── resolveGroupBy ───────────────────────────────────────

describe('resolveGroupBy', () => {
  it('returns "event_type" when undefined', () => {
    expect(resolveGroupBy(undefined)).toBe('event_type');
  });

  it('returns "event_type" for valid input', () => {
    expect(resolveGroupBy('event_type')).toBe('event_type');
  });

  it('returns "source" for valid input', () => {
    expect(resolveGroupBy('source')).toBe('source');
  });

  it('returns null for invalid input', () => {
    expect(resolveGroupBy('timestamp')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveGroupBy('')).toBeNull();
  });
});

// ── getMetrics ───────────────────────────────────────────

describe('getMetrics', () => {
  it('uses defaults when no params provided', async () => {
    mockQueryMetrics.mockResolvedValueOnce([]);

    const result = await getMetrics(fakeDb, {});

    expect(result.window_seconds).toBe(60);
    expect(result.group_by).toBe('event_type');
    expect(result.metrics).toEqual([]);
    // from/to should be ISO strings
    expect(new Date(result.from).getTime()).toBeLessThan(new Date(result.to).getTime());
  });

  it('passes filters to repository', async () => {
    mockQueryMetrics.mockResolvedValueOnce([]);

    await getMetrics(fakeDb, {
      window_seconds: 300,
      group_by: 'source',
      event_type: 'error',
      source: 'api',
    });

    expect(mockQueryMetrics).toHaveBeenCalledWith(fakeDb, expect.objectContaining({
      group_by: 'source',
      event_type: 'error',
      source: 'api',
    }));
  });

  it('computes rate_per_sec correctly', async () => {
    mockQueryMetrics.mockResolvedValueOnce([
      { key: 'page_view', count: 120 },
      { key: 'click', count: 30 },
    ]);

    const result = await getMetrics(fakeDb, { window_seconds: 60 });

    expect(result.metrics).toHaveLength(2);
    expect(result.metrics[0]?.rate_per_sec).toBe(2);
    expect(result.metrics[1]?.rate_per_sec).toBe(0.5);
  });

  it('computes rate_per_sec with rounding', async () => {
    mockQueryMetrics.mockResolvedValueOnce([
      { key: 'error', count: 7 },
    ]);

    const result = await getMetrics(fakeDb, { window_seconds: 60 });

    // 7 / 60 = 0.11666... → 0.1167
    expect(result.metrics[0]?.rate_per_sec).toBe(0.1167);
  });

  it('returns correct from/to window', async () => {
    mockQueryMetrics.mockResolvedValueOnce([]);

    const before = Date.now();
    const result = await getMetrics(fakeDb, { window_seconds: 120 });
    const after = Date.now();

    const to = new Date(result.to).getTime();
    const from = new Date(result.from).getTime();

    expect(to - from).toBe(120 * 1000);
    expect(to).toBeGreaterThanOrEqual(before);
    expect(to).toBeLessThanOrEqual(after + 10); // small tolerance
  });

  it('falls back to defaults for invalid window/group_by', async () => {
    mockQueryMetrics.mockResolvedValueOnce([]);

    // resolveWindow(NaN) returns null → fallback to 60
    // resolveGroupBy('bad') returns null → fallback to 'event_type'
    const result = await getMetrics(fakeDb, {
      window_seconds: NaN,
      group_by: 'bad',
    });

    expect(result.window_seconds).toBe(60);
    expect(result.group_by).toBe('event_type');
  });
});
