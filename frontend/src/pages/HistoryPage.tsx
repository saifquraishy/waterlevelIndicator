import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchHistory, type WaterReading } from '../api/client';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  cmToInches,
  endOfLocalDayIso,
  startOfLocalDayIso,
  TANK_HEIGHT_INCHES,
  toDateInputValue,
} from '../utils/units';

type ViewMode = 'table' | 'chart';

export function HistoryPage() {
  const [date, setDate] = useState(toDateInputValue());
  const [rows, setRows] = useState<WaterReading[]>([]);
  const [view, setView] = useState<ViewMode>('table');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  async function load(selectedDate: string) {
    setLoading(true);
    try {
      const history = await fetchHistory({
        from: startOfLocalDayIso(selectedDate),
        to: endOfLocalDayIso(selectedDate),
      });
      setRows(history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(date);
  }, [date]);

  const chartData = (() => {
    const hourly = new Map<number, { count: number; tank1: number; tank2: number }>();
    for (const row of rows) {
      const hour = new Date(row.timestamp).getHours();
      const entry = hourly.get(hour) ?? { count: 0, tank1: 0, tank2: 0 };
      entry.count += 1;
      entry.tank1 += cmToInches(row.tank1_level);
      entry.tank2 += cmToInches(row.tank2_level);
      hourly.set(hour, entry);
    }
    return [...hourly.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, v]) => ({
        label: `${hour}:00`,
        tank1: Number((v.tank1 / v.count).toFixed(2)),
        tank2: Number((v.tank2 / v.count).toFixed(2)),
      }));
  })();

  return (
    <section className="panel">
      <h2>History</h2>
      <p className="lead">Browse readings for a selected day as a table or hourly chart.</p>

      <div className="toolbar">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="button" disabled={loading} onClick={() => void load(date)}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setView((v) => (v === 'table' ? 'chart' : 'table'))}
        >
          Show {view === 'table' ? 'chart' : 'table'}
        </button>
      </div>

      {error && <div className="status-error">{error}</div>}

      {view === 'table' ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>Tank 1 (in)</th>
                <th>Tank 2 (in)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    No data for this date
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.timestamp}>
                    <td>{new Date(row.timestamp).toLocaleTimeString()}</td>
                    <td>{cmToInches(row.tank1_level).toFixed(1)}</td>
                    <td>{cmToInches(row.tank2_level).toFixed(1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-box">
          {chartData.length === 0 ? (
            <div className="empty">No data for this date</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={
                  isMobile
                    ? { top: 8, right: 8, left: -12, bottom: 8 }
                    : { top: 10, right: 16, left: 0, bottom: 8 }
                }
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis dataKey="label" tick={{ fontSize: isMobile ? 10 : 12 }} />
                <YAxis
                  domain={[0, TANK_HEIGHT_INCHES]}
                  width={isMobile ? 36 : 48}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: isMobile ? 12 : 14 }} />
                <Line type="monotone" dataKey="tank1" name="Tank 1 (in)" stroke="#1a9bb0" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="tank2" name="Tank 2 (in)" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </section>
  );
}
