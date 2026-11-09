import { useMemo, useState } from 'react';
import { useAnalyticsConfig } from '../analytics/hooks/useAnalyticsConfig';
import { useTankConfig } from '../analytics/hooks/useTankConfig';
import {
  deriveTankMetrics,
  validateTankConfig,
} from '../analytics/engine/tankCalculator';
import { defaultThresholds, type AnalyticsThresholds } from '../analytics/types/analytics.types';
import type { TankConfig, TankId } from '../analytics/types/tank.types';
import { fetchLatest } from '../api/client';
import { cmToInches } from '../utils/units';
import { fillPercent, volumeFromHeightIn } from '../analytics/engine/tankCalculator';

const THRESHOLD_HELP: Record<keyof AnalyticsThresholds, string> = {
  samplingIntervalSec: 'Expected seconds between device readings (used for coverage).',
  medianWindow: 'Rolling median window size to reduce ultrasonic noise.',
  minRefillRiseIn: 'Minimum rise (inches) to count toward a refill confirmation.',
  minConsumptionFallIn: 'Minimum fall (inches) to count toward consumption confirmation.',
  confirmationReadings: 'Consecutive confirming deltas required before starting an event.',
  refillStableDurationSec: 'Stable duration required to close a filling event.',
  consumptionStableDurationSec: 'Stable duration required to close a consumption event.',
  noiseToleranceIn: 'Absolute delta treated as noise / stable.',
  maxDataGapSec: 'Gap between readings that triggers a DATA_GAP event.',
  minEventDurationSec: 'Events shorter than this are discarded (unless incomplete at range end).',
};

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function SettingsPage() {
  const { store: tankStore, save: saveTanks } = useTankConfig();
  const { store: analyticsStore, save: saveAnalytics, resetTank } = useAnalyticsConfig();
  const [activeTank, setActiveTank] = useState<TankId>('tank1');
  const [draftTank, setDraftTank] = useState<TankConfig>(tankStore.tanks.tank1);
  const [draftThresholds, setDraftThresholds] = useState<AnalyticsThresholds>(
    analyticsStore.thresholds.tank1
  );
  const [message, setMessage] = useState<string | null>(null);
  const [latestIn, setLatestIn] = useState<number | null>(null);

  function selectTank(id: TankId) {
    setActiveTank(id);
    setDraftTank(tankStore.tanks[id]);
    setDraftThresholds(analyticsStore.thresholds[id]);
    setMessage(null);
  }

  const metrics = useMemo(() => deriveTankMetrics(draftTank), [draftTank]);
  const errors = validateTankConfig(draftTank);

  async function refreshLatest() {
    try {
      const latest = await fetchLatest();
      const raw = activeTank === 'tank1' ? latest.tank1_level : latest.tank2_level;
      const inches = cmToInches(raw) + draftTank.sensorOffsetIn;
      setLatestIn(inches);
    } catch {
      setLatestIn(null);
    }
  }

  function saveTank() {
    if (errors.length) {
      setMessage(errors.join(' · '));
      return;
    }
    const next = {
      ...tankStore,
      tanks: { ...tankStore.tanks, [activeTank]: draftTank },
    };
    saveTanks(next);
    setMessage('Tank configuration saved locally.');
  }

  function saveThresholds() {
    const next = {
      ...analyticsStore,
      thresholds: { ...analyticsStore.thresholds, [activeTank]: draftThresholds },
    };
    saveAnalytics(next);
    setMessage('Analytics thresholds saved locally.');
  }

  function onResetThresholds() {
    const defaults = defaultThresholds();
    setDraftThresholds(defaults);
    resetTank(activeTank);
    setMessage('Analytics thresholds reset to defaults.');
  }

  return (
    <>
      <section className="panel">
        <h2>Settings</h2>
        <p className="lead">
          Tank dimensions and analytics thresholds are stored in this browser (versioned localStorage).
          Litre-based analytics stay disabled until each tank is fully configured.
        </p>
        <div className="toolbar">
          <button
            type="button"
            className={`btn ${activeTank === 'tank1' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => selectTank('tank1')}
          >
            Tank 1
          </button>
          <button
            type="button"
            className={`btn ${activeTank === 'tank2' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => selectTank('tank2')}
          >
            Tank 2
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void refreshLatest()}>
            Load latest level
          </button>
        </div>
        {message && <div className="status-ok">{message}</div>}
      </section>

      <section className="panel">
        <h2>Tank configuration — {draftTank.name}</h2>
        <p className="lead">Independent overhead/underground rectangular or cylindrical tanks.</p>

        <div className="form-grid">
          <label>
            Tank name
            <input
              value={draftTank.name}
              onChange={(e) => setDraftTank({ ...draftTank, name: e.target.value })}
            />
          </label>
          <label>
            Tank type
            <select
              value={draftTank.type}
              onChange={(e) =>
                setDraftTank({ ...draftTank, type: e.target.value as TankConfig['type'] })
              }
            >
              <option value="overhead">Overhead</option>
              <option value="underground">Underground</option>
            </select>
          </label>
          <label>
            Tank shape
            <select
              value={draftTank.shape}
              onChange={(e) =>
                setDraftTank({ ...draftTank, shape: e.target.value as TankConfig['shape'] })
              }
            >
              <option value="rectangular">Rectangular</option>
              <option value="cylindrical">Cylindrical</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draftTank.enabled}
              onChange={(e) => setDraftTank({ ...draftTank, enabled: e.target.checked })}
            />
            Enabled for analytics
          </label>

          {draftTank.shape === 'rectangular' ? (
            <>
              <label>
                Length (ft)
                <input
                  type="number"
                  step="0.01"
                  value={draftTank.lengthFt ?? ''}
                  onChange={(e) => setDraftTank({ ...draftTank, lengthFt: numOrNull(e.target.value) })}
                />
              </label>
              <label>
                Width (ft)
                <input
                  type="number"
                  step="0.01"
                  value={draftTank.widthFt ?? ''}
                  onChange={(e) => setDraftTank({ ...draftTank, widthFt: numOrNull(e.target.value) })}
                />
              </label>
            </>
          ) : (
            <label>
              Diameter (ft)
              <input
                type="number"
                step="0.01"
                value={draftTank.diameterFt ?? ''}
                onChange={(e) => setDraftTank({ ...draftTank, diameterFt: numOrNull(e.target.value) })}
              />
            </label>
          )}

          <label>
            Height (ft)
            <input
              type="number"
              step="0.01"
              value={draftTank.heightFt ?? ''}
              onChange={(e) => setDraftTank({ ...draftTank, heightFt: numOrNull(e.target.value) })}
            />
          </label>
          <label>
            Max water height (in)
            <input
              type="number"
              step="0.1"
              value={draftTank.maxWaterHeightIn ?? ''}
              onChange={(e) =>
                setDraftTank({ ...draftTank, maxWaterHeightIn: numOrNull(e.target.value) })
              }
            />
          </label>
          <label>
            Min water height (in)
            <input
              type="number"
              step="0.1"
              value={draftTank.minWaterHeightIn ?? ''}
              onChange={(e) =>
                setDraftTank({ ...draftTank, minWaterHeightIn: numOrNull(e.target.value) })
              }
            />
          </label>
          <label>
            Sensor measurement
            <select
              value={draftTank.sensorMeasurement}
              onChange={(e) =>
                setDraftTank({
                  ...draftTank,
                  sensorMeasurement: e.target.value as TankConfig['sensorMeasurement'],
                })
              }
            >
              <option value="WATER_HEIGHT">Water height</option>
              <option value="SENSOR_DISTANCE">Sensor distance</option>
            </select>
          </label>
          <label>
            Sensor offset (in)
            <input
              type="number"
              step="0.1"
              value={draftTank.sensorOffsetIn}
              onChange={(e) =>
                setDraftTank({ ...draftTank, sensorOffsetIn: Number(e.target.value) || 0 })
              }
            />
          </label>
        </div>

        <div className="stats mt">
          <div className="stat">
            <div className="label">Total capacity</div>
            <div className="value">
              {metrics.capacityLitres != null ? `${metrics.capacityLitres.toFixed(0)} L` : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="label">Usable capacity</div>
            <div className="value">
              {metrics.usableCapacityLitres != null
                ? `${metrics.usableCapacityLitres.toFixed(0)} L`
                : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="label">Litres / inch</div>
            <div className="value">
              {metrics.litresPerInch != null ? metrics.litresPerInch.toFixed(2) : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="label">Current volume</div>
            <div className="value">
              {latestIn != null && metrics.configured
                ? `${(volumeFromHeightIn(draftTank, latestIn) ?? 0).toFixed(0)} L`
                : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="label">Fill %</div>
            <div className="value">
              {latestIn != null && metrics.configured
                ? `${(fillPercent(draftTank, latestIn) ?? 0).toFixed(0)}%`
                : '—'}
            </div>
          </div>
        </div>

        {!metrics.configured && (
          <div className="status-error mt">
            Configuration required: enter valid dimensions and min/max water heights to enable
            litre-based analytics for this tank.
          </div>
        )}
        {errors.length > 0 && <div className="status-error mt">{errors.join(' · ')}</div>}

        <div className="toolbar mt">
          <button type="button" className="btn btn-primary" onClick={saveTank}>
            Save tank
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Analytics configuration — {draftTank.name}</h2>
        <p className="lead">Detection thresholds for this tank. Changes recalculate Analytics immediately after save.</p>
        <div className="form-grid">
          {(Object.keys(THRESHOLD_HELP) as Array<keyof AnalyticsThresholds>).map((key) => (
            <label key={key}>
              {key}
              <input
                type="number"
                step="any"
                value={draftThresholds[key]}
                onChange={(e) =>
                  setDraftThresholds({ ...draftThresholds, [key]: Number(e.target.value) })
                }
              />
              <span className="field-help">{THRESHOLD_HELP[key]}</span>
            </label>
          ))}
        </div>
        <div className="toolbar mt">
          <button type="button" className="btn btn-primary" onClick={saveThresholds}>
            Save thresholds
          </button>
          <button type="button" className="btn btn-ghost" onClick={onResetThresholds}>
            Reset to defaults
          </button>
        </div>
      </section>
    </>
  );
}
