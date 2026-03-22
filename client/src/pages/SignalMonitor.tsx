import { useQuery } from "@tanstack/react-query";
import type { MarketData, Parameter } from "@shared/schema";
import { computeModel, getSignalStatus, type Params, type ModelRow } from "@/lib/model";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, Activity, Shield, Zap, BarChart2, DollarSign, TrendingDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

function paramsFromArray(arr: Parameter[]): Params {
  const map: Record<string, number> = {};
  arr.forEach(p => (map[p.key] = p.value));
  return {
    Lookback_OilVol: map.Lookback_OilVol ?? 60,
    Lookback_Beta: map.Lookback_Beta ?? 40,
    Lookback_ZScore: map.Lookback_ZScore ?? 60,
    Weight_Oil: map.Weight_Oil ?? 0.4,
    Weight_MOVE: map.Weight_MOVE ?? 0.35,
    Weight_Skew: map.Weight_Skew ?? 0.25,
    Regime_Normal_Max: map.Regime_Normal_Max ?? 1.0,
    Regime_Elevated_Max: map.Regime_Elevated_Max ?? 1.5,
    Regime_Selloff_Max: map.Regime_Selloff_Max ?? 2.2,
    CDX_IG_Level_Trigger: map.CDX_IG_Level_Trigger ?? 70,
    CDX_HY_Level_Trigger: map.CDX_HY_Level_Trigger ?? 400,
    CDX_IG_Daily_Trigger: map.CDX_IG_Daily_Trigger ?? 5,
    CDX_HY_Daily_Trigger: map.CDX_HY_Daily_Trigger ?? 20,
    OilZ_Warning: map.OilZ_Warning ?? 1.5,
    OilZ_Signal: map.OilZ_Signal ?? 2.0,
    Beta_Warning: map.Beta_Warning ?? 0.6,
    Beta_Signal: map.Beta_Signal ?? 0.8,
    Impulse_Warning: map.Impulse_Warning ?? 0.8,
    Impulse_Signal: map.Impulse_Signal ?? 1.5,
    MOVE_Z_Warning: map.MOVE_Z_Warning ?? 1.0,
    MOVE_Z_Signal: map.MOVE_Z_Signal ?? 1.5,
    Skew_Z_Warning: map.Skew_Z_Warning ?? 1.0,
    Skew_Z_Signal: map.Skew_Z_Signal ?? 1.5,
    MacroImpulse_Warning: map.MacroImpulse_Warning ?? 2.5,
    MacroImpulse_Signal: map.MacroImpulse_Signal ?? 3.5,
    WTI_Signal: map.WTI_Signal ?? 90,
    Skew_Warning: map.Skew_Warning ?? 5,
    Skew_Signal: map.Skew_Signal ?? 7,
    OilVIX_Warning: map.OilVIX_Warning ?? 3.5,
    OilVIX_Signal: map.OilVIX_Signal ?? 4.0,
    IG_d_Signal: map.IG_d_Signal ?? 10,
    HY_d_Signal: map.HY_d_Signal ?? 50,
  };
}

function fmt(v: number | null, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    SIGNAL: "badge-signal badge-alert pulse-danger",
    WARNING: "badge-signal badge-warning",
    NORMAL: "badge-signal badge-normal",
    "N/A": "badge-signal badge-na",
  };
  return <span className={classes[status] ?? "badge-signal badge-na"}>{status}</span>;
}

function RegimeBadge({ regime }: { regime: string | null }) {
  const map: Record<string, string> = {
    CRASH: "badge-signal badge-crash pulse-danger",
    SELLOFF: "badge-signal badge-selloff",
    ELEVATED: "badge-signal badge-warning",
    NORMAL: "badge-signal badge-regime-normal",
  };
  return <span className={map[regime ?? "NORMAL"] ?? "badge-signal badge-na"}>{regime ?? "—"}</span>;
}

function ShortVolBadge({ sv }: { sv: string | null }) {
  const map: Record<string, string> = {
    ON: "badge-signal badge-normal",
    REDUCE: "badge-signal badge-warning",
    OFF: "badge-signal badge-crash pulse-danger",
  };
  return <span className={map[sv ?? "ON"] ?? "badge-signal badge-na"}>{sv ?? "—"}</span>;
}

interface IndicatorRowProps {
  label: string; value: string; warning: string; signal: string;
  status: string; type: string; notes: string;
}

function IndicatorRow({ label, value, warning, signal, status, type, notes }: IndicatorRowProps) {
  return (
    <tr data-testid={`indicator-row-${label}`}>
      <td className="text-left px-3 py-2 border-b border-border/40">
        <div className="font-semibold text-sm text-foreground tabular">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{notes}</div>
      </td>
      <td className="text-right px-3 py-2 border-b border-border/40 tabular text-sm font-semibold text-foreground">{value}</td>
      <td className="text-right px-3 py-2 border-b border-border/40 tabular text-sm text-muted-foreground">{warning}</td>
      <td className="text-right px-3 py-2 border-b border-border/40 tabular text-sm text-muted-foreground">{signal}</td>
      <td className="text-right px-3 py-2 border-b border-border/40"><StatusBadge status={status} /></td>
      <td className="text-right px-3 py-2 border-b border-border/40 text-xs text-muted-foreground">{type}</td>
    </tr>
  );
}

const regimeColorMap: Record<string, string> = {
  CRASH: "#f87171",
  SELLOFF: "#fb923c",
  ELEVATED: "#facc15",
  NORMAL: "#4ade80",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="tabular font-semibold">{p.name}:</span>
          <span className="tabular">{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

function exportCSV(model: ModelRow[]) {
  const headers = ["Date","WTI","VIX","MOVE","Skew","RealYield","CDX_IG","CDX_HY",
    "OilZ","Beta","Impulse","MOVE_Z","Skew_Z","StressScore","MacroImpulse","OilVIX",
    "IG_d","HY_d","CreditFlag","Regime","ShortVol"];
  const rows = model.map(r => [
    r.date, r.wti, r.vix, r.move, r.skew?.toFixed(2), r.realYield,
    r.cdxIg, r.cdxHy, r.oilZ?.toFixed(4), r.beta?.toFixed(4),
    r.impulse?.toFixed(4), r.moveZ?.toFixed(4), r.skewZ?.toFixed(4),
    r.stressScore?.toFixed(4), r.macroImpulse?.toFixed(4), r.oilVIX?.toFixed(3),
    r.igD?.toFixed(2), r.hyD?.toFixed(2), r.creditFlag, r.regime, r.shortVol
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `macro_signal_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

export default function SignalMonitor() {
  const { data: rawData, isLoading: loadingData } = useQuery<MarketData[]>({
    queryKey: ["/api/market-data"],
    refetchInterval: 15 * 60 * 1000, // refetch every 15 min
  });

  const { data: paramData, isLoading: loadingParams } = useQuery<Parameter[]>({
    queryKey: ["/api/parameters"],
  });

  const isLoading = loadingData || loadingParams;
  const params = paramData ? paramsFromArray(paramData) : null;
  const model = rawData && params ? computeModel(rawData, params) : [];
  const latest = model.length > 0 ? model[model.length - 1] : null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const isCrash = latest?.regime === "CRASH";
  const isSelloff = latest?.regime === "SELLOFF";

  // Build sparkline data — last 90 rows
  const sparkData = model.slice(-90).map(r => ({
    date: r.date.slice(5),
    StressScore: r.stressScore,
    color: regimeColorMap[r.regime ?? "NORMAL"] ?? "#4ade80",
  }));

  return (
    <div className="p-6 space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Signal Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            As of <span className="tabular text-foreground">{latest?.date ?? "—"}</span> · {model.length} observations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm" variant="outline"
            className="h-7 px-2.5 text-xs gap-1.5 hidden md:flex"
            onClick={() => exportCSV(model)}
            data-testid="button-export-csv"
          >
            <Download size={11} />
            Export CSV
          </Button>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overall Regime</div>
            <RegimeBadge regime={latest?.regime ?? null} />
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Short Vol</div>
            <ShortVolBadge sv={latest?.shortVol ?? null} />
          </div>
        </div>
      </div>

      {/* Regime Alert Banner */}
      {(isCrash || isSelloff) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
          isCrash ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-orange-500/10 border-orange-500/30 text-orange-400"
        }`}>
          <AlertTriangle size={16} className="shrink-0" />
          <span className="font-semibold text-sm">
            {isCrash
              ? "CRASH REGIME — Short Vol: OFF. Reduce exposure immediately."
              : "SELLOFF REGIME — Short Vol: REDUCE. Tighten risk management."}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="WTI" value={fmt(latest?.wti, 2)} unit="$/bbl"
          sub={`Signal ≥ $${params?.WTI_Signal ?? 90}`}
          accent={latest?.wti != null && params ? latest.wti >= params.WTI_Signal ? "red" : "green" : "neutral"}
          icon={<DollarSign size={13} />} />
        <KpiCard label="VIX" value={fmt(latest?.vix, 2)} unit="pts"
          sub="Equity vol"
          accent={latest?.vix != null && latest.vix > 25 ? "red" : latest?.vix != null && latest.vix > 18 ? "yellow" : "green"}
          icon={<Activity size={13} />} />
        <KpiCard label="MOVE" value={fmt(latest?.move, 1)} unit="pts"
          sub="Rates vol"
          accent={latest?.move != null && latest.move > 110 ? "red" : latest?.move != null && latest.move > 95 ? "yellow" : "green"}
          icon={<TrendingUp size={13} />} />
        <KpiCard label="Skew" value={fmt(latest?.skew, 2)} unit="vol pts"
          sub="25Δ Put − Call IV"
          accent={latest?.skew != null && params ? latest.skew >= params.Skew_Signal ? "red" : latest.skew >= params.Skew_Warning ? "yellow" : "green" : "neutral"}
          icon={<BarChart2 size={13} />} />
        <KpiCard label="US10Y Real" value={fmt(latest?.realYield, 2)} unit="%"
          sub="DFII10 (FRED)"
          accent={latest?.realYield != null && latest.realYield > 2 ? "red" : "neutral"}
          icon={<TrendingDown size={13} />} />
        <KpiCard label="StressScore" value={fmt(latest?.stressScore, 3)} unit="σ"
          sub={`Threshold: ${params?.Regime_Elevated_Max ?? 1.5}`}
          accent={latest?.stressScore != null && params
            ? latest.stressScore > params.Regime_Selloff_Max ? "red"
            : latest.stressScore > params.Regime_Elevated_Max ? "orange"
            : latest.stressScore > params.Regime_Normal_Max ? "yellow" : "green"
            : "neutral"}
          icon={<Zap size={13} />} />
      </div>

      {/* StressScore Sparkline — 90 day history */}
      {sparkData.length > 5 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">StressScore — 90-Day History</h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {[["NORMAL","#4ade80"],["ELEVATED","#facc15"],["SELLOFF","#fb923c"],["CRASH","#f87171"]].map(([label, color]) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={sparkData} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
              <defs>
                <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(188 72% 48%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(188 72% 48%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 16%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={params?.Regime_Normal_Max ?? 1} stroke="#facc15" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
              <ReferenceLine y={params?.Regime_Elevated_Max ?? 1.5} stroke="#fb923c" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
              <ReferenceLine y={params?.Regime_Selloff_Max ?? 2.2} stroke="#f87171" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
              <Area type="monotone" dataKey="StressScore" stroke="hsl(188 72% 48%)" strokeWidth={1.5} fill="url(#stressGrad)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Regime History Strip — last 60 rows */}
      {model.length > 5 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Regime History</h2>
            <span className="text-xs text-muted-foreground">Last {Math.min(60, model.length)} trading days</span>
          </div>
          <div className="flex gap-0.5 h-8 items-stretch">
            {model.slice(-60).map((r, i) => (
              <div
                key={r.date}
                className="flex-1 rounded-sm cursor-default transition-opacity hover:opacity-80"
                style={{ background: regimeColorMap[r.regime ?? "NORMAL"] ?? "#4ade80", opacity: 0.7 }}
                title={`${r.date}: ${r.regime} (SS: ${r.stressScore?.toFixed(3) ?? "N/A"})`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span className="tabular">{model.slice(-60)[0]?.date ?? ""}</span>
            <span className="tabular">{latest?.date ?? ""}</span>
          </div>
        </div>
      )}

      {/* Computed Indicators Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Computed Indicators</h2>
          <span className="text-xs text-muted-foreground">vs. Warning / Signal thresholds</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left">Indicator</th>
                <th>Actual Value</th>
                <th>Warning</th>
                <th>Signal</th>
                <th>Status</th>
                <th>Signal Type</th>
              </tr>
            </thead>
            <tbody>
              {latest && params && <>
                <IndicatorRow label="OilZ" value={fmt(latest.oilZ, 3)} warning={params.OilZ_Warning.toString()} signal={params.OilZ_Signal.toString()} status={getSignalStatus(latest.oilZ, params.OilZ_Warning, params.OilZ_Signal)} type="Oil shock" notes="Oil return ÷ rolling oil vol" />
                <IndicatorRow label="Beta" value={fmt(latest.beta, 3)} warning={params.Beta_Warning.toString()} signal={params.Beta_Signal.toString()} status={getSignalStatus(latest.beta, params.Beta_Warning, params.Beta_Signal)} type="Oil→VIX transmission" notes="Rolling β of VIX returns vs oil returns" />
                <IndicatorRow label="Impulse" value={fmt(latest.impulse, 3)} warning={params.Impulse_Warning.toString()} signal={params.Impulse_Signal.toString()} status={getSignalStatus(latest.impulse, params.Impulse_Warning, params.Impulse_Signal)} type="Oil shock impulse" notes="Beta × OilZ" />
                <IndicatorRow label="MOVE_Z" value={fmt(latest.moveZ, 3)} warning={params.MOVE_Z_Warning.toString()} signal={params.MOVE_Z_Signal.toString()} status={getSignalStatus(latest.moveZ, params.MOVE_Z_Warning, params.MOVE_Z_Signal)} type="Rates volatility" notes="MOVE index z-score" />
                <IndicatorRow label="Skew_Z" value={fmt(latest.skewZ, 3)} warning={params.Skew_Z_Warning.toString()} signal={params.Skew_Z_Signal.toString()} status={getSignalStatus(latest.skewZ, params.Skew_Z_Warning, params.Skew_Z_Signal)} type="Equity downside hedging" notes="SPX 30D 25Δ RR z-score" />
                <IndicatorRow label="StressScore" value={fmt(latest.stressScore, 3)} warning={params.Regime_Normal_Max.toString()} signal={params.Regime_Elevated_Max.toString()} status={getSignalStatus(latest.stressScore, params.Regime_Normal_Max, params.Regime_Elevated_Max)} type="Composite macro stress" notes={`${params.Weight_Oil}×OilZ + ${params.Weight_MOVE}×MOVE_Z + ${params.Weight_Skew}×Skew_Z`} />
                <IndicatorRow label="MacroImpulse" value={fmt(latest.macroImpulse, 3)} warning={params.MacroImpulse_Warning.toString()} signal={params.MacroImpulse_Signal.toString()} status={getSignalStatus(latest.macroImpulse, params.MacroImpulse_Warning, params.MacroImpulse_Signal)} type="Oil + real yield shock" notes="OilZ + ΔRealY_Z" />
                <IndicatorRow label="Oil/VIX" value={fmt(latest.oilVIX, 3)} warning={params.OilVIX_Warning.toString()} signal={params.OilVIX_Signal.toString()} status={getSignalStatus(latest.oilVIX, params.OilVIX_Warning, params.OilVIX_Signal)} type="Complacency after oil shock" notes="Oil ÷ VIX; high = complacent" />
                <IndicatorRow label="IG_d (bps/day)" value={fmt(latest.igD, 2)} warning="5" signal={params.IG_d_Signal.toString()} status={getSignalStatus(latest.igD, 5, params.IG_d_Signal)} type="IG credit widening" notes="Daily Δ CDX IG proxy (ICE BofA OAS)" />
                <IndicatorRow label="HY_d (bps/day)" value={fmt(latest.hyD, 2)} warning="20" signal={params.HY_d_Signal.toString()} status={getSignalStatus(latest.hyD, 20, params.HY_d_Signal)} type="HY credit widening" notes="Daily Δ CDX HY proxy (ICE BofA OAS)" />
              </>}
              {(!latest || !params) && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8 text-sm">No data. Click "Backfill 2Y" in the top bar to load history.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw Market Inputs */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Latest Raw Market Inputs</h2>
          <span className="text-xs text-muted-foreground">Actual levels vs. signal triggers</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left">Indicator</th>
                <th>Actual Value</th>
                <th>Warning</th>
                <th>Signal</th>
                <th>Status</th>
                <th>Signal Type</th>
              </tr>
            </thead>
            <tbody>
              {latest && params && <>
                <IndicatorRow label="WTI ($/bbl)" value={fmt(latest.wti, 2)} warning="—" signal={params.WTI_Signal.toString()} status={latest.wti >= params.WTI_Signal ? "SIGNAL" : "NORMAL"} type="Oil level" notes="Yahoo Finance CL=F" />
                <IndicatorRow label="25Δ RR / Skew" value={fmt(latest.skew, 2)} warning={params.Skew_Warning.toString()} signal={params.Skew_Signal.toString()} status={getSignalStatus(latest.skew, params.Skew_Warning, params.Skew_Signal)} type="Equity skew" notes="Derived from CBOE SKEW + VIX" />
                <IndicatorRow label="US10Y Real Yield (%)" value={fmt(latest.realYield, 2)} warning="—" signal="—" status="N/A" type="Inflation shock context" notes="FRED DFII10" />
                <IndicatorRow label="CDX IG 5Y (bps)" value={fmt(latest.cdxIg, 1)} warning="—" signal={params.CDX_IG_Level_Trigger.toString()} status={latest.cdxIg != null && latest.cdxIg >= params.CDX_IG_Level_Trigger ? "SIGNAL" : "NORMAL"} type="Credit level" notes="ICE BofA US Corp OAS proxy (FRED)" />
                <IndicatorRow label="CDX HY 5Y (bps)" value={fmt(latest.cdxHy, 1)} warning="—" signal={params.CDX_HY_Level_Trigger.toString()} status={latest.cdxHy != null && latest.cdxHy >= params.CDX_HY_Level_Trigger ? "SIGNAL" : "NORMAL"} type="Credit level" notes="ICE BofA US HY OAS proxy (FRED)" />
              </>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data Sources Legend */}
      <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Data Sources</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-xs text-muted-foreground">
          {[
            ["WTI (CL=F)", "Yahoo Finance", "15-min delay"],
            ["VIX (^VIX)", "Yahoo Finance", "15-min delay"],
            ["MOVE (^MOVE)", "Yahoo Finance", "15-min delay"],
            ["SKEW (^SKEW)", "Yahoo Finance", "15-min delay"],
            ["Real Yield (DFII10)", "FRED / Fed Reserve", "Daily close"],
            ["IG/HY OAS", "FRED / ICE BofA", "Daily close"],
          ].map(([indicator, source, freq]) => (
            <div key={indicator} className="space-y-0.5">
              <div className="font-medium text-foreground tabular">{indicator}</div>
              <div className="text-primary">{source}</div>
              <div>{freq}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2 border-t border-border/30 pt-2">
          CDX IG/HY proxied by ICE BofA OAS (BAMLC0A0CM / BAMLH0A0HYM2). 25Δ Put/Call IV derived from CBOE SKEW index + VIX.
          For exact CDX and options market data, replace with Bloomberg/Refinitiv feed.
        </p>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string; value: string; unit: string; sub: string;
  accent: "green" | "yellow" | "orange" | "red" | "neutral"; icon: React.ReactNode;
}

function KpiCard({ label, value, unit, sub, accent, icon }: KpiCardProps) {
  const accentColor: Record<string, string> = {
    green: "text-emerald-400", yellow: "text-yellow-400",
    orange: "text-orange-400", red: "text-red-400", neutral: "text-primary",
  };
  return (
    <div className="metric-card" data-testid={`kpi-${label.toLowerCase().replace(/[\s/]/g, "-")}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`text-lg font-bold tabular ${accentColor[accent]}`}>
        {value}
        <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>
    </div>
  );
}
