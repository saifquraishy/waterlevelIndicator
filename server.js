// server.js — Neon Postgres primary with automatic SQLite fallback
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN }
  : undefined;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

// Health / storage mode (useful while Neon quota is exhausted)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ...db.getStatus() });
});

// API: Save tank levels (device-compatible)
app.post('/api/waterlevel', async (req, res) => {
  const { tank1_level, tank2_level } = req.body;

  if (typeof tank1_level !== 'number' || typeof tank2_level !== 'number') {
    return res.status(400).json({ error: 'Invalid tank level values' });
  }

  try {
    const result = await db.insert(tank1_level, tank2_level);
    res.status(201).json({ success: true, id: result.id, storage: result.storage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get latest tank levels
app.get('/api/waterlevel/latest', async (req, res) => {
  try {
    const row = await db.latest();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: History (optional ?date=YYYY-MM-DD, or ?from=&to= ISO dates)
app.get('/api/waterlevel/history', async (req, res) => {
  const { date, from, to } = req.query;
  try {
    const rows = await db.history({ date, from, to });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Analytics aggregates for dashboard (server-side; frontend also computes its own)
app.get('/api/waterlevel/analytics', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = req.query.to || new Date().toISOString();
  const lowThresholdCm = Number(req.query.lowThreshold) || 26.67;

  try {
    const payload = await db.analytics({ from, to, lowThresholdCm });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

db.init()
  .then(() => {
    const status = db.getStatus();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Storage mode: ${status.storage}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
