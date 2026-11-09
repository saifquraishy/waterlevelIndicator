export type TankId = 'tank1' | 'tank2';

export type TankType = 'overhead' | 'underground';
export type TankShape = 'rectangular' | 'cylindrical';
export type SensorMeasurement = 'WATER_HEIGHT' | 'SENSOR_DISTANCE';

/** Raw API stores centimetres; analytics works in inches after normalisation. */
export type ApiLevelUnit = 'cm';

export interface TankDimensions {
  lengthFt?: number;
  widthFt?: number;
  diameterFt?: number;
  heightFt: number;
}

export interface TankConfig {
  id: TankId;
  name: string;
  type: TankType;
  shape: TankShape;
  lengthFt: number | null;
  widthFt: number | null;
  diameterFt: number | null;
  heightFt: number | null;
  /** Maximum usable water height in inches */
  maxWaterHeightIn: number | null;
  /** Minimum usable water height in inches */
  minWaterHeightIn: number | null;
  sensorMeasurement: SensorMeasurement;
  /** Calibration offset in inches */
  sensorOffsetIn: number;
  /** API raw unit (device currently sends cm) */
  apiUnit: ApiLevelUnit;
  enabled: boolean;
}

export interface TankDerivedMetrics {
  configured: boolean;
  litresPerInch: number | null;
  capacityLitres: number | null;
  usableCapacityLitres: number | null;
  usableHeightIn: number | null;
}

export const TANK_CONFIG_SCHEMA_VERSION = 1;

export interface TankConfigStore {
  version: number;
  tanks: Record<TankId, TankConfig>;
  updatedAt: string;
}

export function createEmptyTankConfig(id: TankId, name: string): TankConfig {
  return {
    id,
    name,
    type: 'overhead',
    shape: 'rectangular',
    lengthFt: null,
    widthFt: null,
    diameterFt: null,
    heightFt: null,
    maxWaterHeightIn: null,
    minWaterHeightIn: null,
    sensorMeasurement: 'WATER_HEIGHT',
    sensorOffsetIn: 0,
    apiUnit: 'cm',
    enabled: true,
  };
}

export function defaultTankConfigStore(): TankConfigStore {
  return {
    version: TANK_CONFIG_SCHEMA_VERSION,
    tanks: {
      tank1: createEmptyTankConfig('tank1', 'Tank 1'),
      tank2: createEmptyTankConfig('tank2', 'Tank 2'),
    },
    updatedAt: new Date().toISOString(),
  };
}
