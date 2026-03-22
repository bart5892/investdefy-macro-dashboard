import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Daily market data rows
export const marketData = sqliteTable("market_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  wti: real("wti"),           // WTI $/bbl
  vix: real("vix"),
  move: real("move"),         // MOVE index
  putIv30d: real("put_iv_30d"),   // 25Δ Put IV 30D %
  callIv30d: real("call_iv_30d"), // 25Δ Call IV 30D %
  realYield: real("real_yield"),  // US10Y Real Yield %
  cdxIg: real("cdx_ig"),     // CDX IG 5Y bps
  cdxHy: real("cdx_hy"),     // CDX HY 5Y bps
});

export const insertMarketDataSchema = createInsertSchema(marketData).omit({ id: true });
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
export type MarketData = typeof marketData.$inferSelect;

// Parameters table (key-value store)
export const parameters = sqliteTable("parameters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: real("value").notNull(),
});

export const insertParametersSchema = createInsertSchema(parameters).omit({ id: true });
export type InsertParameter = z.infer<typeof insertParametersSchema>;
export type Parameter = typeof parameters.$inferSelect;
