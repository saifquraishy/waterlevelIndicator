import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWaterUtilization } from '../analytics/hooks/useWaterUtilization';
import type { TankId } from '../analytics/types/tank.types';
import { formatInKolkata } from '../analytics/engine/timeKeys';
import { useIsMobile } from '../hooks/useIsMobile';
import { toDateInputValue } from '../utils/units';

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function shiftDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

function fmtL(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(0)} L`;
}

function fmtDur(sec: number): string {
  if (!sec) return '0 min';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export function AnalyticsPage() {
  const today = toDateInputValue();
  const [preset, setPreset] = useState<Preset>('7d');
  const [fromDate, setFromDate] = useState(shiftDate(new Date(), -6));
  const [toDate, setToDate] = useState(today);
  const [tankFilter, setTankFilter] = useState<'both' | TankId>('both');
  const isMobile = useIsMobile();
  const chartMargin = isMobile
    ? { top: 8, right: 8, left: -12, bottom: 8 }
    : { top: 10, right: 16, left: 0, bottom: 8 };
  const tickProps = { fontSize: isMobile ? 10 : 12 };

  const { loading, error, results, tankStore } = useWaterUtilization(fromDate, toDate);

  function applyPreset(p: Preset) {
    setPreset(p);
    const now = new Date();
    if (p === 'today') {
      setFromDate(toDateInputValue(now));
      setToDate(toDateInputValue(now));
    } else if (p === 'yesterday') {
      const y = shiftDate(now, -1);
      setFromDate(y);
      setToDate(y);
    } else if (p === '7d') {
      setFromDate(shiftDate(now, -6));
      setToDate(toDateInputValue(now));
    } else if (p === '30d') {
      setFromDate(shiftDate(now, -29));
      setToDate(toDateInputValue(now));
    }
  }

  const tankIds: TankId[] =
    tankFilter === 'both' ? ['tank1', 'tank2'] : [tankFilter];

  const overview = useMemo(() => {
    let consumption = 0;
    let refill = 0;
    let available = 0;
    let avgDaily = 0;
    let pumps = 0;
    let fillDur = 0;
    let configuredCount = 0;
    for (const id of tankIds) {
      const r = results[id];
      if (!r.configured) continue;
      configuredCount += 1;
      consumption += r.totals.consumptionL;
      refill += r.totals.netRefillL;
      available += r.totals.currentVolumeL ?? 0;
      avgDaily += r.totals.avgDailyConsumptionL;
      pumps += r.totals.pumpActivations;
      fillDur += r.totals.fillingDurationSec;
    }
    return { consumption, refill, available, avgDaily, pumps, fillDur, configuredCount };
  }, [results, tankIds]);

  const hourlyChart = useMemo(() => {
    const map = new Map<string, { label: string; consumption: number; refill: number; t1?: number; t2?: number }>();
    for (const id of tankIds) {
      for (const h of results[id].hourly) {
        const row = map.get(h.hourKey) ?? { label: h.label, consumption: 0, refill: 0 };
        row.consumption += h.consumptionL;
        row.refill += h.netRefillL;
        if (id === 'tank1') row.t1 = h.consumptionL;
        if (id === 'tank2') row.t2 = h.consumptionL;
        map.set(h.hourKey, row);
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [results, tankIds]);

  const dailyTrend = useMemo(() => {
    const map = new Map<string, { day: string; consumption: number; refill: number }>();
    for (const id of tankIds) {
      for (const d of results[id].daily) {
        const row = map.get(d.dayKey) ?? { day: d.dayKey, consumption: 0, refill: 0 };
        row.consumption += d.consumptionL;
        row.refill += d.netRefillL;
        map.set(d.dayKey, row);
      }
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [results, tankIds]);

  const pumpTimeline = useMemo(() => {
    return tankIds
      .flatMap((id) => results[id].pumpEvents.map((e) => ({ ...e, tankName: tankStore.tanks[id].name })))
      .sort((a, b) => b.startTs - a.startTs);
  }, [results, tankIds, tankStore]);

  const insights = useMemo(
    () => tankIds.flatMap((id) => results[id].anomalies).sort((a, b) => b.detectedAt - a.detectedAt),
    [results, tankIds]
  );

  const quality = useMemo(() => {
    let total = 0;
    let valid = 0;
    let invalid = 0;
    let gaps = 0;
    for (const id of tankIds) {
      const q = results[id].quality;
      total += q.totalReadings;
      valid += q.validReadings;
      invalid += q.invalidReadings;
      gaps += q.missingIntervals;
    }
    const coverage = total ? (valid / Math.max(1, total)) * 100 : 0;
    return { total, valid, invalid, gaps, coverage };
  }, [results, tankIds]);

  const anyConfigured = results.tank1.configured || results.tank2.configured;

  return (
    <>
      <section className="panel">
        <h2>Water utilization analytics</h2>
        <p className="lead">
          All metrics are computed in the browser from raw sensor history. Filling activity is inferred
          from rising levels — not confirmed electrical motor status.
        </p>

        <div className="toolbar wrap">
          {(['today', 'yesterday', '7d', '30d', 'custom'] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`btn ${preset === p ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => applyPreset(p)}
            >
              {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <div className="toolbar">
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPreset('custom');
                setFromDate(e.target.value);
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPreset('custom');
                setToDate(e.target.value);
              }}
            />
          </label>
          <label>
            Tanks
            <select
              value={tankFilter}
              onChange={(e) => setTankFilter(e.target.value as 'both' | TankId)}
            >
              <option value="both">Both</option>
              <option value="tank1">{tankStore.tanks.tank1.name}</option>
              <option value="tank2">{tankStore.tanks.tank2.name}</option>
            </select>
          </label>
        </div>

        {loading && <p className="lead">Loading readings…</p>}
        {error && <div className="status-error">{error}</div>}

        {!anyConfigured && (
          <div className="status-error">
            Tank dimensions are not configured. Litre-based analytics are disabled until you complete{' '}
            <Link to="/settings">Settings</Link>.
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Overview</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Estimated consumed</div>
            <div className="value">{fmtL(overview.consumption)}</div>
          </div>
          <div className="stat">
            <div className="label">Observed net added</div>
            <div className="value">{fmtL(overview.refill)}</div>
          </div>
          <div className="stat">
            <div className="label">Current available</div>
            <div className="value">{fmtL(overview.available)}</div>
          </div>
          <div className="stat">
            <div className="label">Avg daily consumption</div>
            <div className="value">{fmtL(overview.avgDaily)}</div>
          </div>
          <div className="stat">
            <div className="label">Inferred pump activations</div>
            <div className="value">{overview.pumps}</div>
          </div>
          <div className="stat">
            <div className="label">Estimated filling duration</div>
            <div className="value">{fmtDur(overview.fillDur)}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Water utilization</h2>
        <p className="lead">Hourly estimated consumption vs observed net refill (Asia/Kolkata).</p>
        <div className="chart-box">
          {hourlyChart.length === 0 ? (
            <div className="empty">No utilization data in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChart} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis
                  dataKey="label"
                  minTickGap={isMobile ? 40 : 24}
                  tick={tickProps}
                  interval="preserveStartEnd"
                />
                <YAxis width={isMobile ? 36 : 48} tick={tickProps} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: isMobile ? 12 : 14 }} />
                <Bar dataKey="consumption" name="Consumption (L)" fill="#1a9bb0" />
                <Bar dataKey="refill" name="Net refill (L)" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Inferred filling activity timeline</h2>
        <p className="lead">Estimated pump activity inferred from rising water levels — not electrical confirmation.</p>
        {pumpTimeline.length === 0 ? (
          <div className="empty">No inferred filling events</div>
        ) : (
          <div className="timeline">
            {pumpTimeline.slice(0, 40).map((e) => (
              <div key={e.id} className="timeline-item">
                <div className="timeline-title">
                  {e.tankName} · {e.label}
                  <span className={`badge badge-${e.confidence.toLowerCase()}`}>{e.confidence}</span>
                  {e.incomplete && <span className="badge badge-low">Incomplete</span>}
                </div>
                <div className="timeline-meta">
                  {formatInKolkata(e.startTs, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {e.endTs
                    ? ` → ${formatInKolkata(e.endTs, { timeStyle: 'short' })}`
                    : ' → ongoing'}
                  {' · '}
                  {fmtDur(e.durationSec ?? 0)}
                  {' · '}+{(e.levelIncreaseIn ?? 0).toFixed(1)} in
                  {' · '}
                  {fmtL(e.estimatedNetRefillL)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Tank comparison</h2>
        <div className="tank-grid compare-grid">
          {(['tank1', 'tank2'] as TankId[]).map((id) => {
            const r = results[id];
            const cfg = tankStore.tanks[id];
            return (
              <div key={id} className="compare-card">
                <h3>{cfg.name}</h3>
                {!r.configured ? (
                  <p className="lead">Configuration required</p>
                ) : (
                  <ul className="kv">
                    <li>
                      <span>Current level</span>
                      <strong>{r.totals.currentLevelIn?.toFixed(1) ?? '—'} in</strong>
                    </li>
                    <li>
                      <span>Current volume</span>
                      <strong>{fmtL(r.totals.currentVolumeL)}</strong>
                    </li>
                    <li>
                      <span>Fill</span>
                      <strong>{r.totals.fillPct?.toFixed(0) ?? '—'}%</strong>
                    </li>
                    <li>
                      <span>Estimated consumption</span>
                      <strong>{fmtL(r.totals.consumptionL)}</strong>
                    </li>
                    <li>
                      <span>Observed net refill</span>
                      <strong>{fmtL(r.totals.netRefillL)}</strong>
                    </li>
                    <li>
                      <span>Filling frequency</span>
                      <strong>{r.totals.pumpActivations}</strong>
                    </li>
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Usage patterns</h2>
        <p className="lead">Daily consumption trend and peak periods (IST).</p>
        <div className="chart-box">
          {dailyTrend.length === 0 ? (
            <div className="empty">No daily pattern data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis dataKey="day" tick={tickProps} minTickGap={isMobile ? 28 : 16} />
                <YAxis width={isMobile ? 36 : 48} tick={tickProps} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: isMobile ? 12 : 14 }} />
                <Line type="monotone" dataKey="consumption" name="Consumption (L)" stroke="#1a9bb0" strokeWidth={2} />
                <Line type="monotone" dataKey="refill" name="Net refill (L)" stroke="#d97706" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Water usage insights</h2>
        {insights.length === 0 ? (
          <div className="empty">No unusual patterns detected in this range</div>
        ) : (
          <div className="insights">
            {insights.map((i) => (
              <div key={i.id} className={`insight insight-${i.severity}`}>
                <div className="insight-head">
                  <strong>{i.tankId === 'tank1' ? tankStore.tanks.tank1.name : tankStore.tanks.tank2.name}</strong>
                  <span className={`badge badge-${i.confidence.toLowerCase()}`}>{i.confidence}</span>
                </div>
                <p>{i.description}</p>
                {i.supporting && <p className="lead">{i.supporting}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Data quality</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Total readings</div>
            <div className="value">{quality.total}</div>
          </div>
          <div className="stat">
            <div className="label">Valid</div>
            <div className="value">{quality.valid}</div>
          </div>
          <div className="stat">
            <div className="label">Invalid</div>
            <div className="value">{quality.invalid}</div>
          </div>
          <div className="stat">
            <div className="label">Missing intervals</div>
            <div className="value">{quality.gaps}</div>
          </div>
          <div className="stat">
            <div className="label">Coverage (valid/total)</div>
            <div className="value">{quality.coverage.toFixed(0)}%</div>
          </div>
          <div className="stat">
            <div className="label">Analytics confidence</div>
            <div className="value">
              {results[tankIds[0]]?.quality.overallConfidence ?? '—'}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
