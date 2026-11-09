import type { WaterReading } from '../../api/client';
import type { AnalyticsThresholds, TankAnalyticsResult } from '../types/analytics.types';
import type { TankConfig, TankId } from '../types/tank.types';
import { detectAnomalies } from '../engine/anomalyDetector';
import { overallConfidence } from '../engine/confidenceCalculator';
import { totalConsumptionLitres } from '../engine/consumptionCalculator';
import { aggregateDaily } from '../engine/dailyAggregator';
import { detectEvents } from '../engine/eventDetector';
import { aggregateHourly } from '../engine/hourlyAggregator';
import { normalizeSeries } from '../engine/levelNormalizer';
import { applyMedianFilter } from '../engine/medianFilter';
import { inferPumpActivity, pumpStats } from '../engine/motorInference';
import { totalNetRefillLitres } from '../engine/refillCalculator';
import { fillPercent, isTankConfigured, litresPerInch, volumeFromHeightIn } from '../engine/tankCalculator';

function pickRaw(reading: WaterReading, tankId: TankId): number {
  return tankId === 'tank1' ? reading.tank1_level : reading.tank2_level;
}

export function analyzeTank(input: {
  tankId: TankId;
  tank: TankConfig;
  thresholds: AnalyticsThresholds;
  readings: WaterReading[];
  rangeStart: number;
  rangeEnd: number;
}): TankAnalyticsResult {
  const { tankId, tank, thresholds, readings, rangeStart, rangeEnd } = input;
  const configured = isTankConfigured(tank) && tank.enabled;
  const lpi = configured ? litresPerInch(tank) : null;

  const series = readings
    .map((r) => ({ ts: new Date(r.timestamp).getTime(), raw: pickRaw(r, tankId) }))
    .filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.raw))
    .sort((a, b) => a.ts - b.ts);

  // Dedupe identical timestamps (keep last)
  const deduped: typeof series = [];
  for (const s of series) {
    if (deduped.length && deduped[deduped.length - 1].ts === s.ts) {
      deduped[deduped.length - 1] = s;
    } else {
      deduped.push(s);
    }
  }

  if (!configured) {
    return emptyResult(tankId, false, deduped.length);
  }

  const normalized = normalizeSeries(deduped, tank);
  const filtered = applyMedianFilter(normalized, thresholds.medianWindow);
  const events = detectEvents(tankId, filtered, thresholds, lpi);
  const pumpEvents = inferPumpActivity(tankId, events);
  const hourly = aggregateHourly(filtered, events, pumpEvents);
  const daily = aggregateDaily(tank, filtered, events, hourly, rangeStart, rangeEnd);

  const missingIntervals = events.filter((e) => e.type === 'DATA_GAP').length;
  const validReadings = filtered.filter((r) => r.valid).length;
  const invalidReadings = filtered.length - validReadings;
  const spanSec = Math.max(1, (rangeEnd - rangeStart) / 1000);
  const expected = Math.max(1, Math.floor(spanSec / Math.max(1, thresholds.samplingIntervalSec)));
  const dataCoveragePct = Math.min(100, (validReadings / expected) * 100);
  const quality = {
    totalReadings: filtered.length,
    validReadings,
    invalidReadings,
    missingIntervals,
    dataCoveragePct,
    overallConfidence: overallConfidence(dataCoveragePct, invalidReadings / Math.max(1, filtered.length)),
  };

  const anomalies = detectAnomalies({
    tankId,
    events,
    pumpEvents,
    daily,
    hourly,
    missingIntervals,
  });

  const stats = pumpStats(pumpEvents);
  const consumptionL = totalConsumptionLitres(events);
  const netRefillL = totalNetRefillLitres(events);
  const dayCount = Math.max(1, daily.length);
  const last = [...filtered].reverse().find((r) => r.valid && r.filteredIn != null);
  const currentLevelIn = last?.filteredIn ?? null;

  return {
    tankId,
    configured: true,
    litresPerInch: lpi,
    events,
    pumpEvents,
    hourly,
    daily,
    anomalies,
    quality,
    totals: {
      consumptionL,
      netRefillL,
      pumpActivations: stats.activations,
      fillingDurationSec: stats.totalDurationSec,
      avgDailyConsumptionL: consumptionL / dayCount,
      currentLevelIn,
      currentVolumeL: currentLevelIn != null ? volumeFromHeightIn(tank, currentLevelIn) : null,
      fillPct: currentLevelIn != null ? fillPercent(tank, currentLevelIn) : null,
    },
  };
}

function emptyResult(tankId: TankId, configured: boolean, totalReadings: number): TankAnalyticsResult {
  return {
    tankId,
    configured,
    litresPerInch: null,
    events: [],
    pumpEvents: [],
    hourly: [],
    daily: [],
    anomalies: [],
    quality: {
      totalReadings,
      validReadings: 0,
      invalidReadings: 0,
      missingIntervals: 0,
      dataCoveragePct: 0,
      overallConfidence: 'LOW',
    },
    totals: {
      consumptionL: 0,
      netRefillL: 0,
      pumpActivations: 0,
      fillingDurationSec: 0,
      avgDailyConsumptionL: 0,
      currentLevelIn: null,
      currentVolumeL: null,
      fillPct: null,
    },
  };
}

export function analyzeBothTanks(input: {
  tanks: Record<TankId, TankConfig>;
  thresholds: Record<TankId, AnalyticsThresholds>;
  readings: WaterReading[];
  rangeStart: number;
  rangeEnd: number;
}): Record<TankId, TankAnalyticsResult> {
  return {
    tank1: analyzeTank({
      tankId: 'tank1',
      tank: input.tanks.tank1,
      thresholds: input.thresholds.tank1,
      readings: input.readings,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
    }),
    tank2: analyzeTank({
      tankId: 'tank2',
      tank: input.tanks.tank2,
      thresholds: input.thresholds.tank2,
      readings: input.readings,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
    }),
  };
}
