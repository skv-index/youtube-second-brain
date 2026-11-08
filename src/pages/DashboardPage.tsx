import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bookmark, FolderPlus, ThumbsUp, Users } from "lucide-react";
import { api, type StatsResponse } from "@/api/client";
import { ErrorState, Skeleton, StatCard, fmtHours, fmtTimeAgo } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";

export default function DashboardPage() {
  const auth = useAuth();
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<StatsResponse>("/videos/stats"),
    enabled: auth?.connected === true,
  });

  if (stats.isError) {
    return (
      <div className="mt-6">
        <ErrorState
          title="Could not load your stats"
          message={(stats.error as Error).message}
          onRetry={() => void stats.refetch()}
        />
      </div>
    );
  }

  const t = stats.data?.totals;

  return (
    <div className="animate-rise space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-signal">Overview</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {auth?.profile?.title ? `${auth.profile.title.split(" ")[0]}'s week, distilled` : "Your library, at a glance"}
          </h1>
        </div>
        <p className="text-xs muted">
          Last sync: {t?.lastSyncedAt ? fmtTimeAgo(t.lastSyncedAt) : "not yet synced"}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              accent
              label="Liked videos"
              value={t ? t.liked.toLocaleString() : "—"}
              sub={t ? `${fmtHours(t.totalLikedSeconds)} of video added to your brain` : undefined}
            />
            <StatCard label="Subscriptions" value={t ? t.subscriptions.toLocaleString() : "—"} sub="channels followed" />
            <StatCard label="Playlists" value={t ? t.playlists.toLocaleString() : "—"} sub={`${t?.playlistItems ?? 0} items mirrored`} />
            <StatCard
              label="Second brain"
              value={t ? (t.bookmarks + t.notes).toLocaleString() : "—"}
              sub={`${t?.bookmarks ?? 0} saved · ${t?.notes ?? 0} notes · ${t?.tags ?? 0} tags`}
            />
          </>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="surface rounded-xl p-5 lg:col-span-3">
          <h2 className="mb-5 font-display text-lg font-semibold">Likes per month</h2>
          <MonthlyChart data={stats.data?.monthly ?? []} loading={stats.isLoading} />
        </div>

        <div className="surface rounded-xl p-5 lg:col-span-2">
          <h2 className="mb-5 font-display text-lg font-semibold">Most-liked channels</h2>
          <div className="space-y-1">
            {stats.isLoading &&
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
            {!stats.isLoading && (stats.data?.topChannels?.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm muted">Nothing here yet — sync to populate.</p>
            )}
            {stats.data?.topChannels?.map((c, i) => {
              const max = stats.data.topChannels[0].videoCount || 1;
              return (
                <Link
                  key={c.channelId}
                  to={`/library?q=${encodeURIComponent("")}&channel=${c.channelId}`}
                  className="focus-ring group relative flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-850"
                >
                  {c.thumbnail ? (
                    <img src={c.thumbnail} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="h-8 w-8 rounded-full bg-ink-700" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                      <div
                        className="h-full rounded-full bg-signal/80 transition-all"
                        style={{ width: `${Math.max((c.videoCount / max) * 100, 6)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-signal">{c.videoCount}</span>
                  <span className="sr-only">videos liked, rank {i + 1}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/library" icon={ThumbsUp} title="Library" desc="Search everything you've liked, filter by tag or channel." />
        <QuickLink to="/playlists" icon={FolderPlus} title="Playlists" desc="Every playlist mirrored with its videos." />
        <QuickLink to="/collections" icon={Bookmark} title="Collections" desc="Your watch-later groups across playlists." />
        <QuickLink to="/subscriptions" icon={Users} title="Channels" desc="Who you follow, and how much you actually like them." />
      </section>
    </div>
  );
}

function MonthlyChart({ data, loading }: { data: { month: string; n: number }[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-56" />;
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm muted">No likes recorded yet — run a sync and this chart fills in.</p>;
  }
  const max = Math.max(...data.map((d) => d.n), 1);
  const label = (month: string) =>
    new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });
  return (
    <div className="flex h-56 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.month} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
            {d.n}
          </span>
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-signal/50 to-signal transition-all group-hover:from-signal group-hover:to-signal-strong"
            style={{ height: `${Math.max((d.n / max) * 82, 2)}%` }}
          />
          <span className="text-[10px] muted">{label(d.month)}</span>
        </div>
      ))}
    </div>
  );
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: typeof ThumbsUp; title: string; desc: string }) {
  return (
    <Link to={to} className="focus-ring surface group rounded-xl p-4 transition-colors hover:border-ink-600">
      <Icon size={18} className="text-signal" />
      <p className="mt-2 font-display text-sm font-semibold group-hover:text-signal">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed muted">{desc}</p>
    </Link>
  );
}
