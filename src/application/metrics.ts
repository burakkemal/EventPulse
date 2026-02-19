import type { Database } from '../infrastructure/db/index.js';
import { queryMetrics } from '../infrastructure/db/index.js';

const DEFAULT_WINDOW = 60;
const MIN_WINDOW = 10;
const MAX_WINDOW = 3600;

const VALID_GROUP_BY = ['event_type', 'source'] as const;
type GroupBy = (typeof VALID_GROUP_BY)[number];

export interface GetMetricsParams {
  window_seconds?: number;
  group_by?: string;
  event_type?: string;
  source?: string;
}

export interface MetricsResult {
  window_seconds: number;
  group_by: string;
  from: string;
  to: string;
  metrics: Array<{
    key: string;
    count: number;
    rate_per_sec: number;
  }>;
}

/**
 * Clamps and validates `window_seconds`.
 * Returns the clamped value or `null` if the input is invalid (not a finite integer).
 */
export function resolveWindow(raw: number | undefined): number | null {
  if (raw === undefined) return DEFAULT_WINDOW;
  if (!Number.isFinite(raw) || raw !== Math.floor(raw)) return null;
  return Math.min(Math.max(raw, MIN_WINDOW), MAX_WINDOW);
}

/**
 * Validates `group_by` against the allowed enum.
 * Returns the validated value or `null` if invalid.
 */
export function resolveGroupBy(raw: string | undefined): GroupBy | null {
  if (raw === undefined) return 'event_type';
  if ((VALID_GROUP_BY as readonly string[]).includes(raw)) return raw as GroupBy;
  return null;
}

/**
 * Use case: compute event count metrics grouped by event_type or source
 * within a sliding time window.
 *
 * Queries only the `events` table. Rate is derived as count / window_seconds.
 */
export async function getMetrics(
  db: Database,
  params: GetMetricsParams,
): Promise<MetricsResult> {
  const window_seconds = resolveWindow(params.window_seconds) ?? DEFAULT_WINDOW;
  const group_by = resolveGroupBy(params.group_by) ?? 'event_type';

  const to = new Date();
  const from = new Date(to.getTime() - window_seconds * 1000);

  const buckets = await queryMetrics(db, {
    from,
    to,
    group_by,
    event_type: params.event_type,
    source: params.source,
  });

  return {
    window_seconds,
    group_by,
    from: from.toISOString(),
    to: to.toISOString(),
    metrics: buckets.map((b) => ({
      key: b.key,
      count: b.count,
      rate_per_sec: parseFloat((b.count / window_seconds).toFixed(4)),
    })),
  };
}
