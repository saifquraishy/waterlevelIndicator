import { useEffect, useMemo, useState } from 'react';
import { fetchHistory, type WaterReading } from '../../api/client';
import { endOfLocalDayIso, startOfLocalDayIso } from '../../utils/units';
import { analyzeBothTanks } from '../services/analyticsService';
import { loadAnalyticsConfig, subscribeAnalyticsConfig } from '../services/analyticsConfigService';
import { loadTankConfig, subscribeTankConfig } from '../services/tankConfigService';
import type { TankAnalyticsResult } from '../types/analytics.types';
import type { TankId } from '../types/tank.types';

export function useWaterUtilization(fromDate: string, toDate: string) {
  const [readings, setReadings] = useState<WaterReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tankStore, setTankStore] = useState(() => loadTankConfig());
  const [analyticsStore, setAnalyticsStore] = useState(() => loadAnalyticsConfig());
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeTankConfig((s) => { setTankStore(s); setTick((t) => t + 1); }), []);
  useEffect(() => subscribeAnalyticsConfig((s) => { setAnalyticsStore(s); setTick((t) => t + 1); }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHistory({ from: startOfLocalDayIso(fromDate), to: endOfLocalDayIso(toDate) })
      .then((rows) => {
        if (!cancelled) {
          setReadings(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load readings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  const rangeStart = useMemo(() => new Date(startOfLocalDayIso(fromDate)).getTime(), [fromDate]);
  const rangeEnd = useMemo(() => new Date(endOfLocalDayIso(toDate)).getTime(), [toDate]);

  const results = useMemo(() => {
    void tick;
    return analyzeBothTanks({
      tanks: tankStore.tanks,
      thresholds: analyticsStore.thresholds,
      readings,
      rangeStart,
      rangeEnd,
    });
  }, [tankStore, analyticsStore, readings, rangeStart, rangeEnd, tick]);

  return {
    loading,
    error,
    readings,
    results: results as Record<TankId, TankAnalyticsResult>,
    tankStore,
    analyticsStore,
  };
}
