import {
  ANALYTICS_CONFIG_SCHEMA_VERSION,
  defaultAnalyticsConfigStore,
  defaultThresholds,
  type AnalyticsConfigStore,
  type AnalyticsThresholds,
} from '../types/analytics.types';
import type { TankId } from '../types/tank.types';

const STORAGE_KEY = 'aquasense.analyticsConfig.v1';

type Listener = (store: AnalyticsConfigStore) => void;
const listeners = new Set<Listener>();

function migrate(raw: unknown): AnalyticsConfigStore {
  const base = defaultAnalyticsConfigStore();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<AnalyticsConfigStore>;
  // v2: IoT-friendly cumulative detection defaults — refresh stored v1 thresholds
  if ((obj.version ?? 1) < 2) {
    return base;
  }
  return {
    version: ANALYTICS_CONFIG_SCHEMA_VERSION,
    thresholds: {
      tank1: { ...defaultThresholds(), ...(obj.thresholds?.tank1 ?? {}) },
      tank2: { ...defaultThresholds(), ...(obj.thresholds?.tank2 ?? {}) },
    },
    updatedAt: obj.updatedAt ?? new Date().toISOString(),
  };
}

export function loadAnalyticsConfig(): AnalyticsConfigStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAnalyticsConfigStore();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultAnalyticsConfigStore();
  }
}

export function saveAnalyticsConfig(store: AnalyticsConfigStore): AnalyticsConfigStore {
  const next = {
    ...store,
    version: ANALYTICS_CONFIG_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l(next));
  return next;
}

export function updateThresholds(id: TankId, patch: Partial<AnalyticsThresholds>): AnalyticsConfigStore {
  const current = loadAnalyticsConfig();
  current.thresholds[id] = { ...current.thresholds[id], ...patch };
  return saveAnalyticsConfig(current);
}

export function resetThresholds(id: TankId): AnalyticsConfigStore {
  return updateThresholds(id, defaultThresholds());
}

export function subscribeAnalyticsConfig(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
