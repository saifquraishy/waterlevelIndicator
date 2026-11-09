import type { WaterEvent } from '../types/events.types';

/** Observed net refill from filling events (not gross pumped volume). */
export function totalNetRefillLitres(events: WaterEvent[]): number {
  return events
    .filter((e) => e.type === 'FILLING' && e.estimatedVolumeL != null)
    .reduce((sum, e) => sum + (e.estimatedVolumeL as number), 0);
}

export function refillByHour(
  events: WaterEvent[],
  hourKeyFn: (ts: number) => string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'FILLING' || e.estimatedVolumeL == null) continue;
    const key = hourKeyFn(e.startTs);
    map.set(key, (map.get(key) ?? 0) + e.estimatedVolumeL);
  }
  return map;
}
