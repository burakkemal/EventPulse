/* ------------------------------------------------------------------ */
/*  Toolbar: time range selector + filters + refresh                   */
/* ------------------------------------------------------------------ */

import { useState } from 'react';
import { useDashboard, type TimeRange, type Filters } from '../../store/index.js';

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
];

export function Toolbar() {
  const { state, setTimeRange, setFilters, refresh } = useDashboard();
  const [eventType, setEventType] = useState(state.filters.event_type ?? '');
  const [source, setSource] = useState(state.filters.source ?? '');
  const [severity, setSeverity] = useState(state.filters.severity ?? '');

  function applyFilters() {
    const f: Filters = {};
    if (eventType.trim()) f.event_type = eventType.trim();
    if (source.trim()) f.source = source.trim();
    if (severity) f.severity = severity;
    setFilters(f);
  }

  return (
    <div className="toolbar">
      {/* Time range */}
      <div className="toolbar-group">
        <label className="toolbar-label">Range</label>
        <div className="btn-group">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              className={`btn-range ${state.timeRange === tr.value ? 'active' : ''}`}
              onClick={() => setTimeRange(tr.value)}
            >
              {tr.label}
            </button>
          ))}
        </div>
        {(state.timeRange === '6h' || state.timeRange === '24h') && (
          <span className="toolbar-hint">
            Metrics window capped at 3600s; event list uses full range.
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="toolbar-group">
        <label className="toolbar-label">Filters</label>
        <input
          className="toolbar-input"
          placeholder="event_type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
        />
        <input
          className="toolbar-input"
          placeholder="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
        />
        <select
          className="toolbar-input"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button className="btn-apply" onClick={applyFilters}>Apply</button>
      </div>

      {/* Refresh */}
      <button className="btn-refresh" onClick={refresh} disabled={state.loading}>
        {state.loading ? '↻ Loading…' : '↻ Refresh'}
      </button>
    </div>
  );
}
