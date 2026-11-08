import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Spinner, cn, fmtTimeAgo } from "./ui";
import { api } from "@/api/client";
import { useInvalidateSync, useSyncStatus } from "@/hooks/useSync";

interface SyncStatusLike {
  syncingNow: boolean;
  finishedAt: number | null;
  lastCompleted: { lastCompletedAt: number | null; lastError: string | null; lastMode: string | null };
  error: string | null;
  errorKind: string | null;
  quota: { used: number; limit: number };
}

export function SyncButton() {
  const invalidate = useInvalidateSync();
  const [busy, setBusy] = useState(false);

  const start = async (mode: "incremental" | "full") => {
    setBusy(true);
    try {
      await api("/sync/trigger", { method: "POST", body: JSON.stringify({ mode }) });
      invalidate();
    } finally {
      setTimeout(() => setBusy(false), 1200);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start("incremental")}
        className="focus-ring flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-signal-strong disabled:opacity-60"
      >
        {busy ? <Spinner className="border-ink-950 border-t-transparent" /> : <RefreshCw size={14} />} Sync now
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start("full")}
        title="Re-scan everything, fixing any misses (uses more quota)"
        className="focus-ring rounded-lg border border-ink-600 px-3 py-2 text-sm text-paper-200 hover:bg-ink-800 disabled:opacity-60"
      >
        Full re-scan
      </button>
    </div>
  );
}

export function SyncStatusCard() {
  const status = useSyncStatus(true);
  const s = status.data as SyncStatusLike | undefined;

  return (
    <div className="surface rounded-xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Sync</h3>
        {s && (
          <Badge tone={s.lastCompleted.lastError ? "bad" : "good"}>
            {s.lastCompleted.lastError ? "error" : "healthy"}
          </Badge>
        )}
      </div>
      {status.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-sm muted">
          <Spinner className="h-3 w-3" /> checking…
        </div>
      ) : s ? (
        <>
          <p className="mt-2 text-sm muted">
            {s.syncingNow ? "Running now…" : `Last completed: ${fmtTimeAgo(s.lastCompleted.lastCompletedAt)}`}
          </p>
          {s.lastCompleted.lastError && !s.syncingNow && (
            <p className="mt-2 rounded-lg border border-signal/40 bg-signal-soft px-3 py-2 text-xs leading-relaxed text-signal">
              {s.lastCompleted.lastError}
            </p>
          )}
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] muted">
              <span>API quota today</span>
              <span className="tabular-nums">
                {s.quota.used.toLocaleString()} / {s.quota.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
              <div
                className={cn("h-full rounded-full", s.quota.used > s.quota.limit * 0.85 ? "bg-signal" : "bg-mint")}
                style={{ width: `${Math.min((s.quota.used / s.quota.limit) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="mt-4">
            <SyncButton />
          </div>
        </>
      ) : null}
    </div>
  );
}

// Auto-sync runs server-side (on startup + every 15 minutes); this component
// is informational only.
export function AutoSyncNote() {
  return (
    <p className="text-xs leading-relaxed muted">
      Automatic sync runs when the server starts and every 15 minutes while it's on. Quota resets daily at midnight Pacific
      time.
    </p>
  );
}
