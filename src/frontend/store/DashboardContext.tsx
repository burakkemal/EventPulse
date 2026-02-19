/* ------------------------------------------------------------------ */
/*  Central client-side event store (React Context)                    */
/*                                                                     */
/*  Holds all dashboard data fetched via REST and (future) pushed via  */
/*  WebSocket.  Components consume via useDashboard().                 */
/* ------------------------------------------------------------------ */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

import type {
  EventRow,
  AnomalyRow,
  MetricsResponse,
  HealthResponse,
} from '../api/types.js';

import {
  fetchEvents,
  fetchAnomalies,
  fetchMetrics,
  fetchHealth,
} from '../api/client.js';

import { connect, subscribe, disconnect } from '../realtime/socket.js';

/* ── Types ─────────────────────────────────────────────────────── */

export type TimeRange = '15m' | '1h' | '6h' | '24h' | 'custom';

export interface Filters {
  event_type?: string;
  source?: string;
  severity?: string;
}

interface DashboardState {
  events: EventRow[];
  anomalies: AnomalyRow[];
  metrics: MetricsResponse | null;
  health: HealthResponse | null;
  timeRange: TimeRange;
  filters: Filters;
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_EVENTS'; payload: EventRow[] }
  | { type: 'SET_ANOMALIES'; payload: AnomalyRow[] }
  | { type: 'SET_METRICS'; payload: MetricsResponse }
  | { type: 'SET_HEALTH'; payload: HealthResponse }
  | { type: 'SET_TIME_RANGE'; payload: TimeRange }
  | { type: 'SET_FILTERS'; payload: Filters }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'PREPEND_ANOMALY'; payload: AnomalyRow };

const initialState: DashboardState = {
  events: [],
  anomalies: [],
  metrics: null,
  health: null,
  timeRange: '1h',
  filters: {},
  loading: false,
  error: null,
};

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'SET_EVENTS':
      return { ...state, events: action.payload };
    case 'SET_ANOMALIES':
      return { ...state, anomalies: action.payload };
    case 'SET_METRICS':
      return { ...state, metrics: action.payload };
    case 'SET_HEALTH':
      return { ...state, health: action.payload };
    case 'SET_TIME_RANGE':
      return { ...state, timeRange: action.payload };
    case 'SET_FILTERS':
      return { ...state, filters: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'PREPEND_ANOMALY':
      return { ...state, anomalies: [action.payload, ...state.anomalies] };
    default:
      return state;
  }
}

/* ── Helpers ───────────────────────────────────────────────────── */

function timeRangeToSeconds(tr: TimeRange): number {
  switch (tr) {
    case '15m': return 900;
    case '1h':  return 3600;
    case '6h':  return 3600; // metrics max is 3600; we fetch events with from/to
    case '24h': return 3600;
    case 'custom': return 3600;
  }
}

function timeRangeToFrom(tr: TimeRange): string {
  const ms: Record<TimeRange, number> = {
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '24h': 24 * 60 * 60_000,
    'custom': 60 * 60_000,
  };
  return new Date(Date.now() - ms[tr]).toISOString();
}

/* ── Context ───────────────────────────────────────────────────── */

interface DashboardContextValue {
  state: DashboardState;
  refresh: () => void;
  setTimeRange: (tr: TimeRange) => void;
  setFilters: (f: Filters) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadAll = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    const from = timeRangeToFrom(state.timeRange);
    const windowSec = timeRangeToSeconds(state.timeRange);

    try {
      const [eventsRes, anomaliesRes, metricsRes, healthRes] = await Promise.all([
        fetchEvents({
          limit: 100,
          event_type: state.filters.event_type,
          source: state.filters.source,
          from,
        }),
        fetchAnomalies({
          limit: 100,
          severity: state.filters.severity,
        }),
        fetchMetrics({
          window_seconds: windowSec,
          event_type: state.filters.event_type,
          source: state.filters.source,
        }),
        fetchHealth(),
      ]);

      dispatch({ type: 'SET_EVENTS', payload: eventsRes.data });
      dispatch({ type: 'SET_ANOMALIES', payload: anomaliesRes.data });
      dispatch({ type: 'SET_METRICS', payload: metricsRes });
      dispatch({ type: 'SET_HEALTH', payload: healthRes });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.timeRange, state.filters]);

  // Initial load + re-load on filter/timeRange changes
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => void loadAll(), 30_000);
    return () => clearInterval(id);
  }, [loadAll]);

  // WebSocket adapter — connect and subscribe to future real-time pushes
  useEffect(() => {
    connect();
    const unsub = subscribe((msg) => {
      // When WebSocket is wired, incoming anomalies prepend to state
      dispatch({
        type: 'PREPEND_ANOMALY',
        payload: {
          anomaly_id: msg.anomaly_id,
          rule_id: msg.rule_id,
          event_id: '', // not included in WS payload; fetch if needed
          severity: msg.severity,
          message: msg.message,
          detected_at: msg.detected_at,
        },
      });
    });
    return () => { unsub(); disconnect(); };
  }, []);

  const setTimeRange = useCallback((tr: TimeRange) => {
    dispatch({ type: 'SET_TIME_RANGE', payload: tr });
  }, []);

  const setFilters = useCallback((f: Filters) => {
    dispatch({ type: 'SET_FILTERS', payload: f });
  }, []);

  return (
    <DashboardContext.Provider value={{ state, refresh: loadAll, setTimeRange, setFilters }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider');
  return ctx;
}
