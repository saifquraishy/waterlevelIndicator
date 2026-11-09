const TZ = 'Asia/Kolkata';

export function formatInKolkata(
  ts: number,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...options }).format(new Date(ts));
}

export function dayKeyKolkata(ts: number): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts));
}

export function hourKeyKolkata(ts: number): string {
  const day = dayKeyKolkata(ts);
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(ts));
  return `${day}T${hour}`;
}

export function hourLabelKolkata(hourKey: string): string {
  const [day, hour] = hourKey.split('T');
  return `${day} ${hour}:00`;
}

/** Hour number 0–23 from an hourKey like `2026-03-01T14`. */
export function hourOfDayFromHourKey(hourKey: string): number {
  const hour = Number(hourKey.slice(-2));
  return Number.isFinite(hour) ? hour : 0;
}

/** Clock label from 0–23, e.g. "2 PM". */
export function clockLabelFromHour(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12} ${ampm}`;
}

/** Clock label for a single-day hourly chart, e.g. "2 PM". */
export function clockLabelFromHourKey(hourKey: string): string {
  return clockLabelFromHour(hourOfDayFromHourKey(hourKey));
}

export function shortDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(dt);
}
