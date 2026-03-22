/**
 * marketFetch.ts
 * Free-API data fetcher for all macro indicators.
 *
 * Sources (zero API keys required):
 *  - yahoo-finance2 npm package: WTI (CL=F), VIX (^VIX), MOVE (^MOVE), SKEW (^SKEW)
 *  - FRED observation API: US10Y Real Yield (DFII10), IG OAS (BAMLC0A0CM), HY OAS (BAMLH0A0HYM2)
 *
 * CDX IG / HY proxies:
 *   BAMLC0A0CM  → ICE BofA US Corp Master OAS (≈ IG credit spread)
 *   BAMLH0A0HYM2 → ICE BofA US HY Master OAS (≈ HY credit spread)
 *
 * 25Δ Put/Call IV proxy:
 *   Derived from CBOE SKEW Index + VIX
 */

import https from "https";
import http from "http";

// yahoo-finance2 v3
// @ts-ignore
import YahooFinanceClass from "yahoo-finance2";
const YahooFinance = (YahooFinanceClass as any).default ?? YahooFinanceClass;
const yf = new YahooFinance({ suppressNotices: ["ripHistorical"] });

const FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";

// --- Helper: fetch URL ---
function fetchUrl(url: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const isFred = url.includes("fred.stlouisfed.org");
    const agent = isFred ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "curl/7.88.1",
        "Accept": "text/csv, */*",
      },
      agent,
    } as any, (res: any) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return resolve(fetchUrl(loc, timeoutMs));
        return reject(new Error("Redirect with no location"));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      let data = "";
      res.on("data", (chunk: any) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

// --- Yahoo Finance via yahoo-finance2 npm (no Python needed) ---
async function fetchYahooData(
  tickers: string[],
  startDate: string,
  endDate: string
): Promise<Record<string, { date: string; close: number }[]>> {
  const result: Record<string, { date: string; close: number }[]> = {};

  for (const ticker of tickers) {
    try {
      const data = await yf.chart(ticker, {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      });
      const quotes = data?.quotes ?? [];
      result[ticker] = quotes
        .filter((q: any) => q.close != null && !isNaN(q.close))
        .map((q: any) => ({
          date: new Date(q.date).toISOString().slice(0, 10),
          close: Math.round(q.close * 10000) / 10000,
        }));
      console.log(`[marketFetch] ${ticker} ok: ${result[ticker].length} rows`);
    } catch (e: any) {
      console.error(`[marketFetch] ${ticker} failed:`, e.message?.slice(0, 100));
      result[ticker] = [];
    }
  }

  return result;
}

// --- Yahoo Finance: fetch OHLCV daily history ---
export async function fetchYahooHistory(
  ticker: string,
  period1: number,
  period2: number
): Promise<{ date: string; close: number }[]> {
  const startDate = new Date(period1 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(period2 * 1000).toISOString().slice(0, 10);
  const result = await fetchYahooData([ticker], startDate, endDate);
  return result[ticker] ?? [];
}

// --- Yahoo Finance: latest quote ---
export async function fetchYahooLatest(ticker: string): Promise<number | null> {
  const now = Math.floor(Date.now() / 1000);
  const data = await fetchYahooHistory(ticker, now - 7 * 86400, now);
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
  const lines = csv.trim().split("\n").slice(1);
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
  skewIndex: number | null;
  realYield: number | null;
  cdxIg: number | null;
  cdxHy: number | null;
  putIv30d: number | null;
  callIv30d: number | null;
}

export async function fetchHistoricalData(daysBack = 730): Promise<DailyRow[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - daysBack * 86400;
  const startDate = new Date(period1 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(period2 * 1000).toISOString().slice(0, 10);

  console.log(`[marketFetch] Fetching ${daysBack} days of history from ${startDate}...`);

  // Fetch all Yahoo tickers + FRED in parallel
  const [yahooData, realYieldData, igData, hyData] = await Promise.all([
    fetchYahooData(["CL=F", "^VIX", "^MOVE", "^SKEW"], startDate, endDate),
    fetchFredSeries("DFII10", startDate).catch(() => []),
    fetchFredSeries("BAMLC0A0CM", startDate).catch(() => []),
    fetchFredSeries("BAMLH0A0HYM2", startDate).catch(() => []),
  ]);

  const toMap = (data: { date: string; close?: number; value?: number }[]) => {
    const m: Record<string, number> = {};
    data.forEach((d) => { m[d.date] = (d as any).close ?? (d as any).value; });
    return m;
  };

  const wtiMap = toMap(yahooData["CL=F"] ?? []);
  const vixMap = toMap(yahooData["^VIX"] ?? []);
  const moveMap = toMap(yahooData["^MOVE"] ?? []);
  const skewMap = toMap(yahooData["^SKEW"] ?? []);
  const realYieldMap = toMap(realYieldData as any);
  const igMap = toMap(igData as any);
  const hyMap = toMap(hyData as any);

  // All dates from Yahoo sources
  const allDates = new Set<string>([
    ...Object.keys(wtiMap),
    ...Object.keys(vixMap),
    ...Object.keys(moveMap),
  ]);

  // Forward-fill FRED (published less frequently)
  const fredForwardFill = (map: Record<string, number>, dates: string[]) => {
    const result: Record<string, number> = {};
    let last: number | null = null;
    [...dates].sort().forEach((d) => {
      if (map[d] !== undefined) last = map[d];
      if (last !== null) result[d] = last;
    });
    return result;
  };

  const sortedDates = [...allDates].sort();
  const realYieldFilled = fredForwardFill(realYieldMap, sortedDates);
  const igFilled = fredForwardFill(igMap, sortedDates);
  const hyFilled = fredForwardFill(hyMap, sortedDates);

  const rows: DailyRow[] = [];

  for (const date of sortedDates) {
    const vix = vixMap[date] ?? null;
    const skewIdx = skewMap[date] ?? null;

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

    const igRaw = igFilled[date] ?? null;
    const hyRaw = hyFilled[date] ?? null;
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
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);

  const yahooData = await fetchYahooData(
    ["CL=F", "^VIX", "^MOVE", "^SKEW"],
    weekAgo,
    today
  ).catch(() => ({} as Record<string, { date: string; close: number }[]>));

  const last = (rows: { date: string; close: number }[] | undefined) =>
    rows && rows.length > 0 ? rows[rows.length - 1].close : null;

  const vix = last(yahooData["^VIX"]);
  const skewIdx = last(yahooData["^SKEW"]);

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
    wti: last(yahooData["CL=F"]),
    vix,
    move: last(yahooData["^MOVE"]),
    skewIndex: skewIdx,
    putIv30d,
    callIv30d,
  };
}
