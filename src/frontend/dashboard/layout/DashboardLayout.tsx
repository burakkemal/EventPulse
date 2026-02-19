/* ------------------------------------------------------------------ */
/*  Main dashboard layout — responsive grid                            */
/* ------------------------------------------------------------------ */

import { useDashboard } from '../../store/index.js';
import { Toolbar } from './Toolbar.js';
import { ThroughputChart } from '../charts/ThroughputChart.js';
import { ErrorRateGauge } from '../charts/ErrorRateGauge.js';
import { TopEventsTable } from '../panels/TopEventsTable.js';
import { AnomalyTimeline } from '../panels/AnomalyTimeline.js';
import { SystemHealth } from '../panels/SystemHealth.js';
import { LiveEventFeed } from '../panels/LiveEventFeed.js';

export function DashboardLayout() {
  const { state } = useDashboard();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>EventPulse Dashboard</h1>
        {state.error && <div className="error-banner">Error: {state.error}</div>}
      </header>

      <Toolbar />

      <div className="grid-main">
        {/* Row 1: charts + gauge + health */}
        <div className="grid-row-top">
          <div className="col-chart">
            <ThroughputChart />
          </div>
          <div className="col-sidebar">
            <ErrorRateGauge />
            <SystemHealth />
          </div>
        </div>

        {/* Row 2: table + timeline */}
        <div className="grid-row-mid">
          <TopEventsTable />
          <AnomalyTimeline />
        </div>

        {/* Row 3: feed */}
        <div className="grid-row-bot">
          <LiveEventFeed />
        </div>
      </div>
    </div>
  );
}
