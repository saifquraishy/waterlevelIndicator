import type { DailyBucket, FilteredReading, HourlyBucket } from '../types/analytics.types';
import type { WaterEvent } from '../types/events.types';
import type { TankConfig } from '../types/tank.types';
import { volumeFromHeightIn } from './tankCalculator';
import { dayKeyKolkata, hourKeyKolkata } from './timeKeys';

export function aggregateDaily(
  tank: TankConfig,
  filtered: FilteredReading[],
  events: WaterEvent[],
  hourly: HourlyBucket[],
  rangeStart: number,
  rangeEnd: number
): DailyBucket[] {
  const byDay = new Map<string, FilteredReading[]>();
  for (const r of filtered) {
    if (!r.valid || r.filteredIn == null) continue;
    const key = dayKeyKolkata(r.ts);
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }

  const days = [...byDay.keys()].sort();
  return days.map((dayKey) => {
    const readings = byDay.get(dayKey)!.sort((a, b) => a.ts - b.ts);
    const levels = readings.map((r) => r.filteredIn as number);
    const opening = levels[0] ?? null;
    const closing = levels[levels.length - 1] ?? null;

    const dayEvents = events.filter((e) => dayKeyKolkata(e.startTs) === dayKey);
    const consumptionL = dayEvents
      .filter((e) => e.type === 'CONSUMING' && e.estimatedVolumeL != null && e.confidence !== 'LOW')
      .reduce((s, e) => s + (e.estimatedVolumeL as number), 0);
    const netRefillL = dayEvents
      .filter((e) => e.type === 'FILLING' && e.estimatedVolumeL != null && e.confidence !== 'LOW')
      .reduce((s, e) => s + (e.estimatedVolumeL as number), 0);
    const refillEvents = dayEvents.filter((e) => e.type === 'FILLING').length;
    const fillingDurationSec = dayEvents
      .filter((e) => e.type === 'FILLING')
      .reduce((s, e) => s + (e.durationSec ?? 0), 0);

    const hourForDay = hourly.filter((h) => h.hourKey.startsWith(dayKey));
    let peakHour: string | null = null;
    let peakVal = -1;
    for (const h of hourForDay) {
      if (h.consumptionL > peakVal) {
        peakVal = h.consumptionL;
        peakHour = h.hourKey;
      }
    }

    // Coverage vs expected samples (~1/min default) for that day clipped to range
    const dayStart = Math.max(rangeStart, readings[0]?.ts ?? rangeStart);
    const dayEnd = Math.min(rangeEnd, readings[readings.length - 1]?.ts ?? rangeEnd);
    const expected = Math.max(1, Math.floor((dayEnd - dayStart) / 60_000));
    const coverage = Math.min(100, (readings.length / expected) * 100);

    return {
      dayKey,
      openingLevelIn: opening,
      closingLevelIn: closing,
      openingVolumeL: opening != null ? volumeFromHeightIn(tank, opening) : null,
      closingVolumeL: closing != null ? volumeFromHeightIn(tank, closing) : null,
      consumptionL,
      netRefillL,
      refillEvents,
      fillingDurationSec,
      minLevelIn: levels.length ? Math.min(...levels) : null,
      maxLevelIn: levels.length ? Math.max(...levels) : null,
      avgLevelIn: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null,
      peakConsumptionHour: peakHour,
      dataCoveragePct: coverage,
    };
  });
}

export function peakConsumptionHourFromEvents(events: WaterEvent[]): string | null {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'CONSUMING' || e.estimatedVolumeL == null) continue;
    const key = hourKeyKolkata(e.startTs);
    map.set(key, (map.get(key) ?? 0) + e.estimatedVolumeL);
  }
  let best: string | null = null;
  let max = -1;
  for (const [k, v] of map) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}
