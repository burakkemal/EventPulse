/* ------------------------------------------------------------------ */
/*  Panel 5: System Health                                             */
/*  Status indicators for API, Redis, Database, Worker                 */
/* ------------------------------------------------------------------ */

import { useDashboard } from '../../store/index.js';

interface StatusDot {
  label: string;
  status: 'ok' | 'degraded' | 'unknown';
}

const DOT_COLORS: Record<string, string> = {
  ok: '#22c55e',
  degraded: '#ef4444',
  unknown: '#94a3b8',
};

export function SystemHealth() {
  const { state } = useDashboard();
  const h = state.health;

  const indicators: StatusDot[] = [
    { label: 'API', status: h ? 'ok' : 'unknown' },
    { label: 'Redis', status: h ? h.status : 'unknown' },
    { label: 'Database', status: h ? 'ok' : 'unknown' },
    { label: 'Worker', status: 'unknown' },
  ];

  return (
    <div className="panel panel-compact">
      <h3>System Health</h3>
      <div className="health-grid">
        {indicators.map((ind) => (
          <div key={ind.label} className="health-item">
            <span
              className="health-dot"
              style={{ background: DOT_COLORS[ind.status] ?? '#94a3b8' }}
            />
            <span className="health-label">{ind.label}</span>
            <span className="health-status" style={{ color: DOT_COLORS[ind.status] ?? '#94a3b8' }}>
              {ind.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
