import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ESM-safe mock: vi.mock is hoisted above imports by Vitest.
 * We mock the entire infrastructure/db barrel so queryEvents and
 * findEventById are replaced with controllable stubs.
 */
vi.mock('../../src/infrastructure/db/index.js', () => ({
  queryEvents: vi.fn(),
  findEventById: vi.fn(),
}));

import { listEvents, getEvent } from '../../src/application/query-events.js';
import { queryEvents, findEventById } from '../../src/infrastructure/db/index.js';

const mockQueryEvents = vi.mocked(queryEvents);
const mockFindEventById = vi.mocked(findEventById);

/** Placeholder — use cases only need `db` as an opaque token passed through. */
const db = {} as Parameters<typeof listEvents>[0];

const SAMPLE_ROW = {
  event_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  event_type: 'page_view',
  source: 'web',
  timestamp: new Date('2026-02-18T12:00:00Z'),
  payload: { url: '/home' },
  metadata: {},
  created_at: new Date('2026-02-18T12:00:01Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryEvents.mockResolvedValue([]);
});

// ─── listEvents ──────────────────────────────────────────────

describe('listEvents', () => {
  // --- defaults ---

  it('uses default limit=50, offset=0 when params omitted', async () => {
    await listEvents(db, {});

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      { limit: 50, offset: 0 },
    );
  });

  // --- limit clamping ---

  it('clamps limit=0 up to 1', async () => {
    await listEvents(db, { limit: 0 });

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('clamps limit=9999 down to 500', async () => {
    await listEvents(db, { limit: 9999 });

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 500 }),
    );
  });

  it('clamps negative limit up to 1', async () => {
    await listEvents(db, { limit: -5 });

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('passes through a valid limit within range', async () => {
    await listEvents(db, { limit: 25 });

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ limit: 25 }),
    );
  });

  // --- offset clamping ---

  it('clamps offset=-10 up to 0', async () => {
    await listEvents(db, { offset: -10 });

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ offset: 0 }),
    );
  });

  it('passes through a positive offset', async () => {
    await listEvents(db, { offset: 100 });

    expect(mockQueryEvents).toHaveBeenCalledWith(
      db,
      {},
      expect.objectContaining({ offset: 100 }),
    );
  });

  // --- filter pass-through ---

  it('passes event_type filter only when provided', async () => {
    await listEvents(db, { event_type: 'click' });

    const [, filters] = mockQueryEvents.mock.calls[0]!;
    expect(filters).toEqual({ event_type: 'click' });
  });

  it('passes source filter only when provided', async () => {
    await listEvents(db, { source: 'mobile' });

    const [, filters] = mockQueryEvents.mock.calls[0]!;
    expect(filters).toEqual({ source: 'mobile' });
  });

  it('passes from/to filters only when provided', async () => {
    await listEvents(db, { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });

    const [, filters] = mockQueryEvents.mock.calls[0]!;
    expect(filters).toEqual({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
  });

  it('omits all filters when none provided', async () => {
    await listEvents(db, {});

    const [, filters] = mockQueryEvents.mock.calls[0]!;
    expect(filters).toEqual({});
  });

  it('passes multiple filters simultaneously', async () => {
    await listEvents(db, { event_type: 'click', source: 'api', from: '2026-01-01T00:00:00Z' });

    const [, filters] = mockQueryEvents.mock.calls[0]!;
    expect(filters).toEqual({ event_type: 'click', source: 'api', from: '2026-01-01T00:00:00Z' });
  });

  // --- return shape ---

  it('returns { data, pagination } with count === data.length', async () => {
    mockQueryEvents.mockResolvedValue([SAMPLE_ROW, SAMPLE_ROW]);

    const result = await listEvents(db, { limit: 10 });

    expect(result).toEqual({
      data: [SAMPLE_ROW, SAMPLE_ROW],
      pagination: { limit: 10, offset: 0, count: 2 },
    });
  });

  it('returns count=0 when no data', async () => {
    mockQueryEvents.mockResolvedValue([]);

    const result = await listEvents(db, {});

    expect(result.pagination.count).toBe(0);
    expect(result.data).toEqual([]);
  });
});

// ─── getEvent ────────────────────────────────────────────────

describe('getEvent', () => {
  it('returns the row when found', async () => {
    mockFindEventById.mockResolvedValue(SAMPLE_ROW);

    const result = await getEvent(db, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(mockFindEventById).toHaveBeenCalledWith(db, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(result).toEqual(SAMPLE_ROW);
  });

  it('returns null when not found', async () => {
    mockFindEventById.mockResolvedValue(undefined);

    const result = await getEvent(db, 'nonexistent-id');

    expect(result).toBeNull();
  });
});
