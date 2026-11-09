import type { ConfidenceLevel, InferredPumpEvent, TrendState, WaterEvent } from './events.types';
import type { TankId } from './tank.types';

export interface AnalyticsThresholds {
  samplingIntervalSec: number;
  medianWindow: number;
  minRefillRiseIn: number;
  minConsumptionFallIn: number;
  confirmationReadings: number;
  refillStableDurationSec: number;
  consumptionStableDurationSec: number;
  noiseToleranceIn: number;
  maxDataGapSec: number;
  minEventDurationSec: number;
}

export const ANALYTICS_CONFIG_SCHEMA_VERSION = 2;

export interface AnalyticsConfigStore {
  version: number;
  thresholds: Record<TankId, AnalyticsThresholds>;
  updatedAt: string;
}

/** Defaults tuned for typical ESP sampling (often 1–5 min) and gradual level change. */
export function defaultThresholds(): AnalyticsThresholds {
  return {
    samplingIntervalSec: 60,
    medianWindow: 3,
    minRefillRiseIn: 0.4,
    minConsumptionFallIn: 0.4,
    confirmationReadings: 2,
    refillStableDurationSec: 120,
    consumptionStableDurationSec: 180,
    noiseToleranceIn: 0.15,
    maxDataGapSec: 900, // allow slower / bursty device posts
    minEventDurationSec: 60,
  };
}

export function defaultAnalyticsConfigStore(): AnalyticsConfigStore {
  return {
    version: ANALYTICS_CONFIG_SCHEMA_VERSION,
    thresholds: {
      tank1: defaultThresholds(),
      tank2: defaultThresholds(),
    },
    updatedAt: new Date().toISOString(),
  };
}

export interface NormalizedReading {
  ts: number;
  rawIn: number;
  normalizedIn: number;
  valid: boolean;
  reason?: string;
}

export interface FilteredReading {
  ts: number;
  filteredIn: number | null;
  rawNormalizedIn: number;
  valid: boolean;
}

export interface TrendSample {
  ts: number;
  levelIn: number;
  deltaIn: number;
  state: TrendState;
}

export interface HourlyBucket {
  hourKey: string;
  label: string;
  consumptionL: number;
  netRefillL: number;
  fillingDurationSec: number;
  fillingEvents: number;
  avgLevelIn: number | null;
  readingCount: number;
}

export interface DailyBucket {
  dayKey: string;
  openingLevelIn: number | null;
  closingLevelIn: number | null;
  openingVolumeL: number | null;
  closingVolumeL: number | null;
  consumptionL: number;
  netRefillL: number;
  refillEvents: number;
  fillingDurationSec: number;
  minLevelIn: number | null;
  maxLevelIn: number | null;
  avgLevelIn: number | null;
  peakConsumptionHour: string | null;
  dataCoveragePct: number;
}

export interface AnomalyInsight {
  id: string;
  tankId: TankId;
  severity: 'info' | 'warning' | 'critical';
  detectedAt: number;
  description: string;
  confidence: ConfidenceLevel;
  supporting?: string;
}

export interface DataQualityReport {
  totalReadings: number;
  validReadings: number;
  invalidReadings: number;
  missingIntervals: number;
  dataCoveragePct: number;
  overallConfidence: ConfidenceLevel;
}

export interface TankAnalyticsResult {
  tankId: TankId;
  configured: boolean;
  litresPerInch: number | null;
  events: WaterEvent[];
  pumpEvents: InferredPumpEvent[];
  hourly: HourlyBucket[];
  daily: DailyBucket[];
  anomalies: AnomalyInsight[];
  quality: DataQualityReport;
  totals: {
    consumptionL: number;
    netRefillL: number;
    pumpActivations: number;
    fillingDurationSec: number;
    avgDailyConsumptionL: number;
    currentLevelIn: number | null;
    currentVolumeL: number | null;
    fillPct: number | null;
  };
}
