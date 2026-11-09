import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAnalytics, type AnalyticsResponse } from '../api/client';
import {
  cmToInches,
  endOfLocalDayIso,
  formatInches,
  startOfLocalDayIso,
  TANK_HEIGHT_INCHES,
  toDateInputValue,
} from '../utils/units';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInputValue(d);
}

export function AnalyticsPage() {
  const [fromDate, setFromDate] = useState(daysAgo(6));
  const [toDate, setToDate] = useState(toDateInputValue());
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(from: string, to: string) {
    setLoading(true);
    try {
      const analytics = await fetchAnalytics(startOfLocalDayIso(from), endOfLocalDayIso(to));
      setData(analytics);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(fromDate, toDate);
  }, [fromDate, toDate]);

  const hourly = (data?.hourly ?? []).map((h) => ({
    label: new Date(h.hour).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }),
    tank1: Number(cmToInches(h.tank1_avg).toFixed(2)),
    tank2: Number(cmToInches(h.tank2_avg).toFixed(2)),
  }));

  const daily = (data?.daily ?? []).map((d) => ({
    label: new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tank1Min: Number(cmToInches(d.tank1_min).toFixed(2)),
    tank1Max: Number(cmToInches(d.tank1_max).toFixed(2)),
    tank2Min: Number(cmToInches(d.tank2_min).toFixed(2)),
    tank2Max: Number(cmToInches(d.tank2_max).toFixed(2)),
  }));

  const summary = data?.summary;

  return (
    <>
      <section className="panel">
        <h2>Analytics</h2>
        <p className="lead">Server-side trends across a date range — averages, extremes, and low-level share.</p>

        <div className="toolbar">
          <label>
            From
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading}
            onClick={() => void load(fromDate, toDate)}
          >
            {loading ? 'Loading…' : 'Apply range'}
          </button>
        </div>

        {error && <div className="status-error">{error}</div>}

        <div className="stats">
          <div className="stat">
            <div className="label">Readings</div>
            <div className="value">{summary?.totalReadings ?? 0}</div>
          </div>
          <div className="stat">
            <div className="label">Tank 1 avg</div>
            <div className="value">{formatInches(summary?.tank1.avg)} in</div>
          </div>
          <div className="stat">
            <div className="label">Tank 2 avg</div>
            <div className="value">{formatInches(summary?.tank2.avg)} in</div>
          </div>
          <div className="stat">
            <div className="label">Tank 1 low share</div>
            <div className="value">{((summary?.tank1.lowShare ?? 0) * 100).toFixed(0)}%</div>
          </div>
          <div className="stat">
            <div className="label">Tank 2 low share</div>
            <div className="value">{((summary?.tank2.lowShare ?? 0) * 100).toFixed(0)}%</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Hourly trend</h2>
        <p className="lead">Average level per hour across the selected range.</p>
        <div className="chart-box">
          {hourly.length === 0 ? (
            <div className="empty">No readings in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis dataKey="label" minTickGap={28} />
                <YAxis domain={[0, TANK_HEIGHT_INCHES]} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="tank1" name="Tank 1 (in)" stroke="#1a9bb0" fill="rgba(26,155,176,0.25)" />
                <Area type="monotone" dataKey="tank2" name="Tank 2 (in)" stroke="#d97706" fill="rgba(217,119,6,0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Daily min / max</h2>
        <p className="lead">Daily extremes for each tank.</p>
        <div className="chart-box">
          {daily.length === 0 ? (
            <div className="empty">No readings in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, TANK_HEIGHT_INCHES]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="tank1Min" name="Tank 1 min" fill="#0e6f82" />
                <Bar dataKey="tank1Max" name="Tank 1 max" fill="#1a9bb0" />
                <Bar dataKey="tank2Min" name="Tank 2 min" fill="#b45309" />
                <Bar dataKey="tank2Max" name="Tank 2 max" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </>
  );
}
