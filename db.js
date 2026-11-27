/**
 * Dual storage: Neon Postgres (primary) with automatic JSON-file fallback.
 * When Neon compute/quota/connection fails, reads/writes continue on a local file.
 * Periodically retries Neon and switches back when healthy.
 *
 * Uses a JSON file (not native SQLite) so installs work on Windows and Render
 * without node-gyp / Visual Studio toolchains.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const FALLBACK_PATH =
  process.env.FALLBACK_PATH || path.join(__dirname, 'waterlevels-fallback.json');
const NEON_RETRY_MS = Number(process.env.NEON_RETRY_MS) || 5 * 60 * 1000;
const MAX_FALLBACK_ROWS = Number(process.env.MAX_FALLBACK_ROWS) || 20000;

let pool = null;
/** @type {'neon' | 'file'} */
let mode = 'file';
let lastNeonAttempt = 0;
let lastError = null;
/** @type {Array<{id:number,tank1_level:number,tank2_level:number,timestamp:string}>} */
let fileRows = [];
let nextId = 1;

function isNeonFailure(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === '57P01' ||
    code === '57P03' ||
    code === '53300' ||
    code === '08006' ||
    code === '08001' ||
    msg.includes('timeout') ||
    msg.includes('terminated') ||
    msg.includes('connection') ||
    msg.includes('quota') ||
    msg.includes('compute') ||
    msg.includes('limit') ||
    msg.includes('exceeded') ||
    msg.includes('remaining compute') ||
    msg.includes('password authentication failed') ||
    msg.includes('ssl') ||
    msg.includes('neon')
  );
}

function loadFileStore() {
  try {
    if (!fs.existsSync(FALLBACK_PATH)) {
      fileRows = [];
      nextId = 1;
      saveFileStore();
      console.log(`File fallback ready at ${FALLBACK_PATH}`);
      return;
    }
    const raw = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
    fileRows = Array.isArray(raw.rows) ? raw.rows : [];
    nextId = Number(raw.nextId) || (fileRows.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1);
    console.log(`File fallback loaded (${fileRows.length} rows) from ${FALLBACK_PATH}`);
  } catch (err) {
    console.warn(`Could not load fallback file (${err.message}); starting empty.`);
    fileRows = [];
    nextId = 1;
  }
}

function saveFileStore() {
  if (fileRows.length > MAX_FALLBACK_ROWS) {
    fileRows = fileRows.slice(fileRows.length - MAX_FALLBACK_ROWS);
  }
  const payload = JSON.stringify({ nextId, rows: fileRows });
  fs.writeFileSync(FALLBACK_PATH, payload);
}

async function tryNeon() {
  if (!process.env.DATABASE_URL) return false;
  lastNeonAttempt = Date.now();
  try {
    if (!pool) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 10000,
        max: 5,
      });
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS water_levels (
        id BIGSERIAL PRIMARY KEY,
        tank1_level DOUBLE PRECISION NOT NULL,
        tank2_level DOUBLE PRECISION NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_water_levels_timestamp
      ON water_levels (timestamp DESC)
    `);
    await pool.query('SELECT 1');
    if (mode !== 'neon') {
      console.log('Connected to Neon PostgreSQL (primary).');
    }
    mode = 'neon';
    lastError = null;
    return true;
  } catch (err) {
    lastError = err.message;
    console.warn(`Neon unavailable (${err.message}). Using file fallback.`);
    mode = 'file';
    return false;
  }
}

async function maybeRetryNeon() {
  if (mode === 'neon') return;
  if (!process.env.DATABASE_URL) return;
  if (Date.now() - lastNeonAttempt < NEON_RETRY_MS) return;
  await tryNeon();
}

function fileInsert(tank1_level, tank2_level, timestamp = new Date().toISOString()) {
  const row = {
    id: nextId++,
    tank1_level,
    tank2_level,
    timestamp,
  };
  fileRows.push(row);
  saveFileStore();
  return { id: row.id, timestamp: row.timestamp };
}

function fileLatest() {
  if (!fileRows.length) return null;
  return [...fileRows].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (tb !== ta) return tb - ta;
    return (b.id || 0) - (a.id || 0);
  })[0];
}

function fileHistory({ date, from, to } = {}) {
  let rows = [...fileRows];
  if (date) {
    rows = rows.filter((r) => String(r.timestamp).slice(0, 10) === date);
  } else {
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() : null;
    rows = rows.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      if (Number.isNaN(t)) return false;
      if (fromTs != null && t < fromTs) return false;
      if (toTs != null && t > toTs) return false;
      return true;
    });
  }
  return rows
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp) || b.id - a.id)
    .map(({ tank1_level, tank2_level, timestamp }) => ({ tank1_level, tank2_level, timestamp }));
}

function fileAnalytics({ from, to, lowThresholdCm }) {
  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime();
  const rows = fileRows
    .filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return !Number.isNaN(t) && t >= fromTs && t <= toTs;
    })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const hourlyMap = new Map();
  const dailyMap = new Map();
  let tank1Low = 0;
  let tank2Low = 0;
  let sum1 = 0;
  let sum2 = 0;
  let min1 = Infinity;
  let min2 = Infinity;
  let max1 = -Infinity;
  let max2 = -Infinity;

  for (const r of rows) {
    const ts = new Date(r.timestamp);
    const hourKey = new Date(
      Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), ts.getUTCHours())
    ).toISOString();
    const dayKey = ts.toISOString().slice(0, 10);

    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, { hour: hourKey, tank1: 0, tank2: 0, readings: 0 });
    }
    const h = hourlyMap.get(hourKey);
    h.tank1 += r.tank1_level;
    h.tank2 += r.tank2_level;
    h.readings += 1;

    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, {
        day: dayKey,
        tank1_min: r.tank1_level,
        tank1_max: r.tank1_level,
        tank1_sum: 0,
        tank2_min: r.tank2_level,
        tank2_max: r.tank2_level,
        tank2_sum: 0,
        readings: 0,
      });
    }
    const d = dailyMap.get(dayKey);
    d.tank1_min = Math.min(d.tank1_min, r.tank1_level);
    d.tank1_max = Math.max(d.tank1_max, r.tank1_level);
    d.tank1_sum += r.tank1_level;
    d.tank2_min = Math.min(d.tank2_min, r.tank2_level);
    d.tank2_max = Math.max(d.tank2_max, r.tank2_level);
    d.tank2_sum += r.tank2_level;
    d.readings += 1;

    sum1 += r.tank1_level;
    sum2 += r.tank2_level;
    min1 = Math.min(min1, r.tank1_level);
    min2 = Math.min(min2, r.tank2_level);
    max1 = Math.max(max1, r.tank1_level);
    max2 = Math.max(max2, r.tank2_level);
    if (r.tank1_level < lowThresholdCm) tank1Low += 1;
    if (r.tank2_level < lowThresholdCm) tank2Low += 1;
  }

  const total = rows.length;
  return {
    from,
    to,
    lowThresholdCm,
    summary: {
      totalReadings: total,
      tank1: {
        avg: total ? sum1 / total : null,
        min: total ? min1 : null,
        max: total ? max1 : null,
        lowShare: total ? tank1Low / total : 0,
      },
      tank2: {
        avg: total ? sum2 / total : null,
        min: total ? min2 : null,
        max: total ? max2 : null,
        lowShare: total ? tank2Low / total : 0,
      },
    },
    hourly: [...hourlyMap.values()]
      .sort((a, b) => a.hour.localeCompare(b.hour))
      .map((h) => ({
        hour: h.hour,
        tank1_avg: h.tank1 / h.readings,
        tank2_avg: h.tank2 / h.readings,
        readings: h.readings,
      })),
    daily: [...dailyMap.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        day: d.day,
        tank1_min: d.tank1_min,
        tank1_max: d.tank1_max,
        tank1_avg: d.tank1_sum / d.readings,
        tank2_min: d.tank2_min,
        tank2_max: d.tank2_max,
        tank2_avg: d.tank2_sum / d.readings,
        readings: d.readings,
      })),
  };
}

async function neonInsert(tank1_level, tank2_level) {
  const result = await pool.query(
    `INSERT INTO water_levels (tank1_level, tank2_level, timestamp)
     VALUES ($1, $2, NOW())
     RETURNING id, timestamp`,
    [tank1_level, tank2_level]
  );
  return result.rows[0];
}

async function neonLatest() {
  const result = await pool.query(
    `SELECT tank1_level, tank2_level, timestamp
     FROM water_levels
     ORDER BY timestamp DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

async function neonHistory({ date, from, to } = {}) {
  let query = `
    SELECT tank1_level, tank2_level, timestamp
    FROM water_levels
  `;
  const params = [];

  if (date) {
    params.push(date);
    query += ` WHERE (timestamp AT TIME ZONE 'UTC')::date = $1::date`;
  } else if (from || to) {
    const clauses = [];
    if (from) {
      params.push(from);
      clauses.push(`timestamp >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      clauses.push(`timestamp <= $${params.length}::timestamptz`);
    }
    query += ` WHERE ${clauses.join(' AND ')}`;
  }

  query += ' ORDER BY timestamp DESC';
  const result = await pool.query(query, params);
  return result.rows;
}

async function neonAnalytics({ from, to, lowThresholdCm }) {
  const [hourly, daily, summary] = await Promise.all([
    pool.query(
      `SELECT
         date_trunc('hour', timestamp) AS hour,
         AVG(tank1_level) AS tank1_avg,
         AVG(tank2_level) AS tank2_avg,
         COUNT(*)::int AS readings
       FROM water_levels
       WHERE timestamp >= $1::timestamptz AND timestamp <= $2::timestamptz
       GROUP BY 1
       ORDER BY 1`,
      [from, to]
    ),
    pool.query(
      `SELECT
         (timestamp AT TIME ZONE 'UTC')::date AS day,
         MIN(tank1_level) AS tank1_min,
         MAX(tank1_level) AS tank1_max,
         AVG(tank1_level) AS tank1_avg,
         MIN(tank2_level) AS tank2_min,
         MAX(tank2_level) AS tank2_max,
         AVG(tank2_level) AS tank2_avg,
         COUNT(*)::int AS readings
       FROM water_levels
       WHERE timestamp >= $1::timestamptz AND timestamp <= $2::timestamptz
       GROUP BY 1
       ORDER BY 1`,
      [from, to]
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_readings,
         AVG(tank1_level) AS tank1_avg,
         AVG(tank2_level) AS tank2_avg,
         MIN(tank1_level) AS tank1_min,
         MIN(tank2_level) AS tank2_min,
         MAX(tank1_level) AS tank1_max,
         MAX(tank2_level) AS tank2_max,
         SUM(CASE WHEN tank1_level < $3 THEN 1 ELSE 0 END)::int AS tank1_low_count,
         SUM(CASE WHEN tank2_level < $3 THEN 1 ELSE 0 END)::int AS tank2_low_count
       FROM water_levels
       WHERE timestamp >= $1::timestamptz AND timestamp <= $2::timestamptz`,
      [from, to, lowThresholdCm]
    ),
  ]);

  const s = summary.rows[0] || {};
  const total = s.total_readings || 0;
  return {
    from,
    to,
    lowThresholdCm,
    summary: {
      totalReadings: total,
      tank1: {
        avg: s.tank1_avg,
        min: s.tank1_min,
        max: s.tank1_max,
        lowShare: total ? s.tank1_low_count / total : 0,
      },
      tank2: {
        avg: s.tank2_avg,
        min: s.tank2_min,
        max: s.tank2_max,
        lowShare: total ? s.tank2_low_count / total : 0,
      },
    },
    hourly: hourly.rows,
    daily: daily.rows,
  };
}

async function withFallback(neonFn, fileFn) {
  await maybeRetryNeon();

  if (mode === 'neon' && pool) {
    try {
      return await neonFn();
    } catch (err) {
      lastError = err.message;
      if (isNeonFailure(err)) {
        console.warn(`Neon query failed (${err.message}). Falling back to file store.`);
        mode = 'file';
        return fileFn();
      }
      throw err;
    }
  }

  return fileFn();
}

async function init() {
  loadFileStore();
  if (process.env.DATABASE_URL) {
    await tryNeon();
  } else {
    console.warn('DATABASE_URL not set — running file-fallback-only mode.');
    mode = 'file';
  }
}

async function insert(tank1_level, tank2_level) {
  return withFallback(
    async () => {
      const row = await neonInsert(tank1_level, tank2_level);
      try {
        fileInsert(tank1_level, tank2_level, new Date(row.timestamp).toISOString());
      } catch (_) {
        /* ignore mirror errors */
      }
      return { id: row.id, storage: 'neon' };
    },
    () => {
      const row = fileInsert(tank1_level, tank2_level);
      return { id: row.id, storage: 'file' };
    }
  );
}

async function latest() {
  const row = await withFallback(
    () => neonLatest(),
    () => fileLatest()
  );
  if (!row) {
    return {
      tank1_level: 0,
      tank2_level: 0,
      timestamp: new Date().toISOString(),
    };
  }
  return {
    tank1_level: row.tank1_level,
    tank2_level: row.tank2_level,
    timestamp: row.timestamp,
  };
}

async function history(params) {
  return withFallback(
    () => neonHistory(params),
    () => fileHistory(params)
  );
}

async function analytics(params) {
  return withFallback(
    () => neonAnalytics(params),
    () => fileAnalytics(params)
  );
}

function getStatus() {
  return {
    storage: mode,
    neonConfigured: Boolean(process.env.DATABASE_URL),
    lastError,
    fallbackPath: FALLBACK_PATH,
    fallbackRows: fileRows.length,
    neonRetryMs: NEON_RETRY_MS,
  };
}

module.exports = {
  init,
  insert,
  latest,
  history,
  analytics,
  getStatus,
};
