import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Plus, Bookmark, BookmarkCheck } from "lucide-react";
import { api, type CollectionSummary, type VideoDetail } from "@/api/client";
import { ErrorState, Skeleton, cn, fmtCount, fmtDate, fmtDuration, Spinner, TagPill } from "@/components/ui";

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["video", id],
    queryFn: () => api<VideoDetail>(`/videos/${id}`),
    enabled: Boolean(id),
  });

  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<{ items: CollectionSummary[] }>("/annotations/collections"),
  });

  const joinedCollections = useMemo(
    () => new Map((collections.data?.items ?? []).map((c) => [c.id, c])),
    [collections.data]
  );

  const membership = useQuery({
    queryKey: ["video-membership", id],
    queryFn: async () => {
      const all = await api<{ items: CollectionSummary[] }>("/annotations/collections");
      const memberships = await Promise.all(
        all.items.map(async (c) => {
          const items = await api<{ items: { id: string }[] }>(`/annotations/collections/${c.id}/videos`);
          return { id: c.id, name: c.name, member: items.items.some((v) => v.id === id) };
        })
      );
      return memberships;
    },
    enabled: Boolean(id),
  });

  const qc = useQueryClient();

  const tagMutation = useMutation({
    mutationFn: (tags: string[]) => api(`/annotations/videos/${id}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["video", id] });
      void qc.invalidateQueries({ queryKey: ["videos"] });
      void qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const noteMutation = useMutation<{ updatedAt?: number; empty?: boolean }, Error, string>({
    mutationFn: (body: string) =>
      api(`/annotations/videos/${id}/note`, { method: "PUT", body: JSON.stringify({ body }) }),
    onSuccess: (data: { updatedAt?: number; empty?: boolean }) => {
      void qc.invalidateQueries({ queryKey: ["video", id] });
      void qc.invalidateQueries({ queryKey: ["videos"] });
      if (typeof data.updatedAt === "number") setNoteDraft(null);
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: (add: boolean) =>
      api(`/annotations/videos/${id}/bookmark`, { method: add ? "POST" : "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["video", id] });
      void qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });

  const collectionMutation = useMutation({
    mutationFn: (args: { collectionId: number; add: boolean }) =>
      api(`/annotations/collections/${args.collectionId}/videos/${id}`, { method: args.add ? "POST" : "DELETE" }),
    onSuccess: () => {
      void membership.refetch();
      void qc.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const d = detail.data;
  const tags: string[] = (() => {
    const raw = d?.tags ?? "";
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return [];
  })();
  const bookmarked = d?.bookmarked ?? false;
  const noteBody = noteDraft ?? d?.note ?? "";

  if (detail.isError) {
    return (
      <div className="mt-6">
        <ErrorState title="Couldn't load video" message={(detail.error as Error).message} onRetry={() => void detail.refetch()} />
      </div>
    );
  }

  if (detail.isLoading || !d) {
    return (
      <div className="animate-rise space-y-5">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-5">
      <Link to="/library" className="focus-ring inline-flex items-center gap-1.5 text-sm muted hover:text-paper-100">
        <ArrowLeft size={15} /> Library
      </Link>

      <div className="surface rounded-xl overflow-hidden">
        <div className="relative aspect-video w-full bg-ink-950">
          {d.thumbnail ? (
            <img src={d.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight">{d.title}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm muted">
                <span>{d.channelTitle}</span>
                <span>·</span>
                <span>{fmtDate(d.publishedAt)}</span>
                {d.viewCount > 0 && (
                  <>
                    <span>·</span>
                    <span>{fmtCount(d.viewCount)} views</span>
                  </>
                )}
                {d.durationSeconds > 0 && (
                  <>
                    <span>·</span>
                    <span>{fmtDuration(d.durationSeconds)}</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 text-sm font-semibold text-ink-950 hover:bg-signal-strong"
              >
                Watch on YouTube <ExternalLink size={14} />
              </a>
              <button
                type="button"
                onClick={() => bookmarkMutation.mutate(!bookmarked)}
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium",
                  bookmarked
                    ? "border-signal/50 bg-signal-soft text-signal"
                    : "border-ink-600 text-paper-200 hover:bg-ink-800"
                )}
              >
                {bookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                {bookmarked ? "Saved" : "Save"}
              </button>
            </div>
          </div>

          {d.likeCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs muted">
              <span className="text-signal">♥</span> {fmtCount(d.likeCount)} likes on YouTube
            </p>
          )}

          {/* Tags */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider muted">
              Tags {tagMutation.isPending && <Loader2 size={12} className="animate-spin" />}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((t) => (
                <TagPill key={t} tag={t} onRemove={() => tagMutation.mutate(tags.filter((x) => x !== t))} />
              ))}
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = tagDraft.trim();
                  if (value && !tags.includes(value.toLowerCase())) {
                    tagMutation.mutate([...tags, value.toLowerCase()]);
                  }
                  setTagDraft("");
                }}
              >
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="add tag…"
                  className="focus-ring w-28 rounded-lg border border-ink-600 bg-ink-950 px-2.5 py-1 text-sm placeholder:text-paper-300/40"
                />
                <button
                  type="submit"
                  className="focus-ring rounded-lg border border-ink-600 p-1 text-paper-200 hover:bg-ink-800"
                  aria-label="Add tag"
                >
                  <Plus size={14} />
                </button>
              </form>
            </div>
          </section>

          {/* Note */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider muted">Your note</h3>
              {noteMutation.isPending && <Spinner className="h-3 w-3 border-mint border-t-transparent" />}
            </div>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                if (noteDraft !== null && noteDraft !== (d?.note ?? "")) noteMutation.mutate(noteDraft);
              }}
              rows={6}
              placeholder="Why does this video matter to you? Key ideas, timestamps, next actions…"
              className="focus-ring w-full resize-y rounded-lg border border-ink-600 bg-ink-950 px-3.5 py-3 text-sm leading-relaxed placeholder:text-paper-300/40"
            />
            <p className="mt-1 text-[11px] muted">Saved automatically when you click outside the note.</p>
          </section>

          {/* Collections */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider muted">Collections</h3>
            <div className="flex flex-wrap gap-2">
              {(membership.data ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => collectionMutation.mutate({ collectionId: m.id, add: !m.member })}
                  className={cn(
                    "focus-ring rounded-full border px-3 py-1.5 text-xs font-medium",
                    m.member
                      ? "border-mint/50 bg-mint-soft text-mint"
                      : "border-ink-600 text-paper-200 hover:bg-ink-800"
                  )}
                >
                  {joinedCollections.get(m.id)?.name ?? m.name}
                  {m.member ? " ✓" : ""}
                </button>
              ))}
              {membership.isLoading && <span className="text-xs muted">loading collections…</span>}
              {(membership.data ?? []).length === 0 && !membership.isLoading && (
                <p className="text-xs muted">
                  No collections yet — create one from the Collections page, then group videos here.
                </p>
              )}
            </div>
          </section>

          {/* Appears in playlists */}
          {(d.playlists?.length ?? 0) > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider muted">In your playlists</h3>
              <div className="flex flex-wrap gap-1.5">
                {d.playlists.map((p) => (
                  <Link
                    key={p.id}
                    to={`/playlists/${p.id}`}
                    className="focus-ring rounded-full bg-ink-800 px-3 py-1.5 text-xs text-paper-200 hover:bg-ink-700"
                  >
                    {p.title}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {d.description && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider muted">Description</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-paper-200/80">{d.description.slice(0, 2000)}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}