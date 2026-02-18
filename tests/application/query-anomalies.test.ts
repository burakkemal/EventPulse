import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ESM-safe mock: vi.mock is hoisted above imports by Vitest.
 * We mock the infrastructure/db barrel so queryAnomalies is a stub.
 */
vi.mock('../../src/infrastructure/db/index.js', () => ({
  queryAnomalies: vi.fn(),
}));

import { listAnomalies } from '../../src/application/query-anomalies.js';
import { queryAnomalies } from '../../src/infrastructure/db/index.js';

const mockQueryAnomalies = vi.mocked(queryAnomalies);

/** Placeholder — use cases only need `db` as an opaque token passed through. */
const db = {} as Parameters<typeof listAnomalies>[0];

const SAMPLE_ANOMALY = {
  anomaly_id: '11111111-2222-3333-4444-555555555555',
  event_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  rule_id: 'rate-spike',
  severity: 'high',
  message: 'Rate spike detected from source web',
  detected_at: new Date('2026-02-18T12:01:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryAnomalies.mockResolvedValue([]);
});

describe('listAnomalies', () => {
  // --- defaults ---

  it('uses default limit=50, offset=0 when params omitted', async () => {
    await listAnomalies(db, {});

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      { limit: 50, offset: 0 },
    );
  });

  // --- limit clamping ---

  it('clamps limit=0 up to 1', async () => {
    await listAnomalies(db, { limit: 0 });

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('clamps limit=9999 down to 500', async () => {
    await listAnomalies(db, { limit: 9999 });

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 500 }),
    );
  });

  it('clamps negative limit up to 1', async () => {
    await listAnomalies(db, { limit: -3 });

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('passes through a valid limit within range', async () => {
    await listAnomalies(db, { limit: 75 });

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 75 }),
    );
  });

  // --- offset clamping ---

  it('clamps offset=-10 up to 0', async () => {
    await listAnomalies(db, { offset: -10 });

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ offset: 0 }),
    );
  });

  it('passes through a positive offset', async () => {
    await listAnomalies(db, { offset: 50 });

    expect(mockQueryAnomalies).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ offset: 50 }),
    );
  });

  // --- filter pass-through ---

  it('passes rule_id filter only when provided', async () => {
    await listAnomalies(db, { rule_id: 'rate-spike' });

    const [, filters] = mockQueryAnomalies.mock.calls[0]!;
    expect(filters).toEqual({ rule_id: 'rate-spike' });
  });

  it('passes severity filter only when provided', async () => {
    await listAnomalies(db, { severity: 'high' });

    const [, filters] = mockQueryAnomalies.mock.calls[0]!;
    expect(filters).toEqual({ severity: 'high' });
  });

  it('passes both filters when both provided', async () => {
    await listAnomalies(db, { rule_id: 'timestamp-drift', severity: 'low' });

    const [, filters] = mockQueryAnomalies.mock.calls[0]!;
    expect(filters).toEqual({ rule_id: 'timestamp-drift', severity: 'low' });
  });

  it('omits all filters when none provided', async () => {
    await listAnomalies(db, {});

    const [, filters] = mockQueryAnomalies.mock.calls[0]!;
    expect(filters).toEqual({});
  });

  // --- return shape ---

  it('returns { data, pagination } with count === data.length', async () => {
    mockQueryAnomalies.mockResolvedValue([SAMPLE_ANOMALY, SAMPLE_ANOMALY, SAMPLE_ANOMALY]);

    const result = await listAnomalies(db, { limit: 10 });

    expect(result).toEqual({
      data: [SAMPLE_ANOMALY, SAMPLE_ANOMALY, SAMPLE_ANOMALY],
      pagination: { limit: 10, offset: 0, count: 3 },
    });
  });

  it('returns count=0 when no data', async () => {
    mockQueryAnomalies.mockResolvedValue([]);

    const result = await listAnomalies(db, {});

    expect(result.pagination.count).toBe(0);
    expect(result.data).toEqual([]);
  });
});
