import type { TankConfig, TankDerivedMetrics } from '../types/tank.types';

const CUFT_TO_LITRES = 28.3168;
const LITRES_PER_INCH_FACTOR = 2.359733; // cu ft per inch * 28.3168 / 12 ≈ length*width*2.359733

export function isTankConfigured(tank: TankConfig): boolean {
  if (tank.heightFt == null || tank.heightFt <= 0) return false;
  if (tank.minWaterHeightIn == null || tank.maxWaterHeightIn == null) return false;
  if (tank.maxWaterHeightIn <= tank.minWaterHeightIn) return false;
  if (tank.shape === 'rectangular') {
    return tank.lengthFt != null && tank.lengthFt > 0 && tank.widthFt != null && tank.widthFt > 0;
  }
  return tank.diameterFt != null && tank.diameterFt > 0;
}

export function litresPerInch(tank: TankConfig): number | null {
  if (!isTankConfigured(tank)) return null;
  if (tank.shape === 'rectangular') {
    return (tank.lengthFt as number) * (tank.widthFt as number) * LITRES_PER_INCH_FACTOR;
  }
  const r = (tank.diameterFt as number) / 2;
  return (Math.PI * r * r * CUFT_TO_LITRES) / 12;
}

export function capacityLitres(tank: TankConfig): number | null {
  if (!isTankConfigured(tank)) return null;
  if (tank.shape === 'rectangular') {
    return (tank.lengthFt as number) * (tank.widthFt as number) * (tank.heightFt as number) * CUFT_TO_LITRES;
  }
  const r = (tank.diameterFt as number) / 2;
  return Math.PI * r * r * (tank.heightFt as number) * CUFT_TO_LITRES;
}

export function usableCapacityLitres(tank: TankConfig): number | null {
  const lpi = litresPerInch(tank);
  if (lpi == null || tank.minWaterHeightIn == null || tank.maxWaterHeightIn == null) return null;
  return (tank.maxWaterHeightIn - tank.minWaterHeightIn) * lpi;
}

export function deriveTankMetrics(tank: TankConfig): TankDerivedMetrics {
  const configured = isTankConfigured(tank);
  const lpi = litresPerInch(tank);
  const cap = capacityLitres(tank);
  const usable = usableCapacityLitres(tank);
  const usableHeight =
    tank.minWaterHeightIn != null && tank.maxWaterHeightIn != null
      ? tank.maxWaterHeightIn - tank.minWaterHeightIn
      : null;
  return {
    configured,
    litresPerInch: lpi,
    capacityLitres: cap,
    usableCapacityLitres: usable,
    usableHeightIn: usableHeight,
  };
}

export function volumeFromHeightIn(tank: TankConfig, heightIn: number): number | null {
  const lpi = litresPerInch(tank);
  if (lpi == null) return null;
  const min = tank.minWaterHeightIn ?? 0;
  const usable = Math.max(0, heightIn - min);
  return usable * lpi;
}

export function fillPercent(tank: TankConfig, heightIn: number): number | null {
  if (tank.minWaterHeightIn == null || tank.maxWaterHeightIn == null) return null;
  const span = tank.maxWaterHeightIn - tank.minWaterHeightIn;
  if (span <= 0) return null;
  return Math.min(100, Math.max(0, ((heightIn - tank.minWaterHeightIn) / span) * 100));
}

export function validateTankConfig(tank: TankConfig): string[] {
  const errors: string[] = [];
  if (!tank.name.trim()) errors.push('Tank name is required');
  if (tank.heightFt != null && tank.heightFt <= 0) errors.push('Height must be positive');
  if (tank.shape === 'rectangular') {
    if (tank.lengthFt != null && tank.lengthFt <= 0) errors.push('Length must be positive');
    if (tank.widthFt != null && tank.widthFt <= 0) errors.push('Width must be positive');
  } else if (tank.diameterFt != null && tank.diameterFt <= 0) {
    errors.push('Diameter must be positive');
  }
  if (
    tank.minWaterHeightIn != null &&
    tank.maxWaterHeightIn != null &&
    tank.maxWaterHeightIn <= tank.minWaterHeightIn
  ) {
    errors.push('Maximum water height must be greater than minimum');
  }
  return errors;
}
