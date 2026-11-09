/** API stores levels in centimeters; UI displays inches. */
export const CM_PER_INCH = 2.54;
export const TANK_HEIGHT_INCHES = 42;

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inchesToPercent(inches: number): number {
  return Math.min(Math.max((inches / TANK_HEIGHT_INCHES) * 100, 0), 100);
}

export function levelTone(percent: number): 'low' | 'mid' | 'ok' {
  if (percent < 25) return 'low';
  if (percent < 50) return 'mid';
  return 'ok';
}

export function formatInches(cm: number | null | undefined, digits = 1): string {
  if (cm == null || Number.isNaN(Number(cm))) return '—';
  return cmToInches(Number(cm)).toFixed(digits);
}

export function toDateInputValue(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDayIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

export function endOfLocalDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}
