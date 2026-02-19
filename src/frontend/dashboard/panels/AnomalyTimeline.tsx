/* ------------------------------------------------------------------ */
/*  Panel 4: Anomaly Timeline                                          */
/*  Scatter-style timeline of anomalies. Click → fetch event detail.   */
/* ------------------------------------------------------------------ */

import { useState, useCallback } from 'react';
import { useDashboard } from '../../store/index.js';
import { fetchEvent } from '../../api/client.js';
import type { EventRow, AnomalyRow } from '../../api/types.js';

const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

export function AnomalyTimeline() {
  const { state } = useDashboard();
  const [selected, setSelected] = useState<AnomalyRow | null>(null);
  const [eventDetail, setEventDetail] = useState<EventRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleClick = useCallback(async (anomaly: AnomalyRow) => {
    setSelected(anomaly);
    setEventDetail(null);
    if (!anomaly.event_id) return;
    setLoadingDetail(true);
    try {
      const ev = await fetchEvent(anomaly.event_id);
      setEventDetail(ev);
    } catch {
      // Event may have been deleted
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const anomalies = state.anomalies;

  return (
    <div className="panel">
      <h3>Anomaly Timeline ({anomalies.length})</h3>

      {anomalies.length === 0 ? (
        <p className="muted">No anomalies detected</p>
      ) : (
        <div className="timeline-container">
          <div className="timeline-track">
            {anomalies.map((a) => (
              <button
                key={a.anomaly_id}
                className="timeline-dot"
                title={`${a.severity}: ${a.message}`}
                style={{ background: SEV_COLORS[a.severity] ?? '#94a3b8' }}
                onClick={() => void handleClick(a)}
              />
            ))}
          </div>

          {/* Severity legend */}
          <div className="legend">
            {Object.entries(SEV_COLORS).map(([sev, col]) => (
              <span key={sev} className="legend-item">
                <span className="legend-dot" style={{ background: col }} /> {sev}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="detail-panel">
          <div className="detail-header">
            <span
              className="severity-badge"
              style={{ background: SEV_COLORS[selected.severity] ?? '#94a3b8' }}
            >
              {selected.severity}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>{selected.detected_at}</span>
            <button className="close-btn" onClick={() => setSelected(null)}>×</button>
          </div>
          <p style={{ margin: '8px 0' }}>{selected.message}</p>
          <div className="muted" style={{ fontSize: 12 }}>
            Rule: {selected.rule_id}
          </div>

          {loadingDetail && <p className="muted">Loading event…</p>}
          {eventDetail && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>Event Detail</summary>
              <pre className="json-pre">{JSON.stringify(eventDetail, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
