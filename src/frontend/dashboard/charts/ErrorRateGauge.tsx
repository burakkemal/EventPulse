/* ------------------------------------------------------------------ */
/*  Panel 2: Error Rate Gauge                                          */
/*  Computed as error_events / total_events from metrics.               */
/*  Green <1% | Yellow <5% | Red >=5%                                  */
/* ------------------------------------------------------------------ */

import { useDashboard } from '../../store/index.js';

function classifyColor(pct: number): { color: string; label: string } {
  if (pct < 1) return { color: '#22c55e', label: 'Healthy' };
  if (pct < 5) return { color: '#eab308', label: 'Warning' };
  return { color: '#ef4444', label: 'Critical' };
}

export function ErrorRateGauge() {
  const { state } = useDashboard();
  const metrics = state.metrics;

  if (!metrics || metrics.metrics.length === 0) {
    return (
      <div className="panel panel-compact">
        <h3>Error Rate</h3>
        <p className="muted">No data</p>
      </div>
    );
  }

  const total = metrics.metrics.reduce((sum, m) => sum + m.count, 0);
  const errorCount = metrics.metrics
    .filter((m) => m.key.toLowerCase().includes('error') || m.key.toLowerCase().includes('fail'))
    .reduce((sum, m) => sum + m.count, 0);

  const pct = total > 0 ? (errorCount / total) * 100 : 0;
  const { color, label } = classifyColor(pct);

  return (
    <div className="panel panel-compact">
      <h3>Error Rate</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: `6px solid ${color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
        </div>
        <div>
          <div style={{ color, fontWeight: 600, fontSize: 14 }}>{label}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {errorCount} errors / {total} total
          </div>
        </div>
      </div>
    </div>
  );
}
