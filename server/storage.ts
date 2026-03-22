import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, asc } from "drizzle-orm";
import { marketData, parameters, type MarketData, type Parameter, type InsertMarketData } from "@shared/schema";

// Support DATABASE_URL=file:/path/to/db or plain path
const rawDbUrl = process.env.DATABASE_URL || "data.db";
const dbPath = rawDbUrl.startsWith("file:") ? rawDbUrl.slice(5) : rawDbUrl;

// Ensure parent directory exists
import { mkdirSync } from "fs";
import { dirname } from "path";
try { mkdirSync(dirname(dbPath), { recursive: true }); } catch (_) {}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS market_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    wti REAL,
    vix REAL,
    move REAL,
    put_iv_30d REAL,
    call_iv_30d REAL,
    real_yield REAL,
    cdx_ig REAL,
    cdx_hy REAL
  );
  CREATE TABLE IF NOT EXISTS parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value REAL NOT NULL
  );
`);

export interface IStorage {
  getAllMarketData(): MarketData[];
  upsertMarketData(data: InsertMarketData): MarketData;
  deleteMarketData(id: number): void;
  getAllParameters(): Parameter[];
  upsertParameter(key: string, value: number): Parameter;
  initDefaultParameters(): void;
}

export class DatabaseStorage implements IStorage {
  getAllMarketData(): MarketData[] {
    return db.select().from(marketData).orderBy(asc(marketData.date)).all();
  }

  upsertMarketData(data: InsertMarketData): MarketData {
    const existing = db.select().from(marketData).where(eq(marketData.date, data.date)).get();
    if (existing) {
      return db.update(marketData).set(data).where(eq(marketData.date, data.date)).returning().get()!;
    }
    return db.insert(marketData).values(data).returning().get()!;
  }

  deleteMarketData(id: number): void {
    db.delete(marketData).where(eq(marketData.id, id)).run();
  }

  getAllParameters(): Parameter[] {
    return db.select().from(parameters).all();
  }

  upsertParameter(key: string, value: number): Parameter {
    const existing = db.select().from(parameters).where(eq(parameters.key, key)).get();
    if (existing) {
      return db.update(parameters).set({ value }).where(eq(parameters.key, key)).returning().get()!;
    }
    return db.insert(parameters).values({ key, value }).returning().get()!;
  }

  initDefaultParameters(): void {
    const defaults: Record<string, number> = {
      Lookback_OilVol: 60,
      Lookback_Beta: 40,
      Lookback_ZScore: 60,
      Weight_Oil: 0.4,
      Weight_MOVE: 0.35,
      Weight_Skew: 0.25,
      Regime_Normal_Max: 1.0,
      Regime_Elevated_Max: 1.5,
      Regime_Selloff_Max: 2.2,
      CDX_IG_Level_Trigger: 70,
      CDX_HY_Level_Trigger: 400,
      CDX_IG_Daily_Trigger: 5,
      CDX_HY_Daily_Trigger: 20,
      OilZ_Warning: 1.5,
      OilZ_Signal: 2.0,
      Beta_Warning: 0.6,
      Beta_Signal: 0.8,
      Impulse_Warning: 0.8,
      Impulse_Signal: 1.5,
      MOVE_Z_Warning: 1.0,
      MOVE_Z_Signal: 1.5,
      Skew_Z_Warning: 1.0,
      Skew_Z_Signal: 1.5,
      MacroImpulse_Warning: 2.5,
      MacroImpulse_Signal: 3.5,
      WTI_Signal: 90,
      Skew_Warning: 5,
      Skew_Signal: 7,
      OilVIX_Warning: 3.5,
      OilVIX_Signal: 4.0,
      IG_d_Signal: 10,
      HY_d_Signal: 50,
    };

    for (const [key, value] of Object.entries(defaults)) {
      const existing = db.select().from(parameters).where(eq(parameters.key, key)).get();
      if (!existing) {
        db.insert(parameters).values({ key, value }).run();
      }
    }
  }
}

export const storage = new DatabaseStorage();
