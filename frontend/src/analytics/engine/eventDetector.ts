import type { AnalyticsThresholds, FilteredReading } from '../types/analytics.types';
import type { WaterEvent } from '../types/events.types';
import type { TankId } from '../types/tank.types';
import { scoreConfidence } from './confidenceCalculator';

interface ActiveEvent {
  type: 'FILLING' | 'CONSUMING';
  startTs: number;
  startLevel: number;
  lastTs: number;
  lastLevel: number;
  extremeLevel: number;
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
  const durationSec = Math.max(0, (endTs - active.startTs) / 1000);
  const end = active.type === 'FILLING' ? Math.max(endLevel, active.extremeLevel) : Math.min(endLevel, active.extremeLevel);
  const delta = end - active.startLevel;
  const netMove = active.type === 'FILLING' ? delta : -delta;

  // Ignore tiny closed events unless incomplete at range end with meaningful movement
  if (!incomplete && durationSec < thresholds.minEventDurationSec && netMove < thresholds.minRefillRiseIn) {
    return null;
  }
  if (netMove < thresholds.noiseToleranceIn) return null;

  const volume = litresPerInch == null ? null : Math.max(0, netMove) * litresPerInch;

  return {
    id: uid(active.type.toLowerCase()),
    tankId,
    type: active.type,
    startTs: active.startTs,
    endTs,
    startLevelIn: active.startLevel,
    endLevelIn: end,
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
 * Detect FILLING / CONSUMING using cumulative level change from a local
 * trough/peak — not only large per-sample jumps (which miss slow IoT drains/fills).
 */
export function detectEvents(
  tankId: TankId,
  filtered: FilteredReading[],
  thresholds: AnalyticsThresholds,
  litresPerInch: number | null
): WaterEvent[] {
  const events: WaterEvent[] = [];
  let active: ActiveEvent | null = null;
  let prevValid: FilteredReading | null = null;

  // Track local extremum while stable, to backdate event starts
  let troughLevel = 0;
  let troughTs = 0;
  let peakLevel = 0;
  let peakTs = 0;
  let samplesSinceAnchor = 0;

  const endStableNeeded = (type: 'FILLING' | 'CONSUMING') =>
    type === 'FILLING' ? thresholds.refillStableDurationSec : thresholds.consumptionStableDurationSec;

  const resetAnchors = (level: number, ts: number) => {
    troughLevel = level;
    troughTs = ts;
    peakLevel = level;
    peakTs = ts;
    samplesSinceAnchor = 0;
  };

  for (const r of filtered) {
    if (prevValid && r.ts - prevValid.ts > thresholds.maxDataGapSec * 1000) {
      if (active) {
        const closed = closeEvent(
          tankId,
          active,
          prevValid.ts,
          active.extremeLevel,
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
      if (r.valid && r.filteredIn != null) resetAnchors(r.filteredIn, r.ts);
      prevValid = r.valid ? r : prevValid;
      continue;
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
      continue;
    }

    const level = r.filteredIn;

    if (!prevValid || prevValid.filteredIn == null) {
      resetAnchors(level, r.ts);
      prevValid = r;
      continue;
    }

    samplesSinceAnchor += 1;

    if (!active) {
      troughLevel = Math.min(troughLevel, level);
      if (level <= troughLevel) troughTs = r.ts;
      peakLevel = Math.max(peakLevel, level);
      if (level >= peakLevel) peakTs = r.ts;

      const riseFromTrough = level - troughLevel;
      const fallFromPeak = peakLevel - level;

      // Need enough samples after the extremum so we don't fire on a single spike
      const confirmed = samplesSinceAnchor >= thresholds.confirmationReadings;

      if (confirmed && riseFromTrough >= thresholds.minRefillRiseIn && level >= prevValid.filteredIn - thresholds.noiseToleranceIn) {
        active = {
          type: 'FILLING',
          startTs: troughTs,
          startLevel: troughLevel,
          lastTs: r.ts,
          lastLevel: level,
          extremeLevel: level,
          readingCount: 1,
          gapCount: 0,
          anomalyCount: 0,
          stableSince: null,
        };
      } else if (
        confirmed &&
        fallFromPeak >= thresholds.minConsumptionFallIn &&
        level <= prevValid.filteredIn + thresholds.noiseToleranceIn
      ) {
        active = {
          type: 'CONSUMING',
          startTs: peakTs,
          startLevel: peakLevel,
          lastTs: r.ts,
          lastLevel: level,
          extremeLevel: level,
          readingCount: 1,
          gapCount: 0,
          anomalyCount: 0,
          stableSince: null,
        };
      }
    } else {
      const prevExtreme = active.extremeLevel;
      active.lastTs = r.ts;
      active.lastLevel = level;
      active.readingCount += 1;

      if (active.type === 'FILLING') {
        active.extremeLevel = Math.max(active.extremeLevel, level);
      } else {
        active.extremeLevel = Math.min(active.extremeLevel, level);
      }

      const deltaFromPrev = level - prevValid.filteredIn;
      const stillProgressing =
        active.type === 'FILLING'
          ? level >= prevExtreme - thresholds.noiseToleranceIn
          : level <= prevExtreme + thresholds.noiseToleranceIn;
      const isStableNow = Math.abs(deltaFromPrev) <= thresholds.noiseToleranceIn;

      if (isStableNow && stillProgressing) {
        if (active.stableSince == null) active.stableSince = r.ts;
        const stableFor = (r.ts - active.stableSince) / 1000;
        if (stableFor >= endStableNeeded(active.type)) {
          const closed = closeEvent(
            tankId,
            active,
            r.ts,
            active.extremeLevel,
            litresPerInch,
            thresholds,
            false
          );
          if (closed) events.push(closed);
          resetAnchors(level, r.ts);
          active = null;
        }
      } else if (
        (active.type === 'FILLING' && level < active.extremeLevel - Math.max(thresholds.minConsumptionFallIn, thresholds.noiseToleranceIn * 2)) ||
        (active.type === 'CONSUMING' && level > active.extremeLevel + Math.max(thresholds.minRefillRiseIn, thresholds.noiseToleranceIn * 2))
      ) {
        // Direction reversed meaningfully — close current event and re-anchor
        const closed = closeEvent(
          tankId,
          active,
          prevValid.ts,
          active.extremeLevel,
          litresPerInch,
          thresholds,
          false
        );
        if (closed) events.push(closed);
        resetAnchors(level, r.ts);
        active = null;
      } else {
        active.stableSince = null;
      }
    }

    prevValid = r;
  }

  if (active && prevValid?.filteredIn != null) {
    const closed = closeEvent(
      tankId,
      active,
      prevValid.ts,
      active.extremeLevel,
      litresPerInch,
      thresholds,
      true
    );
    if (closed) events.push(closed);
  }

  return events;
}
