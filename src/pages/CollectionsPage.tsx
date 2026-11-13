import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { api, type CollectionSummary, type Video } from "@/api/client";
import { VideoCard } from "@/components/VideoCard";
import { EmptyState, ErrorState, Spinner, fmtDate } from "@/components/ui";

interface MemberResponse {
  items: (Video & { position: number })[];
}

export default function CollectionsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<{ items: CollectionSummary[] }>("/annotations/collections"),
  });

  const createMutation = useMutation({
    mutationFn: () => api("/annotations/collections", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["collections"] });
      setName("");
      setCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/annotations/collections/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["collections"] }),
  });

  const members = useQuery({
    queryKey: ["collection-videos", openId],
    queryFn: () => api<MemberResponse>(`/annotations/collections/${openId}/videos`),
    enabled: openId !== null,
  });

  const removeFromCollection = useMutation({
    mutationFn: (args: { collectionId: number; videoId: string }) =>
      api(`/annotations/collections/${args.collectionId}/videos/${args.videoId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["collection-videos", openId] });
      void qc.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const items = collections.data?.items ?? [];

  return (
    <div className="animate-rise space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-signal">Collections</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Group videos your way</h1>
          <p className="mt-1 text-sm muted">
            Collections are local playlists — pull videos from anywhere in your library into a themed group.
          </p>
        </div>
        {creating ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) createMutation.mutate();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name…"
              maxLength={80}
              className="focus-ring w-56 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm placeholder:text-paper-300/40"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="focus-ring rounded-lg bg-signal px-3.5 py-2 text-sm font-semibold text-ink-950 hover:bg-signal-strong disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cancel"
              className="focus-ring rounded-lg border border-ink-600 p-2 text-paper-200 hover:bg-ink-800"
            >
              <X size={15} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-signal-strong"
          >
            <Plus size={15} /> New collection
          </button>
        )}
      </header>

      {collections.isError ? (
        <ErrorState title="Couldn't load collections" message={(collections.error as Error).message} onRetry={() => void collections.refetch()} />
      ) : collections.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface h-16 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No collections yet"
          hint="Create one (e.g. “Deep work music” or “Recipes to try”), then add videos from the Library or the video panel."
        />
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="surface overflow-hidden rounded-xl">
              <div className="flex items-center gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  aria-expanded={openId === c.id}
                  className="focus-ring flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <ChevronDown
                    size={18}
                    className={`shrink-0 transition-transform ${openId === c.id ? "rotate-180 text-signal" : "muted"}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs muted">
                      {c.video_count} videos · created {fmtDate(c.created_at)}
                      {c.video_count === 0 ? " — add from Library" : ""}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(c.id)}
                  aria-label={`Delete collection ${c.name}`}
                  className="focus-ring rounded-lg p-2 text-paper-300 hover:bg-signal-soft hover:text-signal"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {openId === c.id && (
                <div className="border-t border-ink-700/60 p-4">
                  {members.isLoading && members.error === null ? (
                    <div className="flex items-center gap-2 text-sm muted">
                      <Spinner className="h-3.5 w-3.5" /> loading videos…
                    </div>
                  ) : (members.data?.items.length ?? 0) === 0 ? (
                    <p className="text-sm muted">
                      Empty. Open any video and use the Collections row, or bookmark videos you want to pull in.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {members.data!.items.map((v) => (
                        <div key={v.id} className="relative">
                          <VideoCard video={v} />
                          <button
                            type="button"
                            onClick={() => removeFromCollection.mutate({ collectionId: c.id, videoId: v.id })}
                            aria-label={`Remove ${v.title} from ${c.name}`}
                            className="focus-ring absolute right-1.5 top-1.5 rounded-md bg-ink-950/85 p-1.5 text-paper-200 hover:text-signal"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
