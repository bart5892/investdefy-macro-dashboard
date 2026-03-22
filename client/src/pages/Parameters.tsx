import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Parameter } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ParamGroup {
  title: string;
  description: string;
  keys: string[];
}

const PARAM_GROUPS: ParamGroup[] = [
  {
    title: "Lookback Windows",
    description: "Rolling window lengths in trading days",
    keys: ["Lookback_OilVol", "Lookback_Beta", "Lookback_ZScore"],
  },
  {
    title: "StressScore Weights",
    description: "Must sum to 1.0",
    keys: ["Weight_Oil", "Weight_MOVE", "Weight_Skew"],
  },
  {
    title: "Regime Thresholds (StressScore)",
    description: "Boundaries between Normal / Elevated / Selloff / Crash",
    keys: ["Regime_Normal_Max", "Regime_Elevated_Max", "Regime_Selloff_Max"],
  },
  {
    title: "CDX Credit Triggers",
    description: "Level and daily widening triggers",
    keys: ["CDX_IG_Level_Trigger", "CDX_HY_Level_Trigger", "CDX_IG_Daily_Trigger", "CDX_HY_Daily_Trigger"],
  },
  {
    title: "OilZ Thresholds (σ)",
    description: "Oil shock z-score levels",
    keys: ["OilZ_Warning", "OilZ_Signal"],
  },
  {
    title: "Beta Thresholds",
    description: "Oil→VIX transmission elasticity",
    keys: ["Beta_Warning", "Beta_Signal"],
  },
  {
    title: "Impulse Thresholds",
    description: "Beta × OilZ composite",
    keys: ["Impulse_Warning", "Impulse_Signal"],
  },
  {
    title: "MOVE_Z Thresholds (z-score)",
    description: "Rates vol z-score levels",
    keys: ["MOVE_Z_Warning", "MOVE_Z_Signal"],
  },
  {
    title: "Skew_Z Thresholds (z-score)",
    description: "Equity skew z-score levels",
    keys: ["Skew_Z_Warning", "Skew_Z_Signal"],
  },
  {
    title: "MacroImpulse Thresholds",
    description: "OilZ + ΔRealY_Z composite",
    keys: ["MacroImpulse_Warning", "MacroImpulse_Signal"],
  },
  {
    title: "Raw Market Input Triggers",
    description: "Signal thresholds for raw inputs",
    keys: ["WTI_Signal", "Skew_Warning", "Skew_Signal", "OilVIX_Warning", "OilVIX_Signal", "IG_d_Signal", "HY_d_Signal"],
  },
];

const PARAM_LABELS: Record<string, string> = {
  Lookback_OilVol: "OilVol Window (days)",
  Lookback_Beta: "Beta Window (days)",
  Lookback_ZScore: "Z-Score Window (days)",
  Weight_Oil: "Oil Weight",
  Weight_MOVE: "MOVE Weight",
  Weight_Skew: "Skew Weight",
  Regime_Normal_Max: "Normal Max",
  Regime_Elevated_Max: "Elevated Max",
  Regime_Selloff_Max: "Selloff Max",
  CDX_IG_Level_Trigger: "IG Level (bps)",
  CDX_HY_Level_Trigger: "HY Level (bps)",
  CDX_IG_Daily_Trigger: "IG Daily Δ (bps)",
  CDX_HY_Daily_Trigger: "HY Daily Δ (bps)",
  OilZ_Warning: "Warning (σ)",
  OilZ_Signal: "Signal (σ)",
  Beta_Warning: "Warning",
  Beta_Signal: "Signal",
  Impulse_Warning: "Warning",
  Impulse_Signal: "Signal",
  MOVE_Z_Warning: "Warning (z)",
  MOVE_Z_Signal: "Signal (z)",
  Skew_Z_Warning: "Warning (z)",
  Skew_Z_Signal: "Signal (z)",
  MacroImpulse_Warning: "Warning",
  MacroImpulse_Signal: "Signal",
  WTI_Signal: "WTI Signal ($/bbl)",
  Skew_Warning: "Skew Warning (vol pts)",
  Skew_Signal: "Skew Signal (vol pts)",
  OilVIX_Warning: "Oil/VIX Warning",
  OilVIX_Signal: "Oil/VIX Signal",
  IG_d_Signal: "IG Daily Signal (bps)",
  HY_d_Signal: "HY Daily Signal (bps)",
};

export default function Parameters() {
  const { toast } = useToast();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const { data: params, isLoading } = useQuery<Parameter[]>({
    queryKey: ["/api/parameters"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      apiRequest("PUT", `/api/parameters/${key}`, { value }),
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parameters"] });
      toast({ title: "Saved", description: `${key} updated.` });
      setEdits(e => { const n = { ...e }; delete n[key]; return n; });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const paramMap: Record<string, number> = {};
  params?.forEach(p => (paramMap[p.key] = p.value));

  const getValue = (key: string) => edits[key] ?? (paramMap[key]?.toString() ?? "");

  const handleChange = (key: string, val: string) => setEdits(e => ({ ...e, [key]: val }));

  const handleSave = (key: string) => {
    const val = parseFloat(getValue(key));
    if (!isNaN(val)) updateMutation.mutate({ key, value: val });
  };

  if (isLoading) return <div className="p-6 space-y-4">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="p-6 space-y-6 pb-8">
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Parameters</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All thresholds and lookback windows used in the model calculations
        </p>
      </div>

      <div className="space-y-4">
        {PARAM_GROUPS.map(group => (
          <div key={group.title} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {group.keys.map(key => {
                const isDirty = edits[key] !== undefined;
                return (
                  <div key={key} className="space-y-1" data-testid={`param-${key}`}>
                    <label className="text-xs text-muted-foreground block">{PARAM_LABELS[key] ?? key}</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        step="any"
                        value={getValue(key)}
                        onChange={e => handleChange(key, e.target.value)}
                        className={`h-8 text-sm tabular bg-background flex-1 ${isDirty ? "border-primary/50 ring-1 ring-primary/20" : ""}`}
                        data-testid={`input-param-${key}`}
                        onKeyDown={e => e.key === "Enter" && handleSave(key)}
                      />
                      {isDirty && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 px-2 text-xs"
                          onClick={() => handleSave(key)}
                          disabled={updateMutation.isPending}
                          data-testid={`button-save-${key}`}
                        >
                          ✓
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Dictionary */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Indicator Dictionary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left">Column</th>
                <th className="text-left">What it is</th>
                <th className="text-left">Formula</th>
                <th className="text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { col: "r_Oil", what: "Oil log return", formula: "LN(WTI_t / WTI_{t-1})", notes: "Used for OilVol and OilZ" },
                { col: "OilVol", what: "Rolling stdev of r_Oil", formula: "STDEV.S(Lookback_OilVol window)", notes: "Vol normalization" },
                { col: "OilZ", what: "Oil shock in σ units", formula: "r_Oil / OilVol", notes: ">2 = shock regime" },
                { col: "Beta(VIX~Oil)", what: "Elasticity of VIX to oil", formula: "COVAR(r_VIX, r_Oil) / VAR(r_Oil)", notes: ">0.8 = oil driving vol" },
                { col: "Impulse", what: "Shock × sensitivity", formula: "Beta × OilZ", notes: "Higher = higher risk-off odds" },
                { col: "MOVE_Z", what: "Rates vol z-score", formula: "(MOVE - avg) / stdev", notes: ">1 = rates stress" },
                { col: "Skew_Z", what: "25Δ RR skew z-score", formula: "(Skew - avg) / stdev", notes: "Skew = Put IV − Call IV" },
                { col: "StressScore", what: "Composite macro stress", formula: "w_Oil×OilZ + w_MOVE×MOVE_Z + w_Skew×Skew_Z", notes: ">1.5 = selloff regime" },
                { col: "ΔRealY_Z", what: "Real yield shock z-score", formula: "(ΔRealYield - avg) / stdev", notes: "Used in MacroImpulse" },
                { col: "MacroImpulse", what: "Oil + real yield shock", formula: "OilZ + ΔRealY_Z", notes: ">3.5 = macro shock" },
                { col: "Oil/VIX", what: "Oil-to-vol ratio", formula: "WTI / VIX", notes: ">4 = complacency" },
                { col: "IG_d / HY_d", what: "Daily credit spread Δ", formula: "Spread_t − Spread_{t-1}", notes: "Widening confirms stress" },
                { col: "CreditFlag", what: "Credit stress flag", formula: "1 if level or daily widening exceeded", notes: "1 = stress confirmation" },
                { col: "Regime", what: "Macro regime label", formula: "NORMAL / ELEVATED / SELLOFF / CRASH", notes: "Based on StressScore thresholds" },
                { col: "ShortVol", what: "Trading toggle", formula: "ON / REDUCE / OFF", notes: "OFF at CRASH threshold" },
              ].map(row => (
                <tr key={row.col}>
                  <td className="text-left font-semibold tabular text-sm">{row.col}</td>
                  <td className="text-left text-sm font-sans">{row.what}</td>
                  <td className="text-left text-xs tabular text-muted-foreground">{row.formula}</td>
                  <td className="text-left text-xs text-muted-foreground font-sans">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
