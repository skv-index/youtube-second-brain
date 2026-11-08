import { useState } from "react";
import { AlertTriangle, ArrowRight, KeyRound, RefreshCw, Youtube } from "lucide-react";
import { useAuth, notifyAuthChanged } from "@/auth/AuthProvider";
import { useInvalidateSync } from "@/hooks/useSync";
import { api } from "@/api/client";
import { ErrorState, Spinner } from "@/components/ui";

const SETUP_STEPS = [
  "In Google Cloud Console, create an OAuth client ID of type Web application (APIs & Services → Credentials).",
  "Authorized origin: http://localhost:5173 · Authorized redirect URI: http://localhost:3000/api/auth/google/callback",
  "Paste the client ID and client secret into the .env file at the project root, then restart (npm run dev).",
  "Enable the YouTube Data API v3 in APIs & Services → Library, then press Connect below.",
];

export default function ConnectGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const invalidate = useInvalidateSync();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    // Surface ?authError= from a failed OAuth callback on first render
    // (before the auth provider scrubs the URL).
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("authError");
      if (authError) window.history.replaceState({}, "", window.location.pathname);
      return authError ? decodeURIComponent(authError) : null;
    }
    return null;
  });

  if (auth === null) {
    return (
      <div className="grid min-h-[50dvh] place-items-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (auth.connected) {
    return <>{children}</>;
  }

  const startConnect = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/google", { redirect: "manual" });
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        const target = res.headers.get("location");
        if (target) {
          window.location.href = target;
          return;
        }
        window.location.href = res.url;
        return;
      }
      // A JSON error (503 etc.) means OAuth isn't configured yet.
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "Could not start Google sign-in.");
      setStarting(false);
    } catch {
      setError("Cannot reach the local server. Is `npm run dev` running?");
      setStarting(false);
    }
  };

  const reconnect = async () => {
    await api("/auth/logout", { method: "POST" });
    notifyAuthChanged();
    invalidate();
    void startConnect();
  };

  if (auth.needsReauth) {
    return (
      <div className="mx-auto mt-16 max-w-md">
        <ErrorState
          title="Connection needs a refresher"
          message="Google revoked or expired the saved authorization. Reconnect your account to keep your library in sync. Your tags, notes and collections are safe — they live locally."
        />
        <button
          type="button"
          onClick={reconnect}
          className="focus-ring mx-auto mt-5 flex items-center gap-2 rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-signal-strong"
        >
          <RefreshCw size={15} /> Reconnect Google account
        </button>
      </div>
    );
  }

  return (
    <div className="animate-rise mx-auto mt-10 max-w-xl">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-signal shadow-lg shadow-signal/25">
          <Youtube className="h-8 w-8 text-ink-950" strokeWidth={2.5} />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Your YouTube, <span className="text-signal">actually organized</span>.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed muted">
          Pull your liked videos, playlists and subscriptions into a local library you can search,
          tag, annotate and export. Everything stays on your machine.
        </p>
      </div>

      {auth.oauthConfigured ? (
        <button
          type="button"
          onClick={startConnect}
          disabled={starting}
          className="focus-ring mx-auto flex items-center gap-2.5 rounded-xl bg-paper-100 px-6 py-3 font-display text-sm font-bold text-ink-950 transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {starting ? <Spinner className="border-ink-950 border-t-transparent" /> : <Youtube size={18} />}
          {starting ? "Opening Google…" : "Connect your YouTube account"}
          {!starting && <ArrowRight size={16} />}
        </button>
      ) : (
        <div className="surface rounded-xl p-6">
          <p className="mb-4 flex items-center gap-2 font-display font-semibold">
            <KeyRound size={16} className="text-signal" /> One-minute setup
          </p>
          <ol className="space-y-3 text-sm">
            {SETUP_STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-700 text-[11px] font-bold tabular-nums">
                  {i + 1}
                </span>
                <span className="leading-relaxed text-paper-200/90">{step}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={startConnect}
            className="focus-ring mt-5 flex items-center gap-2 rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-signal-strong"
          >
            I've added the credentials — connect
          </button>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="mt-8 text-center text-xs muted">
        Read-only access via youtube.readonly · tokens stored in your local SQLite file, never in the browser
      </p>
    </div>
  );
}
