/**
 * marketFetch.ts
 * Free-API data fetcher for all macro indicators.
 *
 * Sources (zero API keys required):
 *  - Yahoo Finance v8 chart API: WTI (CL=F), VIX (^VIX), MOVE (^MOVE), SKEW (^SKEW)
 *  - FRED observation API: US10Y Real Yield (DFII10), IG OAS (BAMLC0A0CM), HY OAS (BAMLH0A0HYM2)
 *
 * CDX IG / HY proxies:
 *   BAMLC0A0CM  → ICE BofA US Corp Master OAS (≈ IG credit spread, highly correlated to CDX IG)
 *   BAMLH0A0HYM2 → ICE BofA US HY Master OAS (≈ HY credit spread, highly correlated to CDX HY)
 *
 * 25Δ Put/Call IV proxy:
 *   We derive skew from the CBOE SKEW Index (^SKEW) and VIX.
 *   Put IV ≈ VIX × (1 + (SKEW-100)/400)
 *   Call IV ≈ VIX × (1 - (SKEW-100)/600)
 *   This is an approximation. Replace with real 25Δ data when available.
 */

import https from "https";
import http from "http";
import { execFile } from "child_process";
import { join } from "path";

const FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";

// Path to the Python helper (next to this file at runtime)
const PYTHON_SCRIPT = join(__dirname, "fetch_yahoo.py");

// --- Helper: fetch URL with redirect follow ---
function fetchUrl(url: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const isFred = url.includes("fred.stlouisfed.org");
    const agent = isFred
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
    const req = lib.get(url, {
      headers: {
        "User-Agent": isFred ? "curl/7.88.1" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/csv, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      agent,
    } as any, (res: any) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return resolve(fetchUrl(loc, timeoutMs));
        return reject(new Error("Redirect with no location"));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

// --- Python-backed Yahoo Finance fetcher (handles cookies/crumbs via yfinance) ---
function fetchYahooPython(
  tickers: string[],
  days: number
): Promise<Record<string, { date: string; close: number }[]>> {
  return new Promise((resolve, reject) => {
    // Try python3 first, fall back to python
    const pythonCmd = (() => { try { require("child_process").execSync("python3 --version", {stdio:"ignore"}); return "python3"; } catch { return "python"; } })();
    execFile(
      pythonCmd,
      [PYTHON_SCRIPT, "history", tickers.join(","), String(days)],
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (stderr) console.warn("[yfinance]", stderr.slice(0, 200));
        if (err) return reject(new Error(`yfinance failed: ${err.message}`));
        try {
          const parsed = JSON.parse(stdout);
          // Normalize: if a ticker returned {error: ...} treat as empty
          const result: Record<string, { date: string; close: number }[]> = {};
          for (const [k, v] of Object.entries(parsed)) {
            result[k] = Array.isArray(v) ? (v as { date: string; close: number }[]) : [];
          }
          resolve(result);
        } catch (e) {
          reject(new Error(`JSON parse failed: ${e}`));
        }
      }
    );
  });
}

// --- Yahoo Finance: fetch OHLCV daily history (Python-backed) ---
export async function fetchYahooHistory(
  ticker: string,
  period1: number,
  period2: number
): Promise<{ date: string; close: number }[]> {
  const days = Math.ceil((period2 - period1) / 86400) + 5;
  const result = await fetchYahooPython([ticker], days);
  return result[ticker] ?? [];
}

// --- Yahoo Finance: latest quote ---
export async function fetchYahooLatest(ticker: string): Promise<number | null> {
  const data = await fetchYahooHistory(ticker, Date.now() / 1000 - 7 * 86400, Date.now() / 1000);
  if (data.length === 0) return null;
  return data[data.length - 1].close;
}

// --- FRED: fetch CSV series ---
export async function fetchFredSeries(
  seriesId: string,
  startDate: string
): Promise<{ date: string; value: number }[]> {
  const url = `${FRED_BASE}?id=${seriesId}&vintage_date=&observation_start=${startDate}`;
  const csv = await fetchUrl(url);
  const lines = csv.trim().split("\n").slice(1); // skip header
  return lines
    .map((line) => {
      const [date, val] = line.split(",");
      const value = parseFloat(val);
      if (!date || isNaN(value)) return null;
      return { date: date.trim(), value };
    })
    .filter((x): x is { date: string; value: number } => x !== null);
}

// --- Build aligned daily dataset ---
export interface DailyRow {
  date: string;
  wti: number | null;
  vix: number | null;
  move: number | null;
  skewIndex: number | null; // CBOE SKEW ^SKEW
  realYield: number | null;
  cdxIg: number | null;   // proxy: BAMLC0A0CM in pct → convert to bps
  cdxHy: number | null;   // proxy: BAMLH0A0HYM2 in pct → convert to bps
  putIv30d: number | null; // derived from SKEW + VIX
  callIv30d: number | null;
}

export async function fetchHistoricalData(daysBack = 730): Promise<DailyRow[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - daysBack * 86400;
  const startDate = new Date(period1 * 1000).toISOString().slice(0, 10);

  console.log(`[marketFetch] Fetching ${daysBack} days of history from ${startDate}...`);

  // Fetch all Yahoo tickers in one Python call (yfinance handles auth)
  let yahooData: Record<string, { date: string; close: number }[]> = {};
  try {
    yahooData = await fetchYahooPython(["CL=F", "^VIX", "^MOVE", "^SKEW"], daysBack + 5);
    console.log(`[marketFetch] WTI ok: ${yahooData["CL=F"]?.length ?? 0} rows`);
    console.log(`[marketFetch] VIX ok: ${yahooData["^VIX"]?.length ?? 0} rows`);
    console.log(`[marketFetch] MOVE ok: ${yahooData["^MOVE"]?.length ?? 0} rows`);
    console.log(`[marketFetch] SKEW ok: ${yahooData["^SKEW"]?.length ?? 0} rows`);
  } catch(e: any) {
    console.error("[marketFetch] Yahoo batch failed:", e.message);
  }

  const wtiRaw = yahooData["CL=F"] ?? [];
  const vixRaw = yahooData["^VIX"] ?? [];
  const moveRaw = yahooData["^MOVE"] ?? [];
  const skewRaw = yahooData["^SKEW"] ?? [];

  const wtiData = { status: "fulfilled" as const, value: wtiRaw };
  const vixData = { status: "fulfilled" as const, value: vixRaw };
  const moveData = { status: "fulfilled" as const, value: moveRaw };
  const skewData = { status: "fulfilled" as const, value: skewRaw };

  // FRED can run in parallel (different host)
  const [realYieldData, igData, hyData] = await Promise.allSettled([
    fetchFredSeries("DFII10", startDate),
    fetchFredSeries("BAMLC0A0CM", startDate),
    fetchFredSeries("BAMLH0A0HYM2", startDate),
  ]);

  // Build lookup maps
  const toMap = (data: { date: string; close?: number; value?: number }[]) => {
    const m: Record<string, number> = {};
    data.forEach((d) => { m[d.date] = (d as any).close ?? (d as any).value; });
    return m;
  };

  // Log any fetch errors
  const sources = ["WTI","VIX","MOVE","SKEW","RealYield","IG","HY"];
  [wtiData,vixData,moveData,skewData,realYieldData,igData,hyData].forEach((r,i) => {
    if (r.status === "rejected") console.error(`[marketFetch] ${sources[i]} failed:`, r.reason?.message ?? r.reason);
    else console.log(`[marketFetch] ${sources[i]} ok: ${r.value.length} rows`);
  });

  const wtiMap = wtiData.status === "fulfilled" ? toMap(wtiData.value) : {};
  const vixMap = vixData.status === "fulfilled" ? toMap(vixData.value) : {};
  const moveMap = moveData.status === "fulfilled" ? toMap(moveData.value) : {};
  const skewMap = skewData.status === "fulfilled" ? toMap(skewData.value) : {};
  const realYieldMap = realYieldData.status === "fulfilled" ? toMap(realYieldData.value) : {};
  const igMap = igData.status === "fulfilled" ? toMap(igData.value) : {};
  const hyMap = hyData.status === "fulfilled" ? toMap(hyData.value) : {};

  // Collect all dates (union of all sources)
  const allDates = new Set<string>([
    ...Object.keys(wtiMap),
    ...Object.keys(vixMap),
    ...Object.keys(moveMap),
  ]);

  const rows: DailyRow[] = [];

  // Forward-fill maps for FRED (published less frequently)
  const fredForwardFill = (map: Record<string, number>, dates: string[]) => {
    const result: Record<string, number> = {};
    let last: number | null = null;
    const sorted = [...dates].sort();
    sorted.forEach((d) => {
      if (map[d] !== undefined) last = map[d];
      if (last !== null) result[d] = last;
    });
    return result;
  };

  const sortedDates = [...allDates].sort();
  const realYieldFilled = fredForwardFill(realYieldMap, sortedDates);
  const igFilled = fredForwardFill(igMap, sortedDates);
  const hyFilled = fredForwardFill(hyMap, sortedDates);

  for (const date of sortedDates) {
    const vix = vixMap[date] ?? null;
    const skewIdx = skewMap[date] ?? null;

    // Derive 25Δ IV from SKEW index and VIX
    // SKEW = 100 + 10 * slope of SPX risk reversal
    // Higher SKEW → more expensive puts vs calls
    let putIv30d: number | null = null;
    let callIv30d: number | null = null;
    if (vix !== null && skewIdx !== null) {
      const skewFactor = (skewIdx - 100) / 400;
      putIv30d = Math.round((vix * (1 + skewFactor)) * 100) / 100;
      callIv30d = Math.round((vix * Math.max(0.7, 1 - skewFactor * 0.6)) * 100) / 100;
    } else if (vix !== null) {
      // Fallback: assume typical ~25% skew premium on put side
      putIv30d = Math.round(vix * 1.2 * 100) / 100;
      callIv30d = Math.round(vix * 0.85 * 100) / 100;
    }

    // FRED OAS comes in percent → convert to bps (*100)
    const igRaw = igFilled[date] ?? null;
    const hyRaw = hyFilled[date] ?? null;
    // BAMLC0A0CM is typically ~50-150bps. FRED stores it as percent (0.50-1.50)
    // Multiply by 100 to get bps
    const cdxIg = igRaw !== null ? Math.round(igRaw * 100 * 10) / 10 : null;
    const cdxHy = hyRaw !== null ? Math.round(hyRaw * 100 * 10) / 10 : null;

    rows.push({
      date,
      wti: wtiMap[date] ?? null,
      vix,
      move: moveMap[date] ?? null,
      skewIndex: skewIdx,
      realYield: realYieldFilled[date] ?? null,
      cdxIg,
      cdxHy,
      putIv30d,
      callIv30d,
    });
  }

  console.log(`[marketFetch] Built ${rows.length} daily rows`);
  return rows;
}

// --- Fetch today's latest snapshot ---
export async function fetchLatestSnapshot(): Promise<Partial<DailyRow> & { date: string }> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;
  const today = new Date().toISOString().slice(0, 10);

  let yahooSnap: Record<string, { date: string; close: number }[]> = {};
  try {
    yahooSnap = await fetchYahooPython(["CL=F", "^VIX", "^MOVE", "^SKEW"], 14);
  } catch(e: any) {
    console.error("[marketFetch] Yahoo snapshot failed:", e.message);
  }

  const last = (rows: { date: string; close: number }[] | undefined) =>
    rows && rows.length > 0 ? rows[rows.length - 1].close : null;

  const wtiRes = yahooSnap["CL=F"] ?? [];
  const vixRes = yahooSnap["^VIX"] ?? [];
  const moveRes = yahooSnap["^MOVE"] ?? [];
  const skewRes = yahooSnap["^SKEW"] ?? [];

  const vix = last(vixRes);
  const skewIdx = last(skewRes);

  let putIv30d: number | null = null;
  let callIv30d: number | null = null;
  if (vix !== null && skewIdx !== null) {
    const skewFactor = (skewIdx - 100) / 400;
    putIv30d = Math.round((vix * (1 + skewFactor)) * 100) / 100;
    callIv30d = Math.round((vix * Math.max(0.7, 1 - skewFactor * 0.6)) * 100) / 100;
  } else if (vix !== null) {
    putIv30d = Math.round(vix * 1.2 * 100) / 100;
    callIv30d = Math.round(vix * 0.85 * 100) / 100;
  }

  return {
    date: today,
    wti: last(wtiRes),
    vix,
    move: last(moveRes),
    skewIndex: last(skewRes),
    putIv30d,
    callIv30d,
    // realYield and CDX come from FRED — update less frequently, skip for intraday refresh
  };
}
