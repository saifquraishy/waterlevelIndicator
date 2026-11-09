const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export type WaterReading = {
  tank1_level: number;
  tank2_level: number;
  timestamp: string;
};

export type AnalyticsResponse = {
  from: string;
  to: string;
  lowThresholdCm: number;
  summary: {
    totalReadings: number;
    tank1: { avg: number | null; min: number | null; max: number | null; lowShare: number };
    tank2: { avg: number | null; min: number | null; max: number | null; lowShare: number };
  };
  hourly: Array<{
    hour: string;
    tank1_avg: number;
    tank2_avg: number;
    readings: number;
  }>;
  daily: Array<{
    day: string;
    tank1_min: number;
    tank1_max: number;
    tank1_avg: number;
    tank2_min: number;
    tank2_max: number;
    tank2_avg: number;
    readings: number;
  }>;
};

export function fetchLatest(): Promise<WaterReading> {
  return request<WaterReading>('/api/waterlevel/latest');
}

export function fetchHistory(params: { date?: string; from?: string; to?: string } = {}): Promise<WaterReading[]> {
  const q = new URLSearchParams();
  if (params.date) q.set('date', params.date);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return request<WaterReading[]>(`/api/waterlevel/history${qs ? `?${qs}` : ''}`);
}

export function fetchAnalytics(from: string, to: string): Promise<AnalyticsResponse> {
  const q = new URLSearchParams({ from, to });
  return request<AnalyticsResponse>(`/api/waterlevel/analytics?${q}`);
}
