import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { RefreshCw, Database, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface RefreshStatus {
  isRefreshing: boolean;
  lastRefreshTime: string | null;
  lastRefreshError: string | null;
  rowCount: number;
}

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return "Never";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LiveDataBar() {
  const { toast } = useToast();
  const [countdown, setCountdown] = useState(900); // 15 min

  const { data: status } = useQuery<RefreshStatus>({
    queryKey: ["/api/refresh-status"],
    refetchInterval: 30000, // poll status every 30s
  });

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          triggerRefresh();
          return 900;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/refresh"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refresh-status"] });
      toast({ title: "Data refreshed", description: "Latest market data loaded." });
      setCountdown(900);
    },
    onError: (err: any) => {
      toast({ title: "Refresh failed", description: err?.message ?? "Check console", variant: "destructive" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/backfill?days=730"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/market-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refresh-status"] });
      toast({
        title: "Backfill complete",
        description: `${data?.inserted ?? "?"} rows loaded (2 years of history).`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Backfill failed", description: err?.message ?? "Check console", variant: "destructive" });
    },
  });

  function triggerRefresh() {
    refreshMutation.mutate();
  }

  const isWorking = refreshMutation.isPending || backfillMutation.isPending || status?.isRefreshing;
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/60 backdrop-blur-sm text-xs">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        {isWorking ? (
          <RefreshCw size={12} className="text-primary animate-spin" />
        ) : status?.lastRefreshError ? (
          <AlertCircle size={12} className="text-red-400" />
        ) : (
          <Wifi size={12} className="text-emerald-400" />
        )}
        <span className="text-muted-foreground">
          {isWorking
            ? "Refreshing…"
            : status?.lastRefreshError
            ? `Error: ${status.lastRefreshError.slice(0, 60)}`
            : `Updated ${timeAgo(status?.lastRefreshTime ?? null)}`}
        </span>
      </div>

      <span className="text-border">·</span>

      {/* Row count */}
      <span className="text-muted-foreground tabular">
        <span className="text-foreground font-medium">{status?.rowCount ?? "—"}</span> rows
      </span>

      <span className="text-border">·</span>

      {/* Next refresh countdown */}
      <span className="text-muted-foreground tabular">
        Next refresh in{" "}
        <span className="text-foreground font-medium tabular">
          {mins}:{secs.toString().padStart(2, "0")}
        </span>
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Data source note */}
      <span className="text-muted-foreground hidden xl:block">
        Sources: Yahoo Finance (WTI, VIX, MOVE, SKEW) · FRED (Real Yield, IG/HY OAS)
      </span>

      <span className="text-border hidden xl:block">·</span>

      {/* Backfill button */}
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2.5 text-xs gap-1.5"
        onClick={() => backfillMutation.mutate()}
        disabled={!!isWorking}
        data-testid="button-backfill"
      >
        <Database size={11} />
        {backfillMutation.isPending ? "Loading…" : "Backfill 2Y"}
      </Button>

      {/* Manual refresh button */}
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2.5 text-xs gap-1.5"
        onClick={triggerRefresh}
        disabled={!!isWorking}
        data-testid="button-refresh"
      >
        <RefreshCw size={11} className={refreshMutation.isPending ? "animate-spin" : ""} />
        Refresh Now
      </Button>
    </div>
  );
}
