import type { AnalyticsThresholds, FilteredReading, TrendSample } from '../types/analytics.types';
import type { TrendState } from '../types/events.types';

/**
 * Assign tentative trend labels with hysteresis via noise tolerance.
 * Sustained confirmation is applied in the event state machine.
 */
export function detectTrends(
  filtered: FilteredReading[],
  thresholds: AnalyticsThresholds
): TrendSample[] {
  const samples: TrendSample[] = [];
  let prev: number | null = null;

  for (const r of filtered) {
    if (!r.valid || r.filteredIn == null) {
      samples.push({
        ts: r.ts,
        levelIn: r.rawNormalizedIn,
        deltaIn: 0,
        state: 'SENSOR_ANOMALY',
      });
      continue;
    }

    if (prev == null) {
      samples.push({ ts: r.ts, levelIn: r.filteredIn, deltaIn: 0, state: 'STABLE' });
      prev = r.filteredIn;
      continue;
    }

    const delta = r.filteredIn - prev;
    let state: TrendState = 'STABLE';
    if (delta >= thresholds.minRefillRiseIn) state = 'FILLING';
    else if (delta <= -thresholds.minConsumptionFallIn) state = 'CONSUMING';
    else if (Math.abs(delta) <= thresholds.noiseToleranceIn) state = 'STABLE';
    else state = delta > 0 ? 'FILLING' : 'CONSUMING';

    samples.push({ ts: r.ts, levelIn: r.filteredIn, deltaIn: delta, state });
    prev = r.filteredIn;
  }

  return samples;
}
