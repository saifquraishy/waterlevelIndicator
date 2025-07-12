// server.js (SQLite version)
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Setup SQLite database
const db = new sqlite3.Database('./waterlevels.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite database.');
});

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS water_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level REAL NOT NULL,
    timestamp TEXT NOT NULL
  )
`);

// Save new water level
app.post('/api/waterlevel', (req, res) => {
  const { level } = req.body;
  if (typeof level !== 'number') {
    return res.status(400).json({ error: 'Invalid level' });
  }
  const timestamp = new Date().toISOString();
  db.run('INSERT INTO water_levels (level, timestamp) VALUES (?, ?)', [level, timestamp], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ success: true });
  });
});

// Get latest water level
app.get('/api/waterlevel/latest', (req, res) => {
  db.get('SELECT level, timestamp FROM water_levels ORDER BY id DESC LIMIT 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ level: 0, timestamp: new Date().toISOString() });
    res.json(row);
  });
});

// Get history
app.get('/api/waterlevel/history', (req, res) => {
  db.all('SELECT level, timestamp FROM water_levels ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});



app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
