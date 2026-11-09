import {
  defaultTankConfigStore,
  TANK_CONFIG_SCHEMA_VERSION,
  type TankConfig,
  type TankConfigStore,
  type TankId,
} from '../types/tank.types';

const STORAGE_KEY = 'aquasense.tankConfig.v1';

type Listener = (store: TankConfigStore) => void;
const listeners = new Set<Listener>();

function migrate(raw: unknown): TankConfigStore {
  const base = defaultTankConfigStore();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<TankConfigStore>;
  const version = obj.version ?? 1;
  if (version > TANK_CONFIG_SCHEMA_VERSION) return base;

  // v2: seed installed tank internal dimensions for users who had empty/unconfigured v1
  if (version < 2) {
    return base;
  }

  return {
    version: TANK_CONFIG_SCHEMA_VERSION,
    tanks: {
      tank1: { ...base.tanks.tank1, ...(obj.tanks?.tank1 ?? {}) },
      tank2: { ...base.tanks.tank2, ...(obj.tanks?.tank2 ?? {}) },
    },
    updatedAt: obj.updatedAt ?? new Date().toISOString(),
  };
}

export function loadTankConfig(): TankConfigStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTankConfigStore();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultTankConfigStore();
  }
}

export function saveTankConfig(store: TankConfigStore): TankConfigStore {
  const next = { ...store, version: TANK_CONFIG_SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l(next));
  return next;
}

export function updateTank(id: TankId, patch: Partial<TankConfig>): TankConfigStore {
  const current = loadTankConfig();
  current.tanks[id] = { ...current.tanks[id], ...patch, id };
  return saveTankConfig(current);
}

export function resetTanksToSiteDefaults(): TankConfigStore {
  return saveTankConfig(defaultTankConfigStore());
}

export function subscribeTankConfig(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
