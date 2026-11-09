import type { FilteredReading, NormalizedReading } from '../types/analytics.types';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Rolling median over valid readings; preserves timestamps; does not mutate raw history. */
export function applyMedianFilter(
  readings: NormalizedReading[],
  window: number
): FilteredReading[] {
  const w = Math.max(1, Math.floor(window));
  const result: FilteredReading[] = [];
  const buffer: number[] = [];

  for (const r of readings) {
    if (r.valid) {
      buffer.push(r.normalizedIn);
      if (buffer.length > w) buffer.shift();
      result.push({
        ts: r.ts,
        filteredIn: median(buffer),
        rawNormalizedIn: r.normalizedIn,
        valid: true,
      });
    } else {
      result.push({
        ts: r.ts,
        filteredIn: null,
        rawNormalizedIn: r.normalizedIn,
        valid: false,
      });
    }
  }
  return result;
}
