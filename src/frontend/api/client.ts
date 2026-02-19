/* ------------------------------------------------------------------ */
/*  API client — thin fetch wrapper for all EventPulse REST endpoints  */
/*                                                                     */
/*  All fetch calls are centralized here. Components never call fetch   */
/*  directly.                                                          */
/* ------------------------------------------------------------------ */

import type {
  EventRow,
  AnomalyRow,
  MetricsResponse,
  HealthResponse,
  Paginated,
} from './types.js';

const BASE = '/api/v1';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/* ── Events ────────────────────────────────────────────────────── */

export interface FetchEventsParams {
  limit?: number;
  offset?: number;
  event_type?: string;
  source?: string;
  from?: string;
  to?: string;
}

export function fetchEvents(p: FetchEventsParams = {}): Promise<Paginated<EventRow>> {
  const qs = new URLSearchParams();
  if (p.limit !== undefined) qs.set('limit', String(p.limit));
  if (p.offset !== undefined) qs.set('offset', String(p.offset));
  if (p.event_type) qs.set('event_type', p.event_type);
  if (p.source) qs.set('source', p.source);
  if (p.from) qs.set('from', p.from);
  if (p.to) qs.set('to', p.to);
  const q = qs.toString();
  return get<Paginated<EventRow>>(`/events${q ? `?${q}` : ''}`);
}

export function fetchEvent(id: string): Promise<EventRow> {
  return get<EventRow>(`/events/${id}`);
}

/* ── Anomalies ─────────────────────────────────────────────────── */

export interface FetchAnomaliesParams {
  limit?: number;
  offset?: number;
  rule_id?: string;
  severity?: string;
}

export function fetchAnomalies(p: FetchAnomaliesParams = {}): Promise<Paginated<AnomalyRow>> {
  const qs = new URLSearchParams();
  if (p.limit !== undefined) qs.set('limit', String(p.limit));
  if (p.offset !== undefined) qs.set('offset', String(p.offset));
  if (p.rule_id) qs.set('rule_id', p.rule_id);
  if (p.severity) qs.set('severity', p.severity);
  const q = qs.toString();
  return get<Paginated<AnomalyRow>>(`/anomalies${q ? `?${q}` : ''}`);
}

/* ── Metrics ───────────────────────────────────────────────────── */

export interface FetchMetricsParams {
  window_seconds?: number;
  group_by?: 'event_type' | 'source';
  event_type?: string;
  source?: string;
}

export function fetchMetrics(p: FetchMetricsParams = {}): Promise<MetricsResponse> {
  const qs = new URLSearchParams();
  if (p.window_seconds !== undefined) qs.set('window_seconds', String(p.window_seconds));
  if (p.group_by) qs.set('group_by', p.group_by);
  if (p.event_type) qs.set('event_type', p.event_type);
  if (p.source) qs.set('source', p.source);
  const q = qs.toString();
  return get<MetricsResponse>(`/metrics${q ? `?${q}` : ''}`);
}

/* ── Health ─────────────────────────────────────────────────────── */

export function fetchHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/events/health');
}
