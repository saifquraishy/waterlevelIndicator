import type { AnomalyInsight, DailyBucket, HourlyBucket } from '../types/analytics.types';
import type { InferredPumpEvent, WaterEvent } from '../types/events.types';
import type { TankId } from '../types/tank.types';
import { dayKeyKolkata } from './timeKeys';

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function detectAnomalies(input: {
  tankId: TankId;
  events: WaterEvent[];
  pumpEvents: InferredPumpEvent[];
  daily: DailyBucket[];
  hourly: HourlyBucket[];
  missingIntervals: number;
}): AnomalyInsight[] {
  const insights: AnomalyInsight[] = [];
  const { tankId, events, pumpEvents, daily, hourly, missingIntervals } = input;

  const consumptions = daily.map((d) => d.consumptionL).filter((v) => v > 0);
  const avg =
    consumptions.length > 0 ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length : 0;

  for (const d of daily) {
    if (avg > 0 && d.consumptionL > avg * 2.5 && d.consumptionL > 50) {
      insights.push({
        id: id('high_cons'),
        tankId,
        severity: 'warning',
        detectedAt: Date.parse(`${d.dayKey}T12:00:00+05:30`),
        description: `Possible abnormal water usage: unusually high estimated consumption on ${d.dayKey} (${d.consumptionL.toFixed(0)} L).`,
        confidence: 'MEDIUM',
        supporting: `Average daily consumption ~${avg.toFixed(0)} L`,
      });
    }
    if (d.refillEvents >= 6) {
      insights.push({
        id: id('freq_refill'),
        tankId,
        severity: 'warning',
        detectedAt: Date.parse(`${d.dayKey}T12:00:00+05:30`),
        description: `Frequent refill cycles detected on ${d.dayKey} (${d.refillEvents} inferred filling events).`,
        confidence: 'MEDIUM',
      });
    }
  }

  // Overnight decline 01:00–04:00 IST
  const overnight = hourly.filter((h) => {
    const hour = Number(h.hourKey.slice(-2));
    return hour >= 1 && hour <= 4 && h.consumptionL > 20;
  });
  if (overnight.length >= 2) {
    const total = overnight.reduce((s, h) => s + h.consumptionL, 0);
    insights.push({
      id: id('overnight'),
      tankId,
      severity: 'warning',
      detectedAt: overnight[0] ? Date.parse(overnight[0].hourKey + ':00:00+05:30') : Date.now(),
      description: `${tankId === 'tank1' ? 'Tank 1' : 'Tank 2'} experienced unusual water-level decline overnight (1 AM–4 AM). Estimated ${total.toFixed(0)} L across overnight hours.`,
      confidence: 'MEDIUM',
      supporting: 'Possible abnormal water usage — not a confirmed leak.',
    });
  }

  for (const p of pumpEvents) {
    if ((p.durationSec ?? 0) > 45 * 60) {
      insights.push({
        id: id('long_fill'),
        tankId,
        severity: 'info',
        detectedAt: p.startTs,
        description: `Unusually long inferred filling activity (${Math.round((p.durationSec as number) / 60)} min).`,
        confidence: p.confidence,
      });
    }
  }

  const fluct = events.filter((e) => e.type === 'SENSOR_ANOMALY').length;
  if (fluct >= 5) {
    insights.push({
      id: id('fluct'),
      tankId,
      severity: 'info',
      detectedAt: Date.now(),
      description: `Unexpected sensor fluctuations: ${fluct} anomaly readings in the selected range.`,
      confidence: 'MEDIUM',
    });
  }

  if (missingIntervals >= 3) {
    insights.push({
      id: id('gaps'),
      tankId,
      severity: 'info',
      detectedAt: Date.now(),
      description: `Missing sensor readings: ${missingIntervals} data gaps exceeded the configured maximum.`,
      confidence: 'HIGH',
    });
  }

  // Possible continuous leakage: many short consumption events on same day with low refill
  for (const d of daily) {
    const dayCons = events.filter(
      (e) => e.type === 'CONSUMING' && dayKeyKolkata(e.startTs) === d.dayKey
    );
    if (dayCons.length >= 8 && d.netRefillL < d.consumptionL * 0.2 && d.consumptionL > 30) {
      insights.push({
        id: id('leak'),
        tankId,
        severity: 'critical',
        detectedAt: Date.parse(`${d.dayKey}T12:00:00+05:30`),
        description: `Possible abnormal water usage on ${d.dayKey}: many declining periods with little observed refill. Investigate for continuous leakage.`,
        confidence: 'LOW',
        supporting: 'Rule-based heuristic — requires physical verification.',
      });
    }
  }

  return insights;
}
