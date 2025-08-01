// server.js (SQLite for two water tanks)
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// SQLite DB setup
const db = new sqlite3.Database('./waterlevels.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite database.');
});

// Create table with tank1 and tank2 levels
db.run(`
  CREATE TABLE IF NOT EXISTS water_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tank1_level REAL NOT NULL,
    tank2_level REAL NOT NULL,
    timestamp TEXT NOT NULL
  )
`);

// API: Save tank levels
app.post('/api/waterlevel', (req, res) => {
  const { tank1_level, tank2_level } = req.body;

  if (typeof tank1_level !== 'number' || typeof tank2_level !== 'number') {
    return res.status(400).json({ error: 'Invalid tank level values' });
  }

  const timestamp = new Date().toISOString();
  db.run(
    'INSERT INTO water_levels (tank1_level, tank2_level, timestamp) VALUES (?, ?, ?)',
    [tank1_level, tank2_level, timestamp],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ success: true, id: this.lastID });
    }
  );
});

// API: Get latest tank levels
app.get('/api/waterlevel/latest', (req, res) => {
  db.get(
    'SELECT tank1_level, tank2_level, timestamp FROM water_levels ORDER BY id DESC LIMIT 1',
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) {
        return res.json({
          tank1_level: 0,
          tank2_level: 0,
          timestamp: new Date().toISOString(),
        });
      }
      res.json(row);
    }
  );
});

// API: Get all history
app.get('/api/waterlevel/history', (req, res) => {
  db.all(
    'SELECT tank1_level, tank2_level, timestamp FROM water_levels ORDER BY id DESC',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`🚰 Server running at http://localhost:${PORT}`);
});
