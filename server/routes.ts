import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMarketDataSchema } from "@shared/schema";
import { z } from "zod";
import { fetchHistoricalData, fetchLatestSnapshot } from "./marketFetch";

// Track refresh state
let lastRefreshTime: Date | null = null;
let isRefreshing = false;
let lastRefreshError: string | null = null;

// Seed the default sample data from the spreadsheet (only if no data at all)
function seedSampleData() {
  const rows = storage.getAllMarketData();
  if (rows.length > 0) return;

  const sampleData = [
    { date: "2026-02-23", wti: 71.4, vix: 18.36, move: 96, putIv30d: 21.1, callIv30d: 16.0, realYield: 1.41, cdxIg: 48.4, cdxHy: 291.5 },
    { date: "2026-02-24", wti: 72.83, vix: 18.73, move: 97, putIv30d: 21.35, callIv30d: 16.15, realYield: 1.42, cdxIg: 48.8, cdxHy: 293.0 },
    { date: "2026-02-25", wti: 74.28, vix: 19.1, move: 98, putIv30d: 21.6, callIv30d: 16.3, realYield: 1.43, cdxIg: 49.2, cdxHy: 294.5 },
    { date: "2026-02-26", wti: 75.77, vix: 19.48, move: 99, putIv30d: 21.85, callIv30d: 16.45, realYield: 1.44, cdxIg: 49.6, cdxHy: 296.0 },
    { date: "2026-02-27", wti: 77.29, vix: 19.87, move: 100, putIv30d: 22.1, callIv30d: 16.6, realYield: 1.45, cdxIg: 50.0, cdxHy: 297.5 },
    { date: "2026-02-28", wti: 78.83, vix: 20.27, move: 101, putIv30d: 22.35, callIv30d: 16.75, realYield: 1.46, cdxIg: 50.4, cdxHy: 299.0 },
    { date: "2026-03-01", wti: 80.41, vix: 20.68, move: 102, putIv30d: 22.6, callIv30d: 16.9, realYield: 1.47, cdxIg: 50.8, cdxHy: 300.5 },
    { date: "2026-03-02", wti: 82.02, vix: 21.09, move: 103, putIv30d: 22.85, callIv30d: 17.05, realYield: 1.48, cdxIg: 51.2, cdxHy: 302.0 },
    { date: "2026-03-03", wti: 83.66, vix: 21.51, move: 104, putIv30d: 23.1, callIv30d: 17.2, realYield: 1.49, cdxIg: 51.6, cdxHy: 303.5 },
    { date: "2026-03-04", wti: 85.33, vix: 21.94, move: 105, putIv30d: 23.35, callIv30d: 17.35, realYield: 1.50, cdxIg: 52.0, cdxHy: 305.0 },
  ];

  for (const row of sampleData) {
    storage.upsertMarketData(row);
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  storage.initDefaultParameters();
  seedSampleData();

  // GET all market data
  app.get("/api/market-data", (req, res) => {
    try {
      res.json(storage.getAllMarketData());
    } catch {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  // POST upsert a row
  app.post("/api/market-data", (req, res) => {
    try {
      const parsed = insertMarketDataSchema.parse(req.body);
      res.json(storage.upsertMarketData(parsed));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ error: err.errors });
      else res.status(500).json({ error: "Failed to save" });
    }
  });

  // DELETE a row
  app.delete("/api/market-data/:id", (req, res) => {
    try {
      storage.deleteMarketData(parseInt(req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // GET all parameters
  app.get("/api/parameters", (req, res) => {
    try {
      res.json(storage.getAllParameters());
    } catch {
      res.status(500).json({ error: "Failed to fetch parameters" });
    }
  });

  // PUT update a parameter
  app.put("/api/parameters/:key", (req, res) => {
    try {
      const { key } = req.params;
      const { value } = z.object({ value: z.number() }).parse(req.body);
      res.json(storage.upsertParameter(key, value));
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json({ error: err.errors });
      else res.status(500).json({ error: "Failed to update" });
    }
  });

  // POST /api/backfill — fetch 2 years of history from free APIs
  app.post("/api/backfill", async (req, res) => {
    if (isRefreshing) {
      return res.status(429).json({ error: "Refresh already in progress" });
    }
    isRefreshing = true;
    lastRefreshError = null;
    try {
      const daysBack = parseInt(req.query.days as string) || 730;
      console.log(`[backfill] Starting ${daysBack}-day backfill...`);

      const rows = await fetchHistoricalData(daysBack);
      let inserted = 0;
      let skipped = 0;

      for (const row of rows) {
        if (!row.wti && !row.vix && !row.move) { skipped++; continue; }
        storage.upsertMarketData({
          date: row.date,
          wti: row.wti,
          vix: row.vix,
          move: row.move,
          putIv30d: row.putIv30d,
          callIv30d: row.callIv30d,
          realYield: row.realYield,
          cdxIg: row.cdxIg,
          cdxHy: row.cdxHy,
        });
        inserted++;
      }

      lastRefreshTime = new Date();
      console.log(`[backfill] Done: ${inserted} rows inserted, ${skipped} skipped`);
      res.json({ success: true, inserted, skipped, total: rows.length });
    } catch (err: any) {
      lastRefreshError = err?.message ?? "Unknown error";
      console.error("[backfill] Error:", err);
      res.status(500).json({ error: lastRefreshError });
    } finally {
      isRefreshing = false;
    }
  });

  // POST /api/refresh — pull latest 7 days (intraday / daily refresh)
  app.post("/api/refresh", async (req, res) => {
    if (isRefreshing) {
      return res.status(429).json({ error: "Refresh already in progress" });
    }
    isRefreshing = true;
    lastRefreshError = null;
    try {
      console.log("[refresh] Fetching latest snapshot...");
      const snapshot = await fetchLatestSnapshot();

      // Also get FRED data (real yield + credit spreads) for today
      const { fetchFredSeries } = await import("./marketFetch");
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);

      const [igData, hyData, ryData] = await Promise.allSettled([
        fetchFredSeries("BAMLC0A0CM", weekAgo),
        fetchFredSeries("BAMLH0A0HYM2", weekAgo),
        fetchFredSeries("DFII10", weekAgo),
      ]);

      const lastVal = (res: PromiseSettledResult<{ date: string; value: number }[]>) =>
        res.status === "fulfilled" && res.value.length > 0
          ? res.value[res.value.length - 1].value
          : null;

      const igRaw = lastVal(igData);
      const hyRaw = lastVal(hyData);
      const ry = lastVal(ryData);

      const row = {
        date: snapshot.date ?? today,
        wti: snapshot.wti ?? null,
        vix: snapshot.vix ?? null,
        move: snapshot.move ?? null,
        putIv30d: snapshot.putIv30d ?? null,
        callIv30d: snapshot.callIv30d ?? null,
        realYield: ry,
        cdxIg: igRaw !== null ? Math.round(igRaw * 100 * 10) / 10 : null,
        cdxHy: hyRaw !== null ? Math.round(hyRaw * 100 * 10) / 10 : null,
      };

      storage.upsertMarketData(row);
      lastRefreshTime = new Date();
      console.log("[refresh] Done:", row);
      res.json({ success: true, row, refreshedAt: lastRefreshTime });
    } catch (err: any) {
      lastRefreshError = err?.message ?? "Unknown error";
      console.error("[refresh] Error:", err);
      res.status(500).json({ error: lastRefreshError });
    } finally {
      isRefreshing = false;
    }
  });

  // GET /api/refresh-status
  app.get("/api/refresh-status", (req, res) => {
    res.json({
      isRefreshing,
      lastRefreshTime: lastRefreshTime?.toISOString() ?? null,
      lastRefreshError,
      rowCount: storage.getAllMarketData().length,
    });
  });
}
