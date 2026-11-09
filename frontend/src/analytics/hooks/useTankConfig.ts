import { useEffect, useState } from 'react';
import { loadTankConfig, saveTankConfig, subscribeTankConfig } from '../services/tankConfigService';
import type { TankConfigStore } from '../types/tank.types';

export function useTankConfig() {
  const [store, setStore] = useState<TankConfigStore>(() => loadTankConfig());

  useEffect(() => subscribeTankConfig(setStore), []);

  return {
    store,
    tanks: store.tanks,
    save: (next: TankConfigStore) => setStore(saveTankConfig(next)),
    reload: () => setStore(loadTankConfig()),
  };
}
