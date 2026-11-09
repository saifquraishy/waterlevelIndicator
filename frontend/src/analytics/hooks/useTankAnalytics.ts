import { useMemo } from 'react';
import { useWaterUtilization } from './useWaterUtilization';
import type { TankId } from '../types/tank.types';

/** Per-tank analytics slice for the selected date range. */
export function useTankAnalytics(tankId: TankId, fromDate: string, toDate: string) {
  const { loading, error, results, tankStore } = useWaterUtilization(fromDate, toDate);
  const result = results[tankId];
  const tank = tankStore.tanks[tankId];

  return useMemo(
    () => ({ loading, error, tank, result }),
    [loading, error, tank, result]
  );
}
