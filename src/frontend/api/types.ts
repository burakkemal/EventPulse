/* ------------------------------------------------------------------ */
/*  Shared API response types mirroring backend contracts              */
/* ------------------------------------------------------------------ */

/** Single event row from GET /api/v1/events or GET /api/v1/events/:id */
export interface EventRow {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/** Paginated response wrapper */
export interface Paginated<T> {
  data: T[];
  pagination: { limit: number; offset: number; count: number };
}

/** Single anomaly row from GET /api/v1/anomalies */
export interface AnomalyRow {
  anomaly_id: string;
  rule_id: string;
  event_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detected_at: string;
}

/** Single metric bucket from GET /api/v1/metrics */
export interface MetricBucket {
  key: string;
  count: number;
  rate_per_sec: number;
}

/** Full metrics response */
export interface MetricsResponse {
  window_seconds: number;
  group_by: string;
  from: string;
  to: string;
  metrics: MetricBucket[];
}

/** Health check response from GET /api/v1/events/health */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  redis: string;
}
