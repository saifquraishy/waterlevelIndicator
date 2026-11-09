import { useMemo } from 'react';
import { pumpStats } from '../engine/motorInference';
import { useWaterUtilization } from './useWaterUtilization';
import type { TankId } from '../types/tank.types';

/** Inferred filling / estimated pump activity for one or both tanks. */
export function useMotorActivity(fromDate: string, toDate: string, tankFilter: 'both' | TankId = 'both') {
  const { loading, error, results, tankStore } = useWaterUtilization(fromDate, toDate);
  const ids: TankId[] = tankFilter === 'both' ? ['tank1', 'tank2'] : [tankFilter];

  const events = useMemo(
    () =>
      ids.flatMap((id) =>
        results[id].pumpEvents.map((e) => ({
          ...e,
          tankName: tankStore.tanks[id].name,
        }))
      ),
    [ids, results, tankStore]
  );

  const stats = useMemo(() => pumpStats(events), [events]);

  return { loading, error, events, stats };
}
