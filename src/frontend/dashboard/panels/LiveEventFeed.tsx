/* ------------------------------------------------------------------ */
/*  Panel 6: Live Event Feed                                           */
/*  Scrollable feed of recent events, newest first.                    */
/*  Expandable payload JSON per row.                                   */
/* ------------------------------------------------------------------ */

import { useState } from 'react';
import { useDashboard } from '../../store/index.js';

export function LiveEventFeed() {
  const { state } = useDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const events = state.events;

  return (
    <div className="panel">
      <h3>Live Event Feed ({events.length})</h3>
      {events.length === 0 ? (
        <p className="muted">No events in selected window</p>
      ) : (
        <div className="feed-scroll">
          {events.map((ev) => (
            <div key={ev.event_id} className="feed-row">
              <div className="feed-header" onClick={() => toggle(ev.event_id)} style={{ cursor: 'pointer' }}>
                <span className="feed-time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                <span className="feed-type">{ev.event_type}</span>
                <span className="feed-source">{ev.source}</span>
                <span className="feed-expand">{expanded.has(ev.event_id) ? '▾' : '▸'}</span>
              </div>
              {expanded.has(ev.event_id) && (
                <pre className="json-pre">{JSON.stringify(ev.payload, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
