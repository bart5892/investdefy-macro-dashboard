import type { MarketData } from "@shared/schema";

export interface ModelRow {
  date: string;
  wti: number;
  vix: number;
  move: number;
  skew: number;       // putIv - callIv
  realYield: number;
  cdxIg: number;
  cdxHy: number;
  rOil: number | null;
  rVix: number | null;
  deltaRealYield: number | null;
  oilVol: number | null;
  oilZ: number | null;
  beta: number | null;
  impulse: number | null;
  moveZ: number | null;
  skewZ: number | null;
  stressScore: number | null;
  deltaRealYZ: number | null;
  macroImpulse: number | null;
  oilVIX: number | null;
  igD: number | null;
  hyD: number | null;
  creditFlag: number | null;
  regime: string | null;
  shortVol: string | null;
}

export interface Params {
  Lookback_OilVol: number;
  Lookback_Beta: number;
  Lookback_ZScore: number;
  Weight_Oil: number;
  Weight_MOVE: number;
  Weight_Skew: number;
  Regime_Normal_Max: number;
  Regime_Elevated_Max: number;
  Regime_Selloff_Max: number;
  CDX_IG_Level_Trigger: number;
  CDX_HY_Level_Trigger: number;
  CDX_IG_Daily_Trigger: number;
  CDX_HY_Daily_Trigger: number;
  OilZ_Warning: number;
  OilZ_Signal: number;
  Beta_Warning: number;
  Beta_Signal: number;
  Impulse_Warning: number;
  Impulse_Signal: number;
  MOVE_Z_Warning: number;
  MOVE_Z_Signal: number;
  Skew_Z_Warning: number;
  Skew_Z_Signal: number;
  MacroImpulse_Warning: number;
  MacroImpulse_Signal: number;
  WTI_Signal: number;
  Skew_Warning: number;
  Skew_Signal: number;
  OilVIX_Warning: number;
  OilVIX_Signal: number;
  IG_d_Signal: number;
  HY_d_Signal: number;
}

function logReturn(a: number, b: number): number {
  return Math.log(a / b);
}

function rollingStdev(arr: (number | null)[], window: number, idx: number): number | null {
  if (idx < window) return null;
  const slice = arr.slice(idx - window, idx).filter((v): v is number => v !== null);
  if (slice.length < 2) return null;
  const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (slice.length - 1);
  return Math.sqrt(variance);
}

function rollingMean(arr: (number | null)[], window: number, idx: number): number | null {
  if (idx < window) return null;
  const slice = arr.slice(idx - window, idx).filter((v): v is number => v !== null);
  if (slice.length === 0) return null;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function rollingCovariance(
  x: (number | null)[],
  y: (number | null)[],
  window: number,
  idx: number
): number | null {
  if (idx < window) return null;
  const pairs: [number, number][] = [];
  for (let i = idx - window; i < idx; i++) {
    if (x[i] !== null && y[i] !== null) pairs.push([x[i]!, y[i]!]);
  }
  if (pairs.length < 2) return null;
  const mx = pairs.reduce((s, [xi]) => s + xi, 0) / pairs.length;
  const my = pairs.reduce((s, [, yi]) => s + yi, 0) / pairs.length;
  return pairs.reduce((s, [xi, yi]) => s + (xi - mx) * (yi - my), 0) / (pairs.length - 1);
}

function rollingVariance(arr: (number | null)[], window: number, idx: number): number | null {
  const stdev = rollingStdev(arr, window, idx);
  return stdev !== null ? stdev * stdev : null;
}

export function computeModel(rawData: MarketData[], params: Params): ModelRow[] {
  if (rawData.length === 0) return [];

  // Sort by date ascending
  const sorted = [...rawData].sort((a, b) => a.date.localeCompare(b.date));

  // Pre-compute returns
  const rOilArr: (number | null)[] = sorted.map((r, i) => {
    if (i === 0 || r.wti == null || sorted[i - 1].wti == null) return null;
    return logReturn(r.wti!, sorted[i - 1].wti!);
  });

  const rVixArr: (number | null)[] = sorted.map((r, i) => {
    if (i === 0 || r.vix == null || sorted[i - 1].vix == null) return null;
    return logReturn(r.vix!, sorted[i - 1].vix!);
  });

  const deltaRYArr: (number | null)[] = sorted.map((r, i) => {
    if (i === 0 || r.realYield == null || sorted[i - 1].realYield == null) return null;
    return r.realYield! - sorted[i - 1].realYield!;
  });

  const skewArr: number[] = sorted.map(r =>
    r.putIv30d != null && r.callIv30d != null ? r.putIv30d - r.callIv30d : 0
  );

  const rows: ModelRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const oilVol = rollingStdev(rOilArr, params.Lookback_OilVol, i + 1);
    const oilZ = oilVol && rOilArr[i] !== null ? rOilArr[i]! / oilVol : null;

    // Beta: cov(rVIX, rOil) / var(rOil)
    const cov = rollingCovariance(rVixArr, rOilArr, params.Lookback_Beta, i + 1);
    const varOil = rollingVariance(rOilArr, params.Lookback_Beta, i + 1);
    const beta = cov !== null && varOil && varOil !== 0 ? cov / varOil : null;

    const impulse = beta !== null && oilZ !== null ? beta * oilZ : null;

    // MOVE_Z
    const moveMean = rollingMean(sorted.map(r => r.move), params.Lookback_ZScore, i + 1);
    const moveStdev = rollingStdev(sorted.map(r => r.move), params.Lookback_ZScore, i + 1);
    const moveZ = moveMean !== null && moveStdev && moveStdev !== 0 && d.move != null
      ? (d.move - moveMean) / moveStdev : null;

    // Skew_Z
    const skewMean = rollingMean(skewArr, params.Lookback_ZScore, i + 1);
    const skewStdev = rollingStdev(skewArr, params.Lookback_ZScore, i + 1);
    const skewZ = skewMean !== null && skewStdev && skewStdev !== 0
      ? (skewArr[i] - skewMean) / skewStdev : null;

    // StressScore
    const stressScore = oilZ !== null && moveZ !== null && skewZ !== null
      ? params.Weight_Oil * oilZ + params.Weight_MOVE * moveZ + params.Weight_Skew * skewZ
      : null;

    // ΔRealY_Z
    const deltaRYMean = rollingMean(deltaRYArr, params.Lookback_ZScore, i + 1);
    const deltaRYStdev = rollingStdev(deltaRYArr, params.Lookback_ZScore, i + 1);
    const deltaRealYZ = deltaRYMean !== null && deltaRYStdev && deltaRYStdev !== 0 && deltaRYArr[i] !== null
      ? (deltaRYArr[i]! - deltaRYMean) / deltaRYStdev : null;

    // MacroImpulse
    const macroImpulse = oilZ !== null && deltaRealYZ !== null ? oilZ + deltaRealYZ : null;

    // Oil/VIX
    const oilVIX = d.wti && d.vix ? d.wti / d.vix : null;

    // IG_d, HY_d
    const igD = i > 0 && d.cdxIg != null && sorted[i - 1].cdxIg != null
      ? d.cdxIg! - sorted[i - 1].cdxIg! : null;
    const hyD = i > 0 && d.cdxHy != null && sorted[i - 1].cdxHy != null
      ? d.cdxHy! - sorted[i - 1].cdxHy! : null;

    // Credit flag
    const creditFlag = (
      (d.cdxIg != null && d.cdxIg >= params.CDX_IG_Level_Trigger) ||
      (d.cdxHy != null && d.cdxHy >= params.CDX_HY_Level_Trigger) ||
      (igD !== null && igD >= params.CDX_IG_Daily_Trigger) ||
      (hyD !== null && hyD >= params.CDX_HY_Daily_Trigger)
    ) ? 1 : 0;

    // Regime
    let regime = "NORMAL";
    if (stressScore !== null) {
      if (stressScore > params.Regime_Selloff_Max) regime = "CRASH";
      else if (stressScore > params.Regime_Elevated_Max) regime = "SELLOFF";
      else if (stressScore > params.Regime_Normal_Max) regime = "ELEVATED";
    }

    // ShortVol
    const shortVol = regime === "CRASH" ? "OFF" : regime === "SELLOFF" ? "REDUCE" : "ON";

    rows.push({
      date: d.date,
      wti: d.wti ?? 0,
      vix: d.vix ?? 0,
      move: d.move ?? 0,
      skew: skewArr[i],
      realYield: d.realYield ?? 0,
      cdxIg: d.cdxIg ?? 0,
      cdxHy: d.cdxHy ?? 0,
      rOil: rOilArr[i],
      rVix: rVixArr[i],
      deltaRealYield: deltaRYArr[i],
      oilVol,
      oilZ,
      beta,
      impulse,
      moveZ,
      skewZ,
      stressScore,
      deltaRealYZ,
      macroImpulse,
      oilVIX,
      igD,
      hyD,
      creditFlag,
      regime,
      shortVol,
    });
  }

  return rows;
}

export type SignalStatus = "NORMAL" | "WARNING" | "SIGNAL" | "N/A";

export function getSignalStatus(
  value: number | null,
  warning: number,
  signal: number,
  direction: "higher" | "lower" = "higher"
): SignalStatus {
  if (value === null) return "N/A";
  if (direction === "higher") {
    if (value >= signal) return "SIGNAL";
    if (value >= warning) return "WARNING";
    return "NORMAL";
  } else {
    if (value <= signal) return "SIGNAL";
    if (value <= warning) return "WARNING";
    return "NORMAL";
  }
}

export function getRegimeColor(regime: string | null): string {
  switch (regime) {
    case "CRASH": return "text-red-400";
    case "SELLOFF": return "text-orange-400";
    case "ELEVATED": return "text-yellow-400";
    case "NORMAL": return "text-emerald-400";
    default: return "text-slate-400";
  }
}

export function getShortVolBadge(shortVol: string | null): string {
  switch (shortVol) {
    case "OFF": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "REDUCE": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "ON": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
}
