import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, type SubscriptionChannel } from "@/api/client";
import { EmptyState, ErrorState, Skeleton, fmtCount, fmtDate } from "@/components/ui";
import { useDebounced } from "@/hooks/useDebounced";

const SORTS = [
  { value: "subscriber_count:desc", label: "Most subscribers" },
  { value: "title:asc", label: "A–Z" },
  { value: "subscribed_at:desc", label: "Recently subscribed" },
  { value: "liked_videos:desc", label: "Most liked from them" },
] as const;

export default function SubscriptionsPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>(SORTS[0].value);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  const [sortCol, sortOrder] = sort.split(":");
  params.set("sort", sortCol);
  params.set("order", sortOrder);

  const subs = useQuery({
    queryKey: ["subscriptions", params.toString()],
    queryFn: () => api<{ items: SubscriptionChannel[] }>(`/subscriptions?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const items = subs.data?.items ?? [];

  return (
    <div className="animate-rise space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-signal">Channels</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
            {subs.isLoading ? "…" : `${items.length} you follow`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-paper-300/50" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search channels…"
              className="focus-ring w-48 rounded-lg border border-ink-600 bg-ink-900 py-2 pl-8 pr-3 text-sm placeholder:text-paper-300/40"
              type="search"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as (typeof SORTS)[number]["value"])}
            className="focus-ring rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-2 text-sm text-paper-200"
            aria-label="Sort channels"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {subs.isError ? (
        <ErrorState title="Couldn't load subscriptions" message={(subs.error as Error).message} onRetry={() => void subs.refetch()} />
      ) : subs.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={q ? `No channels match "${q}"` : "No subscriptions mirrored yet"}
          hint={q ? "Try a different spelling." : "Sync to pull the channels you follow."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((c) => (
            <div key={c.id} className="surface flex items-center gap-3.5 rounded-xl p-3.5">
              {c.thumbnail ? (
                <img src={c.thumbnail} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded-full bg-ink-700" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-xs muted">
                  {c.subscriber_count !== null ? `${fmtCount(c.subscriber_count)} subs` : "subscriber count unknown"}
                  {c.subscribed_at ? ` · since ${fmtDate(c.subscribed_at)}` : ""}
                </p>
              </div>
              {c.liked_videos > 0 && (
                <a
                  href={`/library?channel=${c.id}`}
                  className="focus-ring shrink-0 rounded-lg border border-signal/40 bg-signal-soft px-2.5 py-1 text-xs font-semibold text-signal"
                >
                  {c.liked_videos} liked
                </a>
              )}
              <a
                href={`https://www.youtube.com/channel/${c.id}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring shrink-0 rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-paper-200 hover:bg-ink-800"
              >
                Open
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
