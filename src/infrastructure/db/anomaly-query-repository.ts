import { eq, and, desc, type SQL } from 'drizzle-orm';
import type { Database } from './client.js';
import { anomalies } from './schema.js';

export interface AnomalyQueryFilters {
  rule_id?: string;
  severity?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Fetches a paginated, filtered list of anomalies.
 * Default ordering: newest first (detected_at DESC).
 */
export async function queryAnomalies(
  db: Database,
  filters: AnomalyQueryFilters,
  pagination: PaginationParams,
) {
  const conditions: SQL[] = [];

  if (filters.rule_id !== undefined) {
    conditions.push(eq(anomalies.rule_id, filters.rule_id));
  }
  if (filters.severity !== undefined) {
    conditions.push(eq(anomalies.severity, filters.severity));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(anomalies)
    .where(whereClause)
    .orderBy(desc(anomalies.detected_at))
    .limit(pagination.limit)
    .offset(pagination.offset);

  return rows;
}
