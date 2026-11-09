import type { AnalyticsThresholds, FilteredReading } from '../types/analytics.types';
import type { TrendState, WaterEvent } from '../types/events.types';
import type { TankId } from '../types/tank.types';
import { scoreConfidence } from './confidenceCalculator';

interface ActiveEvent {
  type: 'FILLING' | 'CONSUMING';
  startTs: number;
  startLevel: number;
  lastTs: number;
  lastLevel: number;
  confirmCount: number;
  readingCount: number;
  gapCount: number;
  anomalyCount: number;
  stableSince: number | null;
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function closeEvent(
  tankId: TankId,
  active: ActiveEvent,
  endTs: number,
  endLevel: number,
  litresPerInch: number | null,
  thresholds: AnalyticsThresholds,
  incomplete: boolean
): WaterEvent | null {
  const durationSec = (endTs - active.startTs) / 1000;
  if (!incomplete && durationSec < thresholds.minEventDurationSec) return null;

  const delta = endLevel - active.startLevel;
  const volume =
    litresPerInch == null
      ? null
      : active.type === 'FILLING'
        ? Math.max(0, delta) * litresPerInch
        : Math.max(0, -delta) * litresPerInch;

  return {
    id: uid(active.type.toLowerCase()),
    tankId,
    type: active.type,
    startTs: active.startTs,
    endTs,
    startLevelIn: active.startLevel,
    endLevelIn: endLevel,
    durationSec,
    estimatedVolumeL: volume,
    confidence: scoreConfidence({
      readingCount: active.readingCount,
      durationSec,
      gapCount: active.gapCount,
      anomalyCount: active.anomalyCount,
      minEventDurationSec: thresholds.minEventDurationSec,
    }),
    incomplete,
  };
}

/**
 * State machine over filtered readings for one tank.
 * Confirms FILLING/CONSUMING with consecutive readings and ends on sustained stability.
 */
export function detectEvents(
  tankId: TankId,
  filtered: FilteredReading[],
  thresholds: AnalyticsThresholds,
  litresPerInch: number | null
): WaterEvent[] {
  const events: WaterEvent[] = [];
  let state: TrendState = 'STABLE';
  let active: ActiveEvent | null = null;
  let riseStreak = 0;
  let fallStreak = 0;
  let prevValid: FilteredReading | null = null;

  const endStableNeeded = (type: 'FILLING' | 'CONSUMING') =>
    type === 'FILLING' ? thresholds.refillStableDurationSec : thresholds.consumptionStableDurationSec;

  for (const r of filtered) {
    if (prevValid && r.ts - prevValid.ts > thresholds.maxDataGapSec * 1000) {
      if (active) {
        const closed = closeEvent(
          tankId,
          active,
          prevValid.ts,
          active.lastLevel,
          litresPerInch,
          thresholds,
          true
        );
        if (closed) events.push(closed);
        active = null;
      }
      events.push({
        id: uid('gap'),
        tankId,
        type: 'DATA_GAP',
        startTs: prevValid.ts,
        endTs: r.ts,
        startLevelIn: prevValid.filteredIn ?? prevValid.rawNormalizedIn,
        endLevelIn: r.filteredIn ?? r.rawNormalizedIn,
        durationSec: (r.ts - prevValid.ts) / 1000,
        estimatedVolumeL: null,
        confidence: 'MEDIUM',
        incomplete: false,
        notes: 'Reading gap exceeded maximum',
      });
      state = 'DATA_GAP';
      riseStreak = 0;
      fallStreak = 0;
    }

    if (!r.valid || r.filteredIn == null) {
      if (active) active.anomalyCount += 1;
      events.push({
        id: uid('anomaly'),
        tankId,
        type: 'SENSOR_ANOMALY',
        startTs: r.ts,
        endTs: r.ts,
        startLevelIn: r.rawNormalizedIn,
        endLevelIn: r.rawNormalizedIn,
        durationSec: 0,
        estimatedVolumeL: null,
        confidence: 'LOW',
        incomplete: false,
      });
      state = 'SENSOR_ANOMALY';
      continue;
    }

    const level = r.filteredIn;
    if (prevValid?.filteredIn != null) {
      const delta = level - prevValid.filteredIn;
      if (delta >= thresholds.minRefillRiseIn) {
        riseStreak += 1;
        fallStreak = 0;
      } else if (delta <= -thresholds.minConsumptionFallIn) {
        fallStreak += 1;
        riseStreak = 0;
      } else if (Math.abs(delta) <= thresholds.noiseToleranceIn) {
        // stable-ish
      } else {
        riseStreak = 0;
        fallStreak = 0;
      }
    }

    if (!active) {
      if (riseStreak >= thresholds.confirmationReadings) {
        state = 'FILLING';
        active = {
          type: 'FILLING',
          startTs: r.ts,
          startLevel: level,
          lastTs: r.ts,
          lastLevel: level,
          confirmCount: riseStreak,
          readingCount: 1,
          gapCount: 0,
          anomalyCount: 0,
          stableSince: null,
        };
      } else if (fallStreak >= thresholds.confirmationReadings) {
        state = 'CONSUMING';
        active = {
          type: 'CONSUMING',
          startTs: r.ts,
          startLevel: level,
          lastTs: r.ts,
          lastLevel: level,
          confirmCount: fallStreak,
          readingCount: 1,
          gapCount: 0,
          anomalyCount: 0,
          stableSince: null,
        };
      } else {
        state = 'STABLE';
      }
    } else {
      active.lastTs = r.ts;
      active.lastLevel = level;
      active.readingCount += 1;

      const movingWithEvent =
        active.type === 'FILLING'
          ? level >= active.lastLevel - thresholds.noiseToleranceIn
          : level <= active.lastLevel + thresholds.noiseToleranceIn;

      // Re-evaluate delta vs previous for stability ending
      const deltaFromPrev =
        prevValid?.filteredIn != null ? level - prevValid.filteredIn : 0;
      const isStableNow = Math.abs(deltaFromPrev) <= thresholds.noiseToleranceIn;

      if (isStableNow && movingWithEvent) {
        if (active.stableSince == null) active.stableSince = r.ts;
        const stableFor = (r.ts - active.stableSince) / 1000;
        if (stableFor >= endStableNeeded(active.type)) {
          const closed = closeEvent(
            tankId,
            active,
            r.ts,
            level,
            litresPerInch,
            thresholds,
            false
          );
          if (closed) events.push(closed);
          active = null;
          state = 'STABLE';
          riseStreak = 0;
          fallStreak = 0;
        }
      } else {
        active.stableSince = null;
        state = active.type;
      }
    }

    prevValid = r;
  }

  if (active && prevValid?.filteredIn != null) {
    const closed = closeEvent(
      tankId,
      active,
      prevValid.ts,
      prevValid.filteredIn,
      litresPerInch,
      thresholds,
      true
    );
    if (closed) events.push(closed);
  }

  void state;
  return events;
}
