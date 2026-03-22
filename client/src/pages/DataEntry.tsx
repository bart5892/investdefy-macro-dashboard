import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MarketData } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
  { key: "date", label: "Date", type: "date", required: true },
  { key: "wti", label: "WTI ($/bbl)", type: "number" },
  { key: "vix", label: "VIX", type: "number" },
  { key: "move", label: "MOVE", type: "number" },
  { key: "putIv30d", label: "25Δ Put IV 30D (%)", type: "number" },
  { key: "callIv30d", label: "25Δ Call IV 30D (%)", type: "number" },
  { key: "realYield", label: "US10Y Real Yield (%)", type: "number" },
  { key: "cdxIg", label: "CDX IG 5Y (bps)", type: "number" },
  { key: "cdxHy", label: "CDX HY 5Y (bps)", type: "number" },
] as const;

type FormKey = typeof FIELDS[number]["key"];
type FormState = Partial<Record<FormKey, string>>;

function emptyForm(): FormState {
  return { date: new Date().toISOString().slice(0, 10) };
}

export default function DataEntry() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const { data: rows, isLoading } = useQuery<MarketData[]>({ queryKey: ["/api/market-data"] });

  const upsertMutation = useMutation({
    mutationFn: (data: FormState) =>
      apiRequest("POST", "/api/market-data", {
        date: data.date,
        wti: data.wti ? parseFloat(data.wti) : undefined,
        vix: data.vix ? parseFloat(data.vix) : undefined,
        move: data.move ? parseFloat(data.move) : undefined,
        putIv30d: data.putIv30d ? parseFloat(data.putIv30d) : undefined,
        callIv30d: data.callIv30d ? parseFloat(data.callIv30d) : undefined,
        realYield: data.realYield ? parseFloat(data.realYield) : undefined,
        cdxIg: data.cdxIg ? parseFloat(data.cdxIg) : undefined,
        cdxHy: data.cdxHy ? parseFloat(data.cdxHy) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-data"] });
      toast({ title: "Row saved", description: `Data for ${form.date} saved successfully.` });
      setForm(emptyForm());
      setShowForm(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/market-data/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/market-data"] }),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) return;
    upsertMutation.mutate(form);
  };

  const sorted = rows ? [...rows].sort((a, b) => b.date.localeCompare(a.date)) : [];

  return (
    <div className="p-6 space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Data Entry</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily time series — one row per trading day. {sorted.length} rows loaded.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(v => !v)}
          className="gap-2"
          data-testid="button-add-row"
        >
          <Plus size={14} />
          Add Row
        </Button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-card p-5 space-y-4"
          data-testid="form-data-entry"
        >
          <h2 className="text-sm font-semibold text-foreground">New / Update Row (date is the unique key)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {FIELDS.map(({ key, label, type }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={key} className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  id={key}
                  type={type}
                  step={type === "number" ? "any" : undefined}
                  value={form[key] ?? ""}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  required={key === "date"}
                  className="h-8 text-sm tabular bg-background"
                  data-testid={`input-${key}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={upsertMutation.isPending} data-testid="button-save">
              {upsertMutation.isPending ? "Saving…" : "Save Row"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Data Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : (
            <table className="w-full data-table min-w-[1100px]">
              <thead>
                <tr className="bg-muted/30 sticky top-0 z-10">
                  <th className="text-left">Date</th>
                  <th>WTI</th>
                  <th>VIX</th>
                  <th>MOVE</th>
                  <th>25Δ Put IV</th>
                  <th>25Δ Call IV</th>
                  <th>Skew</th>
                  <th>Real Yield</th>
                  <th>CDX IG</th>
                  <th>CDX HY</th>
                  <th className="text-center">Del</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id} data-testid={`data-row-${r.date}`}>
                    <td className="text-left font-medium">{r.date}</td>
                    <td>{r.wti?.toFixed(2) ?? "—"}</td>
                    <td>{r.vix?.toFixed(2) ?? "—"}</td>
                    <td>{r.move?.toFixed(1) ?? "—"}</td>
                    <td>{r.putIv30d?.toFixed(2) ?? "—"}</td>
                    <td>{r.callIv30d?.toFixed(2) ?? "—"}</td>
                    <td>{r.putIv30d != null && r.callIv30d != null ? (r.putIv30d - r.callIv30d).toFixed(2) : "—"}</td>
                    <td>{r.realYield?.toFixed(2) ?? "—"}</td>
                    <td>{r.cdxIg?.toFixed(1) ?? "—"}</td>
                    <td>{r.cdxHy?.toFixed(1) ?? "—"}</td>
                    <td className="text-center">
                      <button
                        onClick={() => deleteMutation.mutate(r.id)}
                        disabled={deleteMutation.isPending}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                        data-testid={`button-delete-${r.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center text-muted-foreground py-10 text-sm">
                      No data rows. Click "Add Row" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
