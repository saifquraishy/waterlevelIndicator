import { describe, expect, it } from 'vitest';
import type { WaterReading } from '../../api/client';
import { defaultThresholds } from '../types/analytics.types';
import { createEmptyTankConfig, type TankConfig } from '../types/tank.types';
import { analyzeTank } from '../services/analyticsService';
import { litresPerInch, capacityLitres } from './tankCalculator';
import { applyMedianFilter } from './medianFilter';
import { normalizeSeries } from './levelNormalizer';
import { dayKeyKolkata, hourKeyKolkata } from './timeKeys';

function tankRect(overrides: Partial<TankConfig> = {}): TankConfig {
  return {
    ...createEmptyTankConfig('tank1', 'Tank 1'),
    shape: 'rectangular',
    lengthFt: 4,
    widthFt: 3,
    heightFt: 4,
    minWaterHeightIn: 2,
    maxWaterHeightIn: 40,
    sensorMeasurement: 'WATER_HEIGHT',
    sensorOffsetIn: 0,
    apiUnit: 'cm',
    enabled: true,
    ...overrides,
  };
}

/** Build API readings: inches as water height, converted to cm for API shape. */
function seriesFromInches(
  points: Array<{ t: string; inches: number }>,
  tank2Inches = 20
): WaterReading[] {
  return points.map((p) => ({
    timestamp: p.t,
    tank1_level: p.inches * 2.54,
    tank2_level: tank2Inches * 2.54,
  }));
}

const base = Date.parse('2026-03-01T00:00:00+05:30');

function ts(offsetSec: number): string {
  return new Date(base + offsetSec * 1000).toISOString();
}

describe('tankCalculator', () => {
  it('computes rectangular litresPerInch and capacity', () => {
    const t = tankRect();
    expect(litresPerInch(t)).toBeCloseTo(4 * 3 * 2.359733, 5);
    expect(capacityLitres(t)).toBeCloseTo(4 * 3 * 4 * 28.3168, 4);
  });

  it('supports different dimensions per tank', () => {
    const a = tankRect({ lengthFt: 4, widthFt: 3 });
    const b = tankRect({ id: 'tank2', lengthFt: 5, widthFt: 5 });
    expect(litresPerInch(a)).not.toEqual(litresPerInch(b));
  });
});

describe('medianFilter', () => {
  it('suppresses a single noisy spike', () => {
    const tank = tankRect();
    const normalized = normalizeSeries(
      [
        { ts: 1, raw: 20 * 2.54 },
        { ts: 2, raw: 20.1 * 2.54 },
        { ts: 3, raw: 35 * 2.54 },
        { ts: 4, raw: 20.2 * 2.54 },
      ],
      tank
    );
    const filtered = applyMedianFilter(normalized, 3);
    const spike = filtered[2].filteredIn!;
    expect(spike).toBeLessThan(30);
  });
});

describe('event detection scenarios', () => {
  const thresholds = {
    ...defaultThresholds(),
    confirmationReadings: 2,
    minEventDurationSec: 60,
    refillStableDurationSec: 60,
    consumptionStableDurationSec: 60,
    maxDataGapSec: 300,
  };

  it('detects continuous increase as filling', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 10 },
      { t: ts(60), inches: 11 },
      { t: ts(120), inches: 12 },
      { t: ts(180), inches: 13 },
      { t: ts(240), inches: 14 },
      { t: ts(300), inches: 14.05 },
      { t: ts(360), inches: 14.05 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds,
      readings,
      rangeStart: base,
      rangeEnd: base + 400_000,
    });
    expect(result.events.some((e) => e.type === 'FILLING')).toBe(true);
    expect(result.totals.netRefillL).toBeGreaterThan(0);
  });

  it('detects continuous decrease as consumption', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 20 },
      { t: ts(60), inches: 19 },
      { t: ts(120), inches: 18 },
      { t: ts(180), inches: 17 },
      { t: ts(240), inches: 16 },
      { t: ts(300), inches: 15.95 },
      { t: ts(360), inches: 15.95 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds,
      readings,
      rangeStart: base,
      rangeEnd: base + 400_000,
    });
    expect(result.events.some((e) => e.type === 'CONSUMING')).toBe(true);
    expect(result.totals.consumptionL).toBeGreaterThan(0);
  });

  it('keeps stable levels without consumption/refill volume', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 18 },
      { t: ts(60), inches: 18.05 },
      { t: ts(120), inches: 17.95 },
      { t: ts(180), inches: 18 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds: { ...thresholds, noiseToleranceIn: 0.2, minRefillRiseIn: 0.5, minConsumptionFallIn: 0.5 },
      readings,
      rangeStart: base,
      rangeEnd: base + 200_000,
    });
    expect(result.totals.consumptionL).toBe(0);
    expect(result.totals.netRefillL).toBe(0);
  });

  it('marks data gaps for missing readings', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 15 },
      { t: ts(60), inches: 15.1 },
      { t: ts(1000), inches: 15.2 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds: { ...thresholds, maxDataGapSec: 180 },
      readings,
      rangeStart: base,
      rangeEnd: base + 1200_000,
    });
    expect(result.events.some((e) => e.type === 'DATA_GAP')).toBe(true);
  });

  it('flags invalid / implausible readings', () => {
    const readings: WaterReading[] = [
      { timestamp: ts(0), tank1_level: 20 * 2.54, tank2_level: 20 * 2.54 },
      { timestamp: ts(60), tank1_level: 500, tank2_level: 20 * 2.54 },
      { timestamp: ts(120), tank1_level: 20.2 * 2.54, tank2_level: 20 * 2.54 },
    ];
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect({ maxWaterHeightIn: 40 }),
      thresholds,
      readings,
      rangeStart: base,
      rangeEnd: base + 200_000,
    });
    expect(result.quality.invalidReadings).toBeGreaterThan(0);
  });

  it('deduplicates identical timestamps', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 10 },
      { t: ts(0), inches: 12 },
      { t: ts(60), inches: 12.1 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds,
      readings,
      rangeStart: base,
      rangeEnd: base + 120_000,
    });
    expect(result.quality.totalReadings).toBe(2);
  });

  it('handles incomplete events at range end', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 10 },
      { t: ts(60), inches: 11 },
      { t: ts(120), inches: 12 },
      { t: ts(180), inches: 13 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds,
      readings,
      rangeStart: base,
      rangeEnd: base + 200_000,
    });
    const filling = result.events.filter((e) => e.type === 'FILLING');
    expect(filling.some((e) => e.incomplete)).toBe(true);
  });

  it('uses per-tank thresholds independently', () => {
    const tight = { ...thresholds, minRefillRiseIn: 5, confirmationReadings: 2 };
    // Steps large enough to survive median(window=3) while still below the tight 5 in threshold
    const readings = seriesFromInches([
      { t: ts(0), inches: 10 },
      { t: ts(60), inches: 11.2 },
      { t: ts(120), inches: 12.4 },
      { t: ts(180), inches: 13.6 },
      { t: ts(240), inches: 14.8 },
    ]);
    const loose = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds: { ...thresholds, medianWindow: 1 },
      readings,
      rangeStart: base,
      rangeEnd: base + 300_000,
    });
    const strict = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds: { ...tight, medianWindow: 1 },
      readings,
      rangeStart: base,
      rangeEnd: base + 300_000,
    });
    expect(loose.events.some((e) => e.type === 'FILLING')).toBe(true);
    expect(strict.events.some((e) => e.type === 'FILLING')).toBe(false);
  });

  it('does not invent consumption during pure filling', () => {
    const readings = seriesFromInches([
      { t: ts(0), inches: 8 },
      { t: ts(60), inches: 9 },
      { t: ts(120), inches: 10 },
      { t: ts(180), inches: 11 },
      { t: ts(240), inches: 11.05 },
      { t: ts(300), inches: 11.05 },
    ]);
    const result = analyzeTank({
      tankId: 'tank1',
      tank: tankRect(),
      thresholds,
      readings,
      rangeStart: base,
      rangeEnd: base + 400_000,
    });
    expect(result.totals.consumptionL).toBe(0);
  });
});

describe('timezone helpers', () => {
  it('produces Asia/Kolkata day and hour keys', () => {
    // 2026-03-01 00:30 IST = 2026-02-28 19:00 UTC
    const tsUtc = Date.parse('2026-02-28T19:00:00Z');
    expect(dayKeyKolkata(tsUtc)).toBe('2026-03-01');
    expect(hourKeyKolkata(tsUtc)).toMatch(/^2026-03-01T00/);
  });
});

describe('volume math', () => {
  it('matches manual litres for a known drop', () => {
    const t = tankRect({ lengthFt: 4, widthFt: 3 });
    const lpi = litresPerInch(t)!;
    const dropIn = 2;
    expect(dropIn * lpi).toBeCloseTo(2 * 4 * 3 * 2.359733, 5);
  });
});
