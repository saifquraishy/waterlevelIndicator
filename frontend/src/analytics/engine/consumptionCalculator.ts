import type { WaterEvent } from '../types/events.types';

/** Sum confirmed consumption events (declining periods only). */
export function totalConsumptionLitres(events: WaterEvent[]): number {
  return events
    .filter((e) => e.type === 'CONSUMING' && e.estimatedVolumeL != null && e.confidence !== 'LOW')
    .reduce((sum, e) => sum + (e.estimatedVolumeL as number), 0);
}

export function consumptionByHour(
  events: WaterEvent[],
  hourKeyFn: (ts: number) => string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'CONSUMING' || e.estimatedVolumeL == null || e.confidence === 'LOW') continue;
    const key = hourKeyFn(e.startTs);
    map.set(key, (map.get(key) ?? 0) + e.estimatedVolumeL);
  }
  return map;
}
