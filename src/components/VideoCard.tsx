import { memo } from "react";
import { Bookmark, StickyNote, ThumbsUp } from "lucide-react";
import type { Video } from "@/api/client";
import { cn, fmtCount, fmtDate, fmtTimeAgo } from "./ui";

export const VideoCard = memo(function VideoCard({
  video,
  onOpen,
}: {
  video: Video;
  onOpen: (video: Video) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(video)}
      className="focus-ring group flex w-full flex-col overflow-hidden rounded-xl border border-ink-700/60 bg-ink-900 text-left transition-colors hover:border-ink-600 hover:bg-ink-850"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-ink-800">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs muted">no thumbnail</div>
        )}
        {video.durationSeconds > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-ink-950/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-paper-100">
            {formatShort(video.durationSeconds)}
          </span>
        )}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          {video.bookmarked && (
            <span className="rounded bg-ink-950/85 p-1 text-signal" title="Bookmarked">
              <Bookmark size={12} fill="currentColor" />
            </span>
          )}
          {video.hasNote && (
            <span className="rounded bg-ink-950/85 p-1 text-mint" title="Has note">
              <StickyNote size={12} />
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-paper-100">{video.title}</p>
        <p className="truncate text-xs muted">{video.channelTitle}</p>
        <p className="mt-auto flex items-center gap-2 pt-1.5 text-[11px] muted">
          {video.likedAt ? (
            <>
              <ThumbsUp size={11} className="text-signal" />
              {fmtTimeAgo(video.likedAt)}
            </>
          ) : (
            fmtDate(video.publishedAt)
          )}
          {video.viewCount > 0 && <span>· {fmtCount(video.viewCount)} views</span>}
        </p>
        {video.tags.length > 0 && (
          <p className="truncate pt-1 text-[11px] text-signal/90"># {video.tags.join(" #")}</p>
        )}
      </div>
    </button>
  );
});

function formatShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

void cn;
