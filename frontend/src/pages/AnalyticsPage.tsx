import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWaterUtilization } from '../analytics/hooks/useWaterUtilization';
import type { TankId } from '../analytics/types/tank.types';
import {
  clockLabelFromHour,
  formatInKolkata,
  hourOfDayFromHourKey,
} from '../analytics/engine/timeKeys';
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
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
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
  const isSingleDay = fromDate === toDate;

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

  /**
   * Always by clock hour (0–23 IST).
   * Single day = that day's hours; multi-day = same hour summed across selected dates.
   */
  const hourlyByClock = useMemo(() => {
    const byHour = new Map<number, { hour: number; label: string; consumption: number; refill: number }>();
    for (let h = 0; h < 24; h++) {
      byHour.set(h, { hour: h, label: clockLabelFromHour(h), consumption: 0, refill: 0 });
    }
    for (const id of tankIds) {
      for (const bucket of results[id].hourly) {
        const hour = hourOfDayFromHourKey(bucket.hourKey);
        const row = byHour.get(hour)!;
        row.consumption += bucket.consumptionL;
        row.refill += bucket.netRefillL;
      }
    }
    return [...byHour.values()].sort((a, b) => a.hour - b.hour);
  }, [results, tankIds]);

  const consumptionHours = useMemo(
    () =>
      hourlyByClock
        .filter((h) => h.consumption > 0)
        .sort((a, b) => b.consumption - a.consumption),
    [hourlyByClock]
  );

  const refillHours = useMemo(
    () =>
      hourlyByClock
        .filter((h) => h.refill > 0)
        .sort((a, b) => b.refill - a.refill),
    [hourlyByClock]
  );

  const peakConsumption = consumptionHours[0] ?? null;
  const peakRefill = refillHours[0] ?? null;

  const fillEvents = useMemo(() => {
    return tankIds
      .flatMap((id) =>
        results[id].pumpEvents.map((e) => ({
          ...e,
          tankName: tankStore.tanks[id].name,
        }))
      )
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
  const hourLead = isSingleDay
    ? `Hours for ${fromDate} (Asia/Kolkata).`
    : `Same clock hour added across ${fromDate} → ${toDate} (Asia/Kolkata), so you can see which times of day matter most.`;

  return (
    <>
      <section className="panel">
        <h2>Water utilization analytics</h2>
        <p className="lead">
          Metrics are calculated in your browser from sensor history. “Tank filled” times are estimated
          from rising water levels (not a direct motor sensor).
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
        {anyConfigured &&
          !loading &&
          overview.configuredCount > 0 &&
          overview.consumption === 0 &&
          overview.refill === 0 &&
          overview.pumps === 0 && (
            <div className="status-ok">
              No clear fill or usage events in this range yet. Try a longer date range if levels were
              mostly steady.
            </div>
          )}
      </section>

      <section className="panel">
        <h2>Overview</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Water used</div>
            <div className="value">{fmtL(overview.consumption)}</div>
          </div>
          <div className="stat">
            <div className="label">Water added</div>
            <div className="value">{fmtL(overview.refill)}</div>
          </div>
          <div className="stat">
            <div className="label">Available now</div>
            <div className="value">{fmtL(overview.available)}</div>
          </div>
          <div className="stat">
            <div className="label">Avg per day</div>
            <div className="value">{fmtL(overview.avgDaily)}</div>
          </div>
          <div className="stat">
            <div className="label">Times filled</div>
            <div className="value">{overview.pumps}</div>
          </div>
          <div className="stat">
            <div className="label">Total fill time</div>
            <div className="value">{fmtDur(overview.fillDur)}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Usage by hour</h2>
        <p className="lead">{hourLead}</p>

        <div className="peak-row">
          <div className="peak-card peak-use">
            <div className="peak-title">Highest consumption</div>
            {peakConsumption ? (
              <>
                <div className="peak-hour">{peakConsumption.label}</div>
                <div className="peak-value">{fmtL(peakConsumption.consumption)}</div>
              </>
            ) : (
              <div className="peak-empty">No consumption in this range</div>
            )}
          </div>
          <div className="peak-card peak-add">
            <div className="peak-title">Highest refill</div>
            {peakRefill ? (
              <>
                <div className="peak-hour">{peakRefill.label}</div>
                <div className="peak-value">{fmtL(peakRefill.refill)}</div>
              </>
            ) : (
              <div className="peak-empty">No refill in this range</div>
            )}
          </div>
        </div>

        <h3 className="section-subhead">Consumption by hour</h3>
        <div className="chart-box chart-box-sm">
          {consumptionHours.length === 0 ? (
            <div className="empty">No consumption hours</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyByClock} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis
                  dataKey="label"
                  minTickGap={isMobile ? 18 : 10}
                  tick={tickProps}
                  interval="preserveStartEnd"
                />
                <YAxis width={isMobile ? 36 : 48} tick={tickProps} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(0)} L`, 'Used']} />
                <Bar dataKey="consumption" name="Used (L)" fill="#1a9bb0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <h3 className="section-subhead">Refill by hour</h3>
        <div className="chart-box chart-box-sm">
          {refillHours.length === 0 ? (
            <div className="empty">No refill hours</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyByClock} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,37,46,0.12)" />
                <XAxis
                  dataKey="label"
                  minTickGap={isMobile ? 18 : 10}
                  tick={tickProps}
                  interval="preserveStartEnd"
                />
                <YAxis width={isMobile ? 36 : 48} tick={tickProps} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(0)} L`, 'Added']} />
                <Bar dataKey="refill" name="Added (L)" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="hour-rank-grid">
          <div>
            <h3 className="section-subhead">Top consumption hours</h3>
            {consumptionHours.length === 0 ? (
              <div className="empty">—</div>
            ) : (
              <ol className="hour-rank">
                {consumptionHours.slice(0, 5).map((h, i) => (
                  <li key={`c-${h.hour}`}>
                    <span>
                      #{i + 1} {h.label}
                    </span>
                    <strong>{fmtL(h.consumption)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="section-subhead">Top refill hours</h3>
            {refillHours.length === 0 ? (
              <div className="empty">—</div>
            ) : (
              <ol className="hour-rank">
                {refillHours.slice(0, 5).map((h, i) => (
                  <li key={`r-${h.hour}`}>
                    <span>
                      #{i + 1} {h.label}
                    </span>
                    <strong>{fmtL(h.refill)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>When tanks were filled</h2>
        <p className="lead">Estimated from rising water level — useful to see when the pump likely ran.</p>
        {fillEvents.length === 0 ? (
          <div className="empty">No fill events found in this range</div>
        ) : (
          <div className="fill-list">
            {fillEvents.slice(0, 30).map((e) => (
              <div key={e.id} className="fill-card">
                <div className="fill-card-top">
                  <strong>{e.tankName}</strong>
                  <span className="fill-when">
                    {formatInKolkata(e.startTs, {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
                <div className="fill-card-grid">
                  <div>
                    <span className="fill-label">Ran for</span>
                    <strong>{fmtDur(e.durationSec ?? 0)}</strong>
                  </div>
                  <div>
                    <span className="fill-label">Water added</span>
                    <strong>{fmtL(e.estimatedNetRefillL)}</strong>
                  </div>
                  <div>
                    <span className="fill-label">Level rose</span>
                    <strong>+{(e.levelIncreaseIn ?? 0).toFixed(1)} in</strong>
                  </div>
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
                      <span>Water used</span>
                      <strong>{fmtL(r.totals.consumptionL)}</strong>
                    </li>
                    <li>
                      <span>Water added</span>
                      <strong>{fmtL(r.totals.netRefillL)}</strong>
                    </li>
                    <li>
                      <span>Times filled</span>
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
        <h2>Water usage insights</h2>
        {insights.length === 0 ? (
          <div className="empty">No unusual patterns detected in this range</div>
        ) : (
          <div className="insights">
            {insights.map((i) => (
              <div key={i.id} className={`insight insight-${i.severity}`}>
                <div className="insight-head">
                  <strong>
                    {i.tankId === 'tank1' ? tankStore.tanks.tank1.name : tankStore.tanks.tank2.name}
                  </strong>
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
            <div className="label">Coverage</div>
            <div className="value">{quality.coverage.toFixed(0)}%</div>
          </div>
        </div>
      </section>
    </>
  );
}
