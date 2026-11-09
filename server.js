// server.js — Neon PostgreSQL for two water tanks
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN }
  : undefined;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in .env (Neon connection string).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
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
  console.log('Connected to Neon PostgreSQL.');
}

// API: Save tank levels (device-compatible)
app.post('/api/waterlevel', async (req, res) => {
  const { tank1_level, tank2_level } = req.body;

  if (typeof tank1_level !== 'number' || typeof tank2_level !== 'number') {
    return res.status(400).json({ error: 'Invalid tank level values' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO water_levels (tank1_level, tank2_level, timestamp)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [tank1_level, tank2_level]
    );
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get latest tank levels
app.get('/api/waterlevel/latest', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tank1_level, tank2_level, timestamp
       FROM water_levels
       ORDER BY timestamp DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({
        tank1_level: 0,
        tank2_level: 0,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: History (optional ?date=YYYY-MM-DD, or ?from=&to= ISO dates)
app.get('/api/waterlevel/history', async (req, res) => {
  const { date, from, to } = req.query;

  try {
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
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Analytics aggregates for dashboard
app.get('/api/waterlevel/analytics', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = req.query.to || new Date().toISOString();
  const lowThresholdCm = Number(req.query.lowThreshold) || 26.67; // ~10.5 in (25% of 42 in)

  try {
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

    res.json({
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
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
