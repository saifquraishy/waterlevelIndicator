# Water Utilization Analytics — Delivery Notes

## Inspection summary

| Item | Finding |
|------|---------|
| Architecture | Vite + React + TypeScript, HashRouter |
| Nav | Current / History / Analytics (+ new Settings) |
| Old Analytics | Server `/api/waterlevel/analytics` aggregates |
| History | `GET /api/waterlevel/history?from=&to=` |
| Reading schema | `{ tank1_level, tank2_level, timestamp }` — levels in **cm** |
| Tank IDs | `tank1` / `tank2` fields on each reading |
| Charts | Recharts |
| Settings API | None — using versioned **localStorage** |

## API endpoints reused

- `GET /api/waterlevel/history?from=&to=` — raw readings for selected range  
- `GET /api/waterlevel/latest` — optional current volume preview in Settings  

ESP32 `POST /api/waterlevel` unchanged.

## Configuration storage

| Store | Key | Version |
|-------|-----|---------|
| Tanks | `aquasense.tankConfig.v1` | 1 |
| Thresholds | `aquasense.analyticsConfig.v1` | 1 |

Encapsulated in `tankConfigService` / `analyticsConfigService` for later backend migration.

**No hardcoded tank dimensions.** Until configured, litre analytics are disabled for that tank.

## How calculations work

1. Fetch raw cm readings for the date range.  
2. Convert to inches; apply sensor mode + offset.  
3. Rolling median filter (does not overwrite raw history).  
4. Per-tank state machine: STABLE / FILLING / CONSUMING / DATA_GAP / SENSOR_ANOMALY.  
5. Consumption = sum of confirmed **declining** events × litres/inch.  
6. Net refill = sum of confirmed **rising** events × litres/inch (observed net, not gross pump volume).  
7. Pump activity = inferred from FILLING events (never labelled as electrical ON/OFF).  
8. Daily/hourly aggregates in **Asia/Kolkata**.  
9. Rule-based insights (“Possible abnormal water usage”).

## Configure both tanks

1. Open **Settings**.  
2. Select Tank 1 → enter name, shape, length/width (or diameter), height (ft), min/max water height (in), sensor mode/offset → **Save tank**.  
3. Adjust analytics thresholds if needed → **Save thresholds**.  
4. Repeat for Tank 2.  
5. Open **Analytics**, pick a date range.

Rectangular litres/inch = `lengthFt × widthFt × 2.359733`.

## Tests

```bash
cd frontend
npm test
```

**Result:** 14/14 passed (vitest).

## Known limitations

- Simultaneous fill + consumption cannot be separated from level-only sensors; concurrent use is marked unmeasured rather than invented.  
- Inferred pump activity is not electrical confirmation.  
- localStorage is per-browser (not shared across devices).  
- Very noisy sensors may need larger median window / thresholds.  
- Event start level is taken at confirmation time (slight under-count of early rise/fall).

## Files created (high level)

- `src/analytics/types/*`
- `src/analytics/engine/*` (+ `analyticsEngine.test.ts`)
- `src/analytics/services/*`
- `src/analytics/hooks/*`
- `src/pages/SettingsPage.tsx`
- `frontend/ANALYTICS.md`

## Files modified

- `src/pages/AnalyticsPage.tsx` — utilization dashboard  
- `src/App.tsx`, `src/components/Layout.tsx`, `src/index.css`  
- `package.json`, `vite.config.ts`
