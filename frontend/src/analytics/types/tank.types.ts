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

/** v2 embeds the installed overhead rectangular tank internal dimensions. */
export const TANK_CONFIG_SCHEMA_VERSION = 2;

export interface TankConfigStore {
  version: number;
  tanks: Record<TankId, TankConfig>;
  updatedAt: string;
}

/**
 * Site defaults — internal (inside) tank dimensions.
 * Tank 1: 4.75 × 4.5 × 3.5 ft, usable water 1–40 in
 * Tank 2: 7 × 4 × 3 ft, usable water 1–35 in
 */
export function createDefaultTankConfig(id: TankId): TankConfig {
  if (id === 'tank1') {
    return {
      id: 'tank1',
      name: 'Tank 1',
      type: 'overhead',
      shape: 'rectangular',
      lengthFt: 4.75,
      widthFt: 4.5,
      diameterFt: null,
      heightFt: 3.5,
      maxWaterHeightIn: 40,
      minWaterHeightIn: 1,
      sensorMeasurement: 'WATER_HEIGHT',
      sensorOffsetIn: 0,
      apiUnit: 'cm',
      enabled: true,
    };
  }

  return {
    id: 'tank2',
    name: 'Tank 2',
    type: 'overhead',
    shape: 'rectangular',
    lengthFt: 7,
    widthFt: 4,
    diameterFt: null,
    heightFt: 3,
    maxWaterHeightIn: 35,
    minWaterHeightIn: 1,
    sensorMeasurement: 'WATER_HEIGHT',
    sensorOffsetIn: 0,
    apiUnit: 'cm',
    enabled: true,
  };
}

/** @deprecated use createDefaultTankConfig — kept for callers that want a blank template */
export function createEmptyTankConfig(id: TankId, name: string): TankConfig {
  return {
    ...createDefaultTankConfig(id),
    name,
    lengthFt: null,
    widthFt: null,
    diameterFt: null,
    heightFt: null,
    maxWaterHeightIn: null,
    minWaterHeightIn: null,
  };
}

export function defaultTankConfigStore(): TankConfigStore {
  return {
    version: TANK_CONFIG_SCHEMA_VERSION,
    tanks: {
      tank1: createDefaultTankConfig('tank1'),
      tank2: createDefaultTankConfig('tank2'),
    },
    updatedAt: new Date().toISOString(),
  };
}
