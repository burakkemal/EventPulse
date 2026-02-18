import { eq, and, gte, lte, desc, type SQL } from 'drizzle-orm';
import type { Database } from './client.js';
import { events } from './schema.js';

export interface EventQueryFilters {
  event_type?: string;
  source?: string;
  from?: string;   // ISO-8601, inclusive
  to?: string;     // ISO-8601, inclusive
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Fetches a paginated, filtered list of events.
 *
 * Uses cursor-based offset pagination. Filters build a dynamic
 * WHERE clause — only non-undefined filters are applied.
 * Default ordering: newest first (created_at DESC).
 */
export async function queryEvents(
  db: Database,
  filters: EventQueryFilters,
  pagination: PaginationParams,
) {
  const conditions: SQL[] = [];

  if (filters.event_type !== undefined) {
    conditions.push(eq(events.event_type, filters.event_type));
  }
  if (filters.source !== undefined) {
    conditions.push(eq(events.source, filters.source));
  }
  if (filters.from !== undefined) {
    conditions.push(gte(events.timestamp, new Date(filters.from)));
  }
  if (filters.to !== undefined) {
    conditions.push(lte(events.timestamp, new Date(filters.to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(events)
    .where(whereClause)
    .orderBy(desc(events.created_at))
    .limit(pagination.limit)
    .offset(pagination.offset);

  return rows;
}

/**
 * Fetches a single event by event_id.
 * Returns undefined if not found.
 */
export async function findEventById(
  db: Database,
  eventId: string,
) {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.event_id, eventId))
    .limit(1);

  return rows[0];
}
