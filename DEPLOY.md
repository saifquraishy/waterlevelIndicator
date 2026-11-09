# Deploy: Neon + Render + GitHub Pages

Target setup:

```text
Device  →  Render (Express API)  →  Neon Postgres
Browser →  GitHub Pages (React)  →  Render API
```

Dashboard URL (project Pages):  
`https://saifquraishy.github.io/waterlevelIndicator/#/`

## 1. Neon (database)

1. Create a project at [Neon](https://neon.tech).
2. Copy the connection string (`?sslmode=require`).
3. Keep it in Render env vars only — never commit real credentials.
4. If a password was ever committed (e.g. in `.env.example`), **rotate it in Neon**.

## 2. Render (API)

1. New **Web Service** from this repo (`https://github.com/saifquraishy/waterlevelIndicator`).
2. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Root directory:** leave default (repo root = this Backend API)
3. Environment variables:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
FRONTEND_ORIGIN=https://saifquraishy.github.io
```

`PORT` is set by Render automatically; `server.js` already reads `process.env.PORT`.

4. Deploy. Logs should show: `Connected to Neon PostgreSQL.`
5. Note your service URL, e.g. `https://waterlevel-api.onrender.com`.

### Device still posts to the same path

```http
POST https://YOUR-RENDER-URL/api/waterlevel
Content-Type: application/json

{ "tank1_level": 80.5, "tank2_level": 62.0 }
```

## 3. GitHub Pages (React dashboard)

The frontend uses:

- **`HashRouter`** — routes like `/#/history` work on Pages without 404 hacks
- **`VITE_BASE_PATH=/waterlevelIndicator/`** — asset paths for a project site
- **`VITE_API_BASE_URL`** — your Render API URL

### One-time repo setup

1. **Settings → Pages → Source:** GitHub Actions  
2. **Settings → Secrets and variables → Actions → Variables:**

| Variable | Example |
|----------|---------|
| `VITE_API_BASE_URL` | `https://YOUR-RENDER-URL.onrender.com` |
| `VITE_BASE_PATH` | `/waterlevelIndicator/` |

3. Push to `main`/`master` (or run **Actions → Deploy dashboard to GitHub Pages → Run workflow**).  
   Workflow file: [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml)

### Local dashboard

```bash
cd frontend
cp .env.example .env
# .env for local:
# VITE_API_BASE_URL=http://localhost:3000
# VITE_BASE_PATH=/
npm install
npm run dev
```

Production build locally (matches Pages paths):

```bash
cd frontend
# edit .env.production with your real Render URL
npm run build
```

## 4. API routes

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/waterlevel` | Insert reading |
| GET | `/api/waterlevel/latest` | Newest row |
| GET | `/api/waterlevel/history?date=` or `?from=&to=` | Filtered history |
| GET | `/api/waterlevel/analytics?from=&to=` | Aggregates for Analytics page |

## 5. Cutover checklist

- [ ] Neon DB created; password not in git
- [ ] Render has `DATABASE_URL` + `FRONTEND_ORIGIN=https://saifquraishy.github.io`
- [ ] Render health: `GET /api/waterlevel/latest` works
- [ ] Device POSTs to Render URL
- [ ] GitHub Actions vars set (`VITE_API_BASE_URL`, `VITE_BASE_PATH`)
- [ ] Pages source = GitHub Actions; workflow succeeded
- [ ] Open `https://saifquraishy.github.io/waterlevelIndicator/#/` — Current / History / Analytics load without CORS errors

## 6. Optional: migrate old SQLite rows

If you still have `waterlevels.db` and want history in Neon, export and insert once. New readings do not need SQLite.
