import { useMutation } from "@tanstack/react-query";
import { Download, LogOut, Moon, Sun } from "lucide-react";
import { notifyAuthChanged, useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/stores/theme";
import { AutoSyncNote, SyncStatusCard } from "@/components/sync";
import { Badge } from "@/components/ui";
import { api } from "@/api/client";

const EXPORTS = [
  { dataset: "videos", label: "All videos", desc: "Titles, channels, dates, stats" },
  { dataset: "notes", label: "Notes", desc: "Your annotations with video titles" },
  { dataset: "collections", label: "Collections", desc: "Groups with video counts" },
  { dataset: "subscriptions", label: "Subscriptions", desc: "Channels with subscriber counts" },
  { dataset: "playlists", label: "Playlists", desc: "Mirror summaries" },
];

export default function SettingsPage() {
  const auth = useAuth();
  const theme = useTheme();

  const logout = useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      notifyAuthChanged();
    },
  });

  return (
    <div className="animate-rise mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-signal">Settings</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Preferences & data</h1>
      </header>

      <section className="surface rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold">Account</h2>
            {auth?.profile?.title ? (
              <p className="mt-1 text-sm muted">
                {auth.profile.title}
                {auth.oauthConfigured ? null : " · local session (Google OAuth client not yet configured)"}
              </p>
            ) : (
              <p className="mt-1 text-sm muted">Not connected.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {auth?.connected ? <Badge tone="good">read-only tokens</Badge> : <Badge tone="warn">not connected</Badge>}
            {auth?.connected && (
              <button
                type="button"
                onClick={() => logout.mutate()}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-2 text-sm text-paper-200 hover:bg-ink-800"
              >
                <LogOut size={14} /> Sign out
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed muted">
          Scopes requested: <code className="rounded bg-ink-800 px-1 py-0.5">youtube.readonly</code> — the app never writes
          to your YouTube account. Access and refresh tokens live only in <code className="rounded bg-ink-800 px-1 py-0.5">server/data/app.db</code> on
          this machine; the browser only ever holds a session cookie.
        </p>
      </section>

      <SyncStatusCard />

      <section className="surface rounded-xl p-5">
        <h2 className="mb-1 font-display font-semibold">Automatic sync</h2>
        <AutoSyncNote />
      </section>

      <section className="surface rounded-xl p-5">
        <h2 className="font-display font-semibold">Appearance</h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => theme.setTheme("dark")}
            aria-pressed={theme.theme === "dark"}
            className={`focus-ring flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${theme.theme === "dark" ? "border-signal/50 bg-signal-soft text-signal" : "border-ink-600 text-paper-200 hover:bg-ink-800"}`}
          >
            <Moon size={14} /> Dark
          </button>
          <button
            type="button"
            onClick={() => theme.setTheme("light")}
            aria-pressed={theme.theme === "light"}
            className={`focus-ring flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${theme.theme === "light" ? "border-signal/50 bg-signal-soft text-signal" : "border-ink-600 text-paper-200 hover:bg-ink-800"}`}
          >
            <Sun size={14} /> Light
          </button>
        </div>
      </section>

      <section className="surface rounded-xl p-5">
        <h2 className="font-display font-semibold">Export your brain</h2>
        <p className="mt-1 text-xs muted">JSON keeps structure; CSV opens in a spreadsheet.</p>
        <div className="mt-4 grid gap-2.5">
          {EXPORTS.map((e) => (
            <div key={e.dataset} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700/60 p-3">
              <div>
                <p className="text-sm font-medium">{e.label}</p>
                <p className="text-xs muted">{e.desc}</p>
              </div>
              <div className="flex gap-2">
                <ExportLink dataset={e.dataset} format="json" />
                <ExportLink dataset={e.dataset} format="csv" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExportLink({ dataset, format }: { dataset: string; format: "json" | "csv" }) {
  return (
    <a
      href={`/api/export?dataset=${dataset}&format=${format}`}
      download
      className="focus-ring flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-paper-200 hover:bg-ink-800"
    >
      <Download size={12} /> {format.toUpperCase()}
    </a>
  );
}
