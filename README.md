# InvestDEFY Macro Signal Dashboard

A self-hosted macro indicators dashboard that runs completely independently — no external credentials, no Perplexity agent required after setup.

**Data sources (all free, no API keys):**
- Yahoo Finance — WTI crude, VIX, MOVE index, CBOE SKEW (via `yfinance`)
- FRED / Federal Reserve — US10Y Real Yield, IG OAS, HY OAS (public CSV endpoint)

---

## Quick Start (Local)

```bash
# 1. Install Node dependencies
npm install

# 2. Install Python dependency
pip3 install -r requirements.txt

# 3. Build
npm run build

# 4. Run
npm start
# → Dashboard live at http://localhost:5000
```

Then open the app, click **Backfill 2Y** once to load 2 years of history, and **Refresh Now** to get today's data. Auto-refresh runs every 15 minutes after that.

---

## Deploy to Railway (Recommended — Free Tier Available)

1. Push this project to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Railway auto-detects Node.js. Add one environment variable:
   ```
   DATABASE_URL = file:/app/data/macro.db
   ```
4. In Railway → Settings → Deploy → set **Start Command** to:
   ```
   bash start.sh
   ```
5. Deploy. Your dashboard will be live at `https://your-app.railway.app`

> **Note:** Railway's free tier sleeps after inactivity. For always-on, use the $5/mo Hobby plan.

---

## Deploy to Render (Free Tier)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service → Connect repo
3. Set:
   - **Runtime:** Node
   - **Build Command:** `npm install && pip3 install -r requirements.txt && npm run build`
   - **Start Command:** `npm start`
4. Add environment variable: `DATABASE_URL = file:/data/macro.db`
5. Deploy

---

## Deploy with Docker

```bash
# Build image
docker build -t macro-dashboard .

# Run (data persists in a named volume)
docker run -d \
  -p 5000:5000 \
  -v macro-data:/app/data \
  --name macro-dashboard \
  macro-dashboard

# Dashboard live at http://localhost:5000
```

To update: `docker build -t macro-dashboard . && docker stop macro-dashboard && docker rm macro-dashboard` then re-run.

---

## Deploy to a VPS (DigitalOcean, Linode, etc.)

```bash
# On your server (Ubuntu 22.04+):
sudo apt update && sudo apt install -y nodejs npm python3 python3-pip

# Clone your repo
git clone https://github.com/you/macro-dashboard.git
cd macro-dashboard

# Install + build
npm install
pip3 install -r requirements.txt
npm run build

# Run with PM2 (keeps it alive on reboot)
npm install -g pm2
pm2 start "npm start" --name macro-dashboard
pm2 save && pm2 startup
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Port to listen on |
| `DATABASE_URL` | `data.db` | SQLite file path (use `file:/absolute/path/db` for absolute) |
| `NODE_ENV` | `development` | Set to `production` for the built server |

---

## Architecture

```
┌─────────────────────────────────┐
│  Browser                        │
│  React SPA (served from /dist)  │
└──────────────┬──────────────────┘
               │ HTTP (same origin)
┌──────────────▼──────────────────┐
│  Express Server (dist/index.cjs)│
│  ├─ /api/backfill  (2Y history) │
│  ├─ /api/refresh   (latest)     │
│  ├─ /api/market-data            │
│  └─ /api/parameters             │
│                                 │
│  Data Fetchers:                 │
│  ├─ yfinance (Python)           │
│  │   WTI · VIX · MOVE · SKEW   │
│  └─ FRED CSV                    │
│      RealYield · IG OAS · HY OAS│
│                                 │
│  SQLite (better-sqlite3)        │
│  market_data · parameters       │
└─────────────────────────────────┘
```

---

## After Deploying

1. Open your app URL
2. Click **Backfill 2Y** — loads ~510 days of history (~10 seconds)
3. Click **Refresh Now** — loads today's data
4. The dashboard auto-refreshes every 15 minutes from then on

The SQLite database persists all data locally — no cloud database needed.
