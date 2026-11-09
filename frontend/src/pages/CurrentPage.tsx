import { useEffect, useState } from 'react';
import { fetchLatest, type WaterReading } from '../api/client';
import { TankGauge } from '../components/TankGauge';

const POLL_MS = 10_000;

export function CurrentPage() {
  const [data, setData] = useState<WaterReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const reading = await fetchLatest();
      setData(reading);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load levels');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    const id = window.setInterval(() => void load(false), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="panel">
      <h2>Current levels</h2>
      <p className="lead">Live tank readings refresh every 10 seconds.</p>

      {error && <div className="status-error">{error}</div>}

      <div className="tank-grid">
        <TankGauge label="Tank 1" levelCm={data?.tank1_level ?? 0} />
        <TankGauge label="Tank 2" levelCm={data?.tank2_level ?? 0} />
      </div>

      <div className="meta-row">
        <span>
          Last updated:{' '}
          {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '—'}
        </span>
        <button className="btn btn-primary" type="button" disabled={loading} onClick={() => void load(true)}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </section>
  );
}
