/* ------------------------------------------------------------------ */
/*  Panel 1: Throughput Chart                                          */
/*  Line chart — events/sec over the selected window, grouped by type  */
/* ------------------------------------------------------------------ */

import { useDashboard } from '../../store/index.js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function ThroughputChart() {
  const { state } = useDashboard();
  const metrics = state.metrics;

  if (!metrics || metrics.metrics.length === 0) {
    return (
      <div className="panel">
        <h3>Throughput (events/sec)</h3>
        <p className="muted">No data available</p>
      </div>
    );
  }

  const data = metrics.metrics.map((m) => ({
    name: m.key,
    rate: m.rate_per_sec,
    count: m.count,
  }));

  return (
    <div className="panel">
      <h3>Throughput (events/sec) — {metrics.window_seconds}s window</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Bar dataKey="rate" name="rate/sec" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
