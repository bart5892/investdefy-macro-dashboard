import { useQuery } from "@tanstack/react-query";
import type { MarketData, Parameter } from "@shared/schema";
import { computeModel, type Params } from "@/lib/model";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart
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

function fmt(v: number | null | undefined, d = 3): string {
  if (v == null) return "—";
  return v.toFixed(d);
}

function regimeBg(r: string | null): string {
  switch (r) {
    case "CRASH": return "bg-red-500/15 text-red-400";
    case "SELLOFF": return "bg-orange-500/15 text-orange-400";
    case "ELEVATED": return "bg-yellow-500/15 text-yellow-400";
    case "NORMAL": return "bg-emerald-500/15 text-emerald-400";
    default: return "text-muted-foreground";
  }
}

const TEAL = "hsl(188 72% 48%)";
const GREEN = "hsl(142 71% 45%)";
const YELLOW = "hsl(38 92% 50%)";
const ORANGE = "hsl(14 89% 57%)";
const RED = "hsl(0 84% 60%)";
const PURPLE = "hsl(265 70% 65%)";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-mono font-semibold">{p.name}:</span>
          <span className="tabular">{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function ModelOutput() {
  const { data: rawData, isLoading: l1 } = useQuery<MarketData[]>({ queryKey: ["/api/market-data"] });
  const { data: paramData, isLoading: l2 } = useQuery<Parameter[]>({ queryKey: ["/api/parameters"] });

  const isLoading = l1 || l2;
  const params = paramData ? paramsFromArray(paramData) : null;
  const model = rawData && params ? computeModel(rawData, params) : [];

  if (isLoading) {
    return <div className="p-6 space-y-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const chartData = model.map(r => ({
    date: r.date.slice(5), // MM-DD
    OilZ: r.oilZ,
    Beta: r.beta,
    Impulse: r.impulse,
    MOVE_Z: r.moveZ,
    Skew_Z: r.skewZ,
    StressScore: r.stressScore,
    MacroImpulse: r.macroImpulse,
    OilVIX: r.oilVIX,
    WTI: r.wti,
    VIX: r.vix,
    MOVE: r.move,
    CDX_IG: r.cdxIg,
    CDX_HY: r.cdxHy,
    IG_d: r.igD,
    HY_d: r.hyD,
  }));

  const cols = [
    "Date", "WTI", "VIX", "MOVE", "Skew",
    "OilZ", "Beta", "Impulse", "MOVE_Z", "Skew_Z",
    "StressScore", "MacroImpulse", "Oil/VIX",
    "IG_d", "HY_d", "CreditFlag", "Regime", "ShortVol"
  ];

  return (
    <div className="p-6 space-y-6 pb-8">
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Model Output</h1>
        <p className="text-sm text-muted-foreground mt-0.5">All computed indicators across {model.length} observations</p>
      </div>

      {/* StressScore Chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">StressScore (Composite Macro Stress)</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400 inline-block"/> Normal ≤ {params?.Regime_Normal_Max}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block"/> Elevated ≤ {params?.Regime_Elevated_Max}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block"/> Selloff ≤ {params?.Regime_Selloff_Max}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 16%)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={params?.Regime_Normal_Max ?? 1} stroke={YELLOW} strokeDasharray="4 4" strokeWidth={1} />
            <ReferenceLine y={params?.Regime_Elevated_Max ?? 1.5} stroke={ORANGE} strokeDasharray="4 4" strokeWidth={1} />
            <ReferenceLine y={params?.Regime_Selloff_Max ?? 2.2} stroke={RED} strokeDasharray="4 4" strokeWidth={1} />
            <Area type="monotone" dataKey="StressScore" fill={TEAL + "22"} stroke={TEAL} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* OilZ + Beta + Impulse */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Oil Indicators (OilZ, Beta, Impulse)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 16%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <Line type="monotone" dataKey="OilZ" stroke={TEAL} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Beta" stroke={GREEN} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Impulse" stroke={ORANGE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Volatility Z-Scores (MOVE_Z, Skew_Z)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 16%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <Line type="monotone" dataKey="MOVE_Z" stroke={YELLOW} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Skew_Z" stroke={PURPLE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">MacroImpulse & Oil/VIX</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 16%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <Line type="monotone" dataKey="MacroImpulse" stroke={RED} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="OilVIX" stroke={TEAL} strokeWidth={2} dot={false} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Credit Spreads (CDX IG & HY)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 16%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <YAxis yAxisId="ig" orientation="left" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <YAxis yAxisId="hy" orientation="right" tick={{ fontSize: 10, fill: "hsl(210 8% 52%)", fontFamily: "IBM Plex Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <Line yAxisId="ig" type="monotone" dataKey="CDX_IG" stroke={GREEN} strokeWidth={2} dot={false} />
              <Line yAxisId="hy" type="monotone" dataKey="CDX_HY" stroke={ORANGE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full Model Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Full Model Table</h2>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "440px" }}>
          <table className="w-full data-table min-w-[1400px]">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <tr>
                {cols.map(c => (
                  <th key={c} className={c === "Date" ? "text-left sticky left-0 bg-muted/80" : ""}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...model].reverse().map((r) => (
                <tr key={r.date} data-testid={`model-row-${r.date}`}>
                  <td className="text-left sticky left-0 bg-card">{r.date}</td>
                  <td>{fmt(r.wti, 2)}</td>
                  <td>{fmt(r.vix, 2)}</td>
                  <td>{fmt(r.move, 1)}</td>
                  <td>{fmt(r.skew, 2)}</td>
                  <td className={r.oilZ != null && r.oilZ >= (params?.OilZ_Signal ?? 2) ? "text-red-400" : r.oilZ != null && r.oilZ >= (params?.OilZ_Warning ?? 1.5) ? "text-yellow-400" : ""}>{fmt(r.oilZ)}</td>
                  <td className={r.beta != null && r.beta >= (params?.Beta_Signal ?? 0.8) ? "text-red-400" : r.beta != null && r.beta >= (params?.Beta_Warning ?? 0.6) ? "text-yellow-400" : ""}>{fmt(r.beta)}</td>
                  <td className={r.impulse != null && r.impulse >= (params?.Impulse_Signal ?? 1.5) ? "text-red-400" : r.impulse != null && r.impulse >= (params?.Impulse_Warning ?? 0.8) ? "text-yellow-400" : ""}>{fmt(r.impulse)}</td>
                  <td className={r.moveZ != null && r.moveZ >= (params?.MOVE_Z_Signal ?? 1.5) ? "text-red-400" : r.moveZ != null && r.moveZ >= (params?.MOVE_Z_Warning ?? 1) ? "text-yellow-400" : ""}>{fmt(r.moveZ)}</td>
                  <td className={r.skewZ != null && r.skewZ >= (params?.Skew_Z_Signal ?? 1.5) ? "text-red-400" : r.skewZ != null && r.skewZ >= (params?.Skew_Z_Warning ?? 1) ? "text-yellow-400" : ""}>{fmt(r.skewZ)}</td>
                  <td className={r.stressScore != null && r.stressScore > (params?.Regime_Selloff_Max ?? 2.2) ? "text-red-400 font-semibold" : r.stressScore != null && r.stressScore > (params?.Regime_Elevated_Max ?? 1.5) ? "text-orange-400" : r.stressScore != null && r.stressScore > (params?.Regime_Normal_Max ?? 1) ? "text-yellow-400" : "text-emerald-400"}>{fmt(r.stressScore)}</td>
                  <td className={r.macroImpulse != null && r.macroImpulse >= (params?.MacroImpulse_Signal ?? 3.5) ? "text-red-400" : r.macroImpulse != null && r.macroImpulse >= (params?.MacroImpulse_Warning ?? 2.5) ? "text-yellow-400" : ""}>{fmt(r.macroImpulse)}</td>
                  <td>{fmt(r.oilVIX)}</td>
                  <td>{fmt(r.igD, 2)}</td>
                  <td>{fmt(r.hyD, 2)}</td>
                  <td className={r.creditFlag === 1 ? "text-red-400 font-semibold" : "text-emerald-400"}>{r.creditFlag}</td>
                  <td>
                    <span className={`badge-signal ${r.regime === "CRASH" ? "badge-crash" : r.regime === "SELLOFF" ? "badge-selloff" : r.regime === "ELEVATED" ? "badge-warning" : "badge-regime-normal"}`}>
                      {r.regime}
                    </span>
                  </td>
                  <td>
                    <span className={`badge-signal ${r.shortVol === "OFF" ? "badge-crash" : r.shortVol === "REDUCE" ? "badge-selloff" : "badge-regime-normal"}`}>
                      {r.shortVol}
                    </span>
                  </td>
                </tr>
              ))}
              {model.length === 0 && (
                <tr><td colSpan={cols.length} className="text-center text-muted-foreground py-8 text-sm">No data. Add rows in Data Entry.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
