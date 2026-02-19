import { eq, and, gte, lte, count, type SQL } from 'drizzle-orm';
import type { Database } from './client.js';
import { events } from './schema.js';

export interface MetricsFilters {
  from: Date;
  to: Date;
  group_by: 'event_type' | 'source';
  event_type?: string;
  source?: string;
}

export interface MetricsBucket {
  key: string;
  count: number;
}

/**
 * Queries the `events` table for grouped counts within a time window.
 *
 * Uses an indexed timestamp predicate (`idx_events_timestamp`) to
 * avoid full-table scans. Groups by the requested column and returns
 * raw counts — rate calculation is done in the application layer.
 */
export async function queryMetrics(
  db: Database,
  filters: MetricsFilters,
): Promise<MetricsBucket[]> {
  const conditions: SQL[] = [
    gte(events.timestamp, filters.from),
    lte(events.timestamp, filters.to),
  ];

  if (filters.event_type !== undefined) {
    conditions.push(eq(events.event_type, filters.event_type));
  }
  if (filters.source !== undefined) {
    conditions.push(eq(events.source, filters.source));
  }

  const groupCol = filters.group_by === 'source' ? events.source : events.event_type;

  const rows = await db
    .select({
      key: groupCol,
      count: count(),
    })
    .from(events)
    .where(and(...conditions))
    .groupBy(groupCol);

  return rows.map((r) => ({
    key: r.key,
    count: Number(r.count),
  }));
}
