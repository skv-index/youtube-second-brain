import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, type Video } from "@/api/client";
import { VideoCard } from "@/components/VideoCard";
import { VideoDetailModal } from "@/components/VideoDetailModal";
import { EmptyState, ErrorState, Skeleton, fmtDate, fmtTimeAgo } from "@/components/ui";

interface PlaylistDetailResponse {
  playlist: { id: string; title: string; description: string; item_count: number; privacy: string; published_at: number | null; is_liked_mirror: number };
  items: (Video & { added_at: number | null })[];
}

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [active, setActive] = useState<Video | null>(null);
  const detail = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => api<PlaylistDetailResponse>(`/playlists/${id}`),
    enabled: Boolean(id),
  });

  if (detail.isError) {
    return (
      <div className="mt-6">
        <ErrorState title="Couldn't load this playlist" message={(detail.error as Error).message} onRetry={() => void detail.refetch()} />
      </div>
    );
  }

  const p = detail.data?.playlist;
  const items = detail.data?.items ?? [];

  return (
    <div className="animate-rise space-y-5">
      <Link to="/playlists" className="focus-ring inline-flex items-center gap-1.5 text-sm muted hover:text-paper-100">
        <ArrowLeft size={15} /> All playlists
      </Link>

      {detail.isLoading ? (
        <>
          <Skeleton className="h-28 rounded-xl" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        </>
      ) : p ? (
        <>
          <header className="surface rounded-xl p-5">
            <h1 className="font-display text-2xl font-bold tracking-tight">{p.title}</h1>
            <p className="mt-1.5 flex flex-wrap gap-x-2 text-sm muted">
              <span>{p.item_count} videos</span>
              <span>·</span>
              <span>{p.privacy}</span>
              <span>·</span>
              <span>created {fmtDate(p.published_at)}</span>
            </p>
            {p.description && (
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-paper-200/80">
                {p.description.slice(0, 400)}
              </p>
            )}
          </header>

          {items.length === 0 ? (
            <EmptyState title="No videos in this playlist's mirror yet" hint="Run a full re-scan to pull this playlist's items." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((v) => (
                <VideoCard key={v.id} video={v} onOpen={setActive} />
              ))}
            </div>
          )}
          {items.length > 0 && items[0].added_at && (
            <p className="text-xs muted">Most recently added: {fmtTimeAgo(items[0].added_at)}</p>
          )}
        </>
      ) : null}

      {active && <VideoDetailModal video={active} onClose={() => setActive(null)} />}
    </div>
  );
}
