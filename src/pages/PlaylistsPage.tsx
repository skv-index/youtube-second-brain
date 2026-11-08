import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type PlaylistSummary } from "@/api/client";
import { EmptyState, ErrorState, Skeleton, fmtDate } from "@/components/ui";

export default function PlaylistsPage() {
  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: () => api<{ items: PlaylistSummary[] }>("/playlists"),
    placeholderData: keepPreviousData,
  });

  if (playlists.isError) {
    return (
      <div className="mt-6">
        <ErrorState title="Couldn't load playlists" message={(playlists.error as Error).message} onRetry={() => void playlists.refetch()} />
      </div>
    );
  }

  const items = playlists.data?.items ?? [];

  return (
    <div className="animate-rise space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-signal">Playlists</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          {items.filter((p) => !p.is_liked_mirror).length} mirrored playlists
        </h1>
      </header>

      {playlists.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No playlists mirrored yet"
          hint="Once a sync completes, every playlist on your account shows up here with all of its videos."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((p) => (
            <Link
              key={p.id}
              to={`/playlists/${p.id}`}
              className="focus-ring group overflow-hidden rounded-xl border border-ink-700/60 bg-ink-900 transition-colors hover:border-ink-600 hover:bg-ink-850"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-ink-800">
                {p.is_liked_mirror ? (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-signal/25 to-transparent">
                    <span className="font-display text-lg font-bold text-signal">Liked videos</span>
                  </div>
                ) : p.thumbnail ? (
                  <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs muted">no thumbnail</div>
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-ink-950/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                  {p.item_count} videos
                </span>
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{p.title}</p>
                <p className="mt-1 text-[11px] muted">
                  {p.is_liked_mirror ? "auto-mirror" : `${p.privacy} · created ${fmtDate(p.published_at)}`}
                </p>
                {!p.is_liked_mirror && p.enriched_count < p.item_count && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className="h-full rounded-full bg-mint/70"
                      style={{ width: `${Math.min((p.enriched_count / Math.max(p.item_count, 1)) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
