/* ------------------------------------------------------------------ */
/*  Panel 3: Top Events Table                                          */
/*  Sortable table of event_type | count | rate_per_sec from metrics   */
/* ------------------------------------------------------------------ */

import { useState, useMemo } from 'react';
import { useDashboard } from '../../store/index.js';
import type { MetricBucket } from '../../api/types.js';

type SortKey = 'key' | 'count' | 'rate_per_sec';

export function TopEventsTable() {
  const { state } = useDashboard();
  const [sortBy, setSortBy] = useState<SortKey>('count');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const rows = [...(state.metrics?.metrics ?? [])];
    rows.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === 'string' && typeof bv === 'string') return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [state.metrics, sortBy, asc]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setAsc(!asc);
    else { setSortBy(key); setAsc(false); }
  }

  function arrow(key: SortKey) {
    if (sortBy !== key) return '';
    return asc ? ' ▲' : ' ▼';
  }

  return (
    <div className="panel">
      <h3>Top Events</h3>
      {sorted.length === 0 ? (
        <p className="muted">No metric data</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('key')} style={{ cursor: 'pointer' }}>
                Event Type{arrow('key')}
              </th>
              <th onClick={() => toggleSort('count')} style={{ cursor: 'pointer' }}>
                Count{arrow('count')}
              </th>
              <th onClick={() => toggleSort('rate_per_sec')} style={{ cursor: 'pointer' }}>
                Rate/sec{arrow('rate_per_sec')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                <td>{row.count.toLocaleString()}</td>
                <td>{row.rate_per_sec.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
