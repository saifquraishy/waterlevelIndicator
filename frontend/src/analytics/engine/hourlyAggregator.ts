import type { FilteredReading, HourlyBucket } from '../types/analytics.types';
import type { InferredPumpEvent, WaterEvent } from '../types/events.types';
import { consumptionByHour } from './consumptionCalculator';
import { refillByHour } from './refillCalculator';
import { hourKeyKolkata, hourLabelKolkata } from './timeKeys';

export function aggregateHourly(
  filtered: FilteredReading[],
  events: WaterEvent[],
  pumpEvents: InferredPumpEvent[]
): HourlyBucket[] {
  const cons = consumptionByHour(events, hourKeyKolkata);
  const refill = refillByHour(events, hourKeyKolkata);

  const levels = new Map<string, number[]>();
  for (const r of filtered) {
    if (!r.valid || r.filteredIn == null) continue;
    const key = hourKeyKolkata(r.ts);
    const arr = levels.get(key) ?? [];
    arr.push(r.filteredIn);
    levels.set(key, arr);
  }

  const fillingDur = new Map<string, number>();
  const fillingCount = new Map<string, number>();
  for (const p of pumpEvents) {
    const key = hourKeyKolkata(p.startTs);
    fillingCount.set(key, (fillingCount.get(key) ?? 0) + 1);
    fillingDur.set(key, (fillingDur.get(key) ?? 0) + (p.durationSec ?? 0));
  }

  const keys = new Set([...cons.keys(), ...refill.keys(), ...levels.keys(), ...fillingCount.keys()]);
  return [...keys]
    .sort()
    .map((key) => {
      const lv = levels.get(key) ?? [];
      return {
        hourKey: key,
        label: hourLabelKolkata(key),
        consumptionL: cons.get(key) ?? 0,
        netRefillL: refill.get(key) ?? 0,
        fillingDurationSec: fillingDur.get(key) ?? 0,
        fillingEvents: fillingCount.get(key) ?? 0,
        avgLevelIn: lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : null,
        readingCount: lv.length,
      };
    });
}
