import { useEffect, useRef } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Moon,
  PlaySquare,
  Settings,
  Sun,
  Users,
  Bookmark,
  FolderPlus,
  Youtube,
} from "lucide-react";
import { useTheme } from "@/stores/theme";
import { useAuth } from "@/auth/AuthProvider";
import { useInvalidateSync, useSyncStatus } from "@/hooks/useSync";
import { cn, Spinner } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: PlaySquare },
  { to: "/playlists", label: "Playlists", icon: FolderPlus },
  { to: "/subscriptions", label: "Channels", icon: Users },
  { to: "/collections", label: "Collections", icon: Bookmark },
  { to: "/settings", label: "Settings", icon: Settings },
];

function SyncBanner() {
  const auth = useAuth();
  const sync = useSyncStatus(auth?.connected === true);
  const status = sync.data;
  const invalidate = useInvalidateSync();
  const prevFinishedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!status) return;
    const nowFinished = status.finishedAt;
    const before = prevFinishedAt.current;
    prevFinishedAt.current = nowFinished;
    // Fire once when a run transitions to finished.
    if (nowFinished && before !== null && before !== nowFinished) {
      invalidate();
    }
  }, [status, invalidate]);

  if (!status?.syncingNow) return null;
  return (
    <div role="status" className="mb-6 flex items-center gap-3 rounded-lg border border-mint/30 bg-mint-soft px-4 py-2.5 text-sm">
      <Spinner className="border-mint border-t-transparent" />
      <span>
        Syncing <span className="font-medium">{status.step.toLowerCase()}</span>
        <span className="ml-1.5 muted tabular-nums">
          {status.itemsSynced.toLocaleString()} items · {status.mode ?? ""}
        </span>
      </span>
    </div>
  );
}

export default function Shell() {
  const theme = useTheme();
  const auth = useAuth();

  useEffect(() => {
    theme.hydrate();
    // theme store is a stable module singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-ink-700/70 bg-ink-900/70 backdrop-blur md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-signal">
            <Youtube className="h-5 w-5 text-ink-950" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-display text-sm font-bold leading-tight">Second Brain</p>
            <p className="text-[11px] muted">for YouTube</p>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-signal-soft text-signal" : "text-paper-200/80 hover:bg-ink-800 hover:text-paper-100"
                )
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-700/70 p-4">
          {auth?.profile?.title && (
            <div className="flex items-center gap-2.5">
              {auth.profile.thumbnail && (
                <img src={auth.profile.thumbnail} alt="" className="h-8 w-8 rounded-full object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{auth.profile.title}</p>
                <p className="text-[11px] muted">Connected to YouTube</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-700/70 bg-ink-950/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal">
            <Youtube className="h-4 w-4 text-ink-950" strokeWidth={2.5} />
          </span>
          <p className="font-display text-sm font-bold">Second Brain</p>
        </div>
        <MobileNav />
      </header>

      <main className="px-4 pb-16 pt-6 md:ml-60 md:px-10 md:pt-9">
        <div className="mx-auto max-w-6xl">
          <SyncBanner />
          <Outlet />
        </div>
      </main>

      <button
        type="button"
        onClick={theme.toggle}
        aria-label={theme.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="focus-ring fixed bottom-5 right-5 z-40 grid h-10 w-10 place-items-center rounded-full border border-ink-600 bg-ink-800 text-paper-200 shadow-lg hover:bg-ink-700 md:bottom-6 md:right-6"
      >
        {theme.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </div>
  );
}

function MobileNav() {
  return (
    <nav className="flex gap-1 text-paper-200">
      {NAV.map(({ to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          aria-label={NAV.find((n) => n.to === to)?.label}
          className={({ isActive }) =>
            cn("focus-ring rounded-lg p-2", isActive ? "bg-signal-soft text-signal" : "hover:bg-ink-800")
          }
        >
          <Icon size={18} />
        </NavLink>
      ))}
    </nav>
  );
}
