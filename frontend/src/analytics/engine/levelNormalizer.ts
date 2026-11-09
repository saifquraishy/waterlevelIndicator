import { cmToInches } from '../../utils/units';
import type { NormalizedReading } from '../types/analytics.types';
import type { TankConfig } from '../types/tank.types';

export function rawApiToInches(raw: number, tank: TankConfig): number {
  if (tank.apiUnit === 'cm') return cmToInches(raw);
  return raw;
}

/** Convert a single raw API reading into normalised water height (inches). */
export function normalizeReading(rawApiValue: number, ts: number, tank: TankConfig): NormalizedReading {
  const rawIn = rawApiToInches(rawApiValue, tank);
  let normalizedIn =
    tank.sensorMeasurement === 'SENSOR_DISTANCE'
      ? (tank.heightFt ?? 0) * 12 - rawIn + tank.sensorOffsetIn
      : rawIn + tank.sensorOffsetIn;

  let valid = Number.isFinite(normalizedIn);
  let reason: string | undefined;

  if (!valid) {
    reason = 'Non-finite reading';
  } else if (tank.minWaterHeightIn != null && normalizedIn < tank.minWaterHeightIn - 2) {
    valid = false;
    reason = 'Below operational minimum';
  } else if (tank.maxWaterHeightIn != null && normalizedIn > tank.maxWaterHeightIn + 2) {
    valid = false;
    reason = 'Above operational maximum';
  } else if (normalizedIn < -1 || normalizedIn > 120) {
    valid = false;
    reason = 'Physically implausible height';
  }

  return { ts, rawIn, normalizedIn, valid, reason };
}

export function normalizeSeries(
  readings: Array<{ ts: number; raw: number }>,
  tank: TankConfig
): NormalizedReading[] {
  return readings
    .map((r) => normalizeReading(r.raw, r.ts, tank))
    .sort((a, b) => a.ts - b.ts);
}
