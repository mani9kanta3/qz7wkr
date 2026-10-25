# Wind Forecast Desk

A web app for a UK energy supplier's day-ahead trading team. It shows the **latest national wind generation forecast available at the time they place their day-ahead order**, and measures **how accurate those forecasts were**, so the team can buy power with the forecast error in mind.

Scope: purchase decisions made in **January 2026** (decision days 1-31 Jan, so delivery days 2 Jan to 1 Feb 2026), using only Elexon wind data.

**Live app:** https://uk-wind-forecast-monitor-lake.vercel.app

---

## What the app does

**1. Day-ahead forecast tab**
- Pick a decision day and a decision time (default **09:00 UK**, before the GB day-ahead auctions close at 09:20 EPEX / 09:50 N2EX).
- The app finds the **latest forecast published at or before that time** for every hour of the next day (the delivery day). Forecasts published after the decision time are never used.
- It shows the hourly forecast, a "likely range" band (based on January's P10-P90 error), summary cards (average, peak, lowest, total energy) and, as hindsight, the actual generation.
- It also shows when the next forecast run comes out. For example, at 09:00 the latest run is 07:30, and a new run arrives at 09:30, which is still before the N2EX auction closes.

**2. Forecast accuracy tab**
- Compares every January decision forecast with actual generation (744 delivery hours).
- Metrics: MAE, RMSE, bias, WAPE, P10/P50/P90 error, worst shortfall/surplus.
- Charts: daily forecast vs actual, daily error, error by hour of day, error histogram, error vs forecast horizon, and forecast vs actual scatter.
- A plain-English "what this means for buying" box.

**3. Data & method tab** explains the data, the logic and the limitations.

All numbers change when you change the decision time.

### Key findings (09:00 decisions, January 2026)
- Average absolute error: **~2,023 MW** (WAPE ~17.9% of actual wind).
- Forecasts were **too high by ~1,746 MW on average**, so relying on the raw forecast would have meant buying too little power.
- In 90% of hours the shortfall (forecast minus actual) was below **~4,154 MW**.
- Error grows with forecast horizon: ~1,650 MW MAE at 0-6 hours ahead, ~2,300 MW at 42+ hours ahead. Day-ahead decisions use forecasts 16.5 to 39.5 hours ahead.

---

## Tech stack

| Part | Tech |
|------|------|
| Frontend | React 18 + Vite (JavaScript), Recharts for charts |
| Backend | Python 3.12, FastAPI |
| Data | Elexon BMRS API (`FUELHH` and `WINDFOR` datasets), saved as JSON |
| Tests | pytest |
| Containers | Docker + docker compose (nginx serves the frontend) |
| Hosting | Vercel (static frontend + Python serverless function) |

---

## Files and directories

```
.
├── api/
│   └── index.py              # Vercel entry point, loads the FastAPI app from backend/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app and API routes (/api/...)
│   │   ├── analysis.py       # forecast selection logic and error metrics
│   │   └── data_loader.py    # reads the saved JSON data into dictionaries
│   ├── data/
│   │   ├── actuals.json      # FUELHH wind actuals (half-hourly)
│   │   └── forecasts.json    # WINDFOR wind forecasts (hourly, every forecast run)
│   ├── scripts/
│   │   └── fetch_data.py     # downloads the data from the Elexon API
│   ├── tests/
│   │   ├── test_analysis.py  # unit tests for the logic
│   │   └── test_api.py       # API tests
│   ├── Dockerfile
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # layout, tabs, decision time input
│   │   ├── api.js            # functions that call the backend
│   │   ├── utils.js          # number and date formatting
│   │   ├── styles.css
│   │   └── components/
│   │       ├── DecisionView.jsx   # "Day-ahead forecast" tab
│   │       ├── AccuracyView.jsx   # "Forecast accuracy" tab
│   │       ├── AboutView.jsx      # "Data & method" tab
│   │       └── StatCard.jsx
│   ├── public/wind.svg       # favicon
│   ├── Dockerfile            # builds the app and serves it with nginx
│   ├── nginx.conf            # sends /api calls to the backend container
│   ├── package.json
│   └── vite.config.js        # dev server proxy for /api
├── docker-compose.yml        # runs backend + frontend together
├── vercel.json               # Vercel build and routing settings
├── requirements.txt          # Python packages for the Vercel function
└── README.md
```

---

## How to start the application

### Option 1: Docker (easiest)

Needs Docker Desktop running.

```bash
docker compose up --build
```

- App: http://localhost:3000
- API: http://localhost:8000/api/health (API docs at http://localhost:8000/docs)

### Option 2: Run locally without Docker

Needs Python 3.12+ and Node 20+.

**Backend** (terminal 1):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac / Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` calls to the backend on port 8000.

### Run the tests

```bash
cd backend
pytest
```

### Refresh the data (optional)

The data is already saved in `backend/data`. To download it again from Elexon:

```bash
cd backend
python scripts/fetch_data.py
```

---

## API endpoints

| Endpoint | What it returns |
|----------|-----------------|
| `GET /api/health` | `{"status": "ok"}` |
| `GET /api/info` | data summary, decision dates, forecast publish schedule |
| `GET /api/forecast?decision_date=2026-01-10&decision_time=09:00` | the forecast available at that decision for the next day, plus actuals and summary |
| `GET /api/accuracy?decision_time=09:00` | all January accuracy metrics and chart data for that decision time |

`decision_time` is UK time in `HH:MM` format. `decision_date` must be between 2026-01-01 and 2026-01-31.

---

## How the logic works

1. **Decision time**: decision day D at time T (UK). The order covers delivery day D+1 (00:00 to 24:00 UK). UK time is handled with `zoneinfo` (Europe/London), so clock-change days would also work.
2. **Which forecast**: for each delivery hour, take the forecast run with the latest `publishTime` that is **at or before** the decision time and contains that hour. This avoids look-ahead bias, so it shows only what the team could really have known.
3. **Matching actuals**: forecasts are hourly and actuals are half-hourly. Each forecast hour is matched with the actual for the same `startTime`.
4. **Error** = forecast - actual. Positive means less wind than forecast (a shortfall the team has to buy for).
5. **Metrics**: MAE, RMSE, bias (mean error), WAPE (total |error| / total actual, used instead of MAPE because MAPE breaks when wind is near zero), and P10/P50/P90 of the error.
6. **Likely range**: forecast minus the P90 error up to forecast minus the P10 error, for the same decision time.
7. **Missing hours**: every WINDFOR run covers up to 21:00 two days ahead, and this end point only moves forward with the 02:30 run. So a decision made before 02:30 has no forecast for 22:00 and 23:00 of the delivery day. The app shows a warning and leaves those hours out of the metrics (no made-up values).
8. **Horizon chart**: uses every forecast run (not only the decision ones), grouped into 6-hour buckets of (target time - publish time).

## Design choices

- **Data saved as JSON instead of calling Elexon on every request**: the January 2026 data won't change, it keeps the app fast (each API call takes under 0.1s), and the demo doesn't depend on the Elexon API being up or on Vercel time limits. The fetch script makes it easy to refresh.
- **Plain Python instead of pandas**: the data is small (~20k forecast rows), and skipping pandas keeps the Vercel function small with faster cold starts.
- **Results cached** with `functools.lru_cache` per decision time.

## Limitations / next steps

- The likely range is built from the same January data it is shown on (in-sample). For real use it should come from earlier months only.
- FUELHH is metered output, which can be lower because of curtailment. That may explain part of the positive bias, but this pilot hasn't checked it.
- Only national wind for now. Solar, demand and prices would be natural next steps, along with a scheduled job that loads fresh data daily.

---

## Use of AI tools

I used AI tools while building this project. **Claude (Anthropic) via Claude Code** helped with understanding the domain, planning the design, writing and reviewing code, writing tests and drafting this README. I reviewed the code, ran it, tested the app and checked the numbers myself.
