import type { ConfidenceLevel } from '../types/events.types';

export function scoreConfidence(input: {
  readingCount: number;
  durationSec: number;
  gapCount: number;
  anomalyCount: number;
  minEventDurationSec: number;
}): ConfidenceLevel {
  let score = 100;
  if (input.readingCount < 3) score -= 40;
  else if (input.readingCount < 6) score -= 15;
  if (input.durationSec < input.minEventDurationSec) score -= 25;
  score -= Math.min(40, input.gapCount * 15);
  score -= Math.min(30, input.anomalyCount * 10);

  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

export function overallConfidence(coveragePct: number, invalidRatio: number): ConfidenceLevel {
  if (coveragePct >= 85 && invalidRatio < 0.05) return 'HIGH';
  if (coveragePct >= 60 && invalidRatio < 0.15) return 'MEDIUM';
  return 'LOW';
}
