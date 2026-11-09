import type { TankId } from './tank.types';

export type TrendState = 'STABLE' | 'FILLING' | 'CONSUMING' | 'SENSOR_ANOMALY' | 'DATA_GAP';

export type WaterEventType = 'FILLING' | 'CONSUMING' | 'SENSOR_ANOMALY' | 'DATA_GAP';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface WaterEvent {
  id: string;
  tankId: TankId;
  type: WaterEventType;
  startTs: number;
  endTs: number | null;
  startLevelIn: number;
  endLevelIn: number | null;
  durationSec: number | null;
  estimatedVolumeL: number | null;
  confidence: ConfidenceLevel;
  incomplete: boolean;
  notes?: string;
}

export interface InferredPumpEvent {
  id: string;
  tankId: TankId;
  startTs: number;
  endTs: number | null;
  durationSec: number | null;
  levelIncreaseIn: number | null;
  estimatedNetRefillL: number | null;
  confidence: ConfidenceLevel;
  incomplete: boolean;
  label: 'Inferred filling activity';
}
