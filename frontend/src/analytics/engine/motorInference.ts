import type { InferredPumpEvent, WaterEvent } from '../types/events.types';
import type { TankId } from '../types/tank.types';

/**
 * Infer filling/pump activity from FILLING water events.
 * Never labelled as confirmed electrical motor ON/OFF.
 */
export function inferPumpActivity(tankId: TankId, events: WaterEvent[]): InferredPumpEvent[] {
  return events
    .filter((e) => e.type === 'FILLING')
    .map((e) => ({
      id: `pump_${e.id}`,
      tankId,
      startTs: e.startTs,
      endTs: e.endTs,
      durationSec: e.durationSec,
      levelIncreaseIn:
        e.endLevelIn != null ? Math.max(0, e.endLevelIn - e.startLevelIn) : null,
      estimatedNetRefillL: e.estimatedVolumeL,
      confidence: e.confidence,
      incomplete: e.incomplete,
      label: 'Inferred filling activity' as const,
    }));
}

export function pumpStats(events: InferredPumpEvent[]) {
  const closed = events.filter((e) => e.durationSec != null);
  const durations = closed.map((e) => e.durationSec as number);
  const total = durations.reduce((a, b) => a + b, 0);
  return {
    activations: events.length,
    totalDurationSec: total,
    avgDurationSec: durations.length ? total / durations.length : 0,
    longestDurationSec: durations.length ? Math.max(...durations) : 0,
  };
}
