import { useEffect, useState } from 'react';
import {
  loadAnalyticsConfig,
  resetThresholds,
  saveAnalyticsConfig,
  subscribeAnalyticsConfig,
} from '../services/analyticsConfigService';
import type { AnalyticsConfigStore } from '../types/analytics.types';
import type { TankId } from '../types/tank.types';

export function useAnalyticsConfig() {
  const [store, setStore] = useState<AnalyticsConfigStore>(() => loadAnalyticsConfig());

  useEffect(() => subscribeAnalyticsConfig(setStore), []);

  return {
    store,
    thresholds: store.thresholds,
    save: (next: AnalyticsConfigStore) => setStore(saveAnalyticsConfig(next)),
    resetTank: (id: TankId) => setStore(resetThresholds(id)),
  };
}
