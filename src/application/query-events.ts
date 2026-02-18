import type { Database } from '../infrastructure/db/index.js';
import { queryEvents, findEventById } from '../infrastructure/db/index.js';
import type { EventQueryFilters } from '../infrastructure/db/index.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface ListEventsParams {
  limit?: number;
  offset?: number;
  event_type?: string;
  source?: string;
  from?: string;
  to?: string;
}

/**
 * Use case: list events with pagination and filters.
 * Clamps limit to [1, 500], defaults to 50.
 */
export async function listEvents(db: Database, params: ListEventsParams) {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  const filters: EventQueryFilters = {};
  if (params.event_type !== undefined) filters.event_type = params.event_type;
  if (params.source !== undefined) filters.source = params.source;
  if (params.from !== undefined) filters.from = params.from;
  if (params.to !== undefined) filters.to = params.to;

  const data = await queryEvents(db, filters, { limit, offset });

  return {
    data,
    pagination: { limit, offset, count: data.length },
  };
}

/**
 * Use case: fetch a single event by ID.
 * Returns null if not found.
 */
export async function getEvent(db: Database, eventId: string) {
  const row = await findEventById(db, eventId);
  return row ?? null;
}
