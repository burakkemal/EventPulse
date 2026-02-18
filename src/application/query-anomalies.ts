import type { Database } from '../infrastructure/db/index.js';
import { queryAnomalies } from '../infrastructure/db/index.js';
import type { AnomalyQueryFilters } from '../infrastructure/db/index.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface ListAnomaliesParams {
  limit?: number;
  offset?: number;
  rule_id?: string;
  severity?: string;
}

/**
 * Use case: list anomalies with pagination and filters.
 * Clamps limit to [1, 500], defaults to 50.
 */
export async function listAnomalies(db: Database, params: ListAnomaliesParams) {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  const filters: AnomalyQueryFilters = {};
  if (params.rule_id !== undefined) filters.rule_id = params.rule_id;
  if (params.severity !== undefined) filters.severity = params.severity;

  const data = await queryAnomalies(db, filters, { limit, offset });

  return {
    data,
    pagination: { limit, offset, count: data.length },
  };
}
