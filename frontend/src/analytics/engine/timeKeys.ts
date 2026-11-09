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
