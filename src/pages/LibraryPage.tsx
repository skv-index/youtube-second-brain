import { useMemo, useState, useEffect } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { api, type TagInfo, type Video, type VideoPage } from "@/api/client";
import { VideoCard } from "@/components/VideoCard";
import { VideoDetailModal } from "@/components/VideoDetailModal";
import { EmptyState, ErrorState, Skeleton, cn, fmtCount } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";

interface Filters {
  q: string;
  tag: string;
  channel: string;
  bookmarked: boolean;
  liked: boolean;
  tagged: boolean;
  hasNote: boolean;
  sort: string;
  order: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  q: "",
  tag: "",
  channel: "",
  bookmarked: false,
  liked: false,
  tagged: false,
  hasNote: false,
  sort: "liked",
  order: "desc",
  from: "",
  to: "",
};

export default function LibraryPage() {
  const auth = useAuth();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [active, setActive] = useState<Video | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Read query params on mount (?channel= from dashboard links).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channel = params.get("channel");
    const q = params.get("q");
    if (channel || q) {
      setFilters((f) => ({ ...f, channel: channel ?? f.channel, q: q ?? f.q }));
      setPage(1);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.bookmarked) params.set("bookmarked", "1");
    if (filters.liked) params.set("liked", "1");
    if (filters.tagged) params.set("tagged", "1");
    if (filters.hasNote) params.set("hasNote", "1");
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.order === "asc") params.set("order", "asc");
    if (filters.sort !== "liked") params.set("sort", filters.sort);
    params.set("page", String(page));
    params.set("pageSize", "24");
    return params.toString();
  }, [filters, debouncedQ, page]);

  const videos = useQuery({
    queryKey: ["videos", query],
    queryFn: () => api<VideoPage>(`/videos?${query}`),
    enabled: auth?.connected === true,
    placeholderData: keepPreviousData,
  });

  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: () => api<{ tags: TagInfo[] }>("/annotations/tags"),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const total = videos.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (videos.data?.pageSize ?? 24)));
  const isFiltered = filters.q || filters.tag || filters.channel || filters.bookmarked || filters.tagged || filters.hasNote || filters.liked;

  return (
    <div className="animate-rise space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-signal">Library</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
            {videos.isLoading ? "Searching…" : `${fmtCount(total)} videos`}
            <span className="ml-2 text-sm font-normal muted">{isFiltered ? "matching filters" : "in your mirror"}</span>
          </h1>
        </div>
        <SearchBar value={filters.q} onChange={(v) => setFilter("q", v)} />
      </header>

      <Toolbar
        show={showFilters}
        onToggle={() => setShowFilters((s) => !s)}
        filters={filters}
        setFilter={setFilter}
        tags={tags.data?.tags ?? []}
      />

      {videos.isError ? (
        <ErrorState
          title="Couldn't load your library"
          message={(videos.error as Error).message}
          onRetry={() => void videos.refetch()}
        />
      ) : videos.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-ink-700/60">
              <Skeleton className="aspect-video rounded-b-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search size={28} />}
          title={isFiltered ? "Nothing matches these filters" : "Your mirror is empty"}
          hint={
            isFiltered
              ? "Try clearing a filter — your data is there, it's just hiding."
              : "Run a sync from the sidebar once your account is connected, and your liked videos will appear here."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {videos.data!.items.map((v) => (
              <VideoCard key={v.id} video={v} onOpen={setActive} />
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {active && <VideoDetailModal video={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block w-full max-w-sm">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-300/50" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search titles, channels, notes, tags…"
        className="focus-ring w-full rounded-lg border border-ink-600 bg-ink-900 py-2.5 pl-9 pr-3 text-sm placeholder:text-paper-300/40"
        type="search"
      />
    </label>
  );
}

function Toolbar({
  show,
  onToggle,
  filters,
  setFilter,
  tags,
}: {
  show: boolean;
  onToggle: () => void;
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  tags: TagInfo[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={show}
          className={cn(
            "focus-ring flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
            show ? "border-signal/50 bg-signal-soft text-signal" : "border-ink-600 text-paper-200 hover:bg-ink-800"
          )}
        >
          <SlidersHorizontal size={13} /> Filters
        </button>
        <ToggleChip active={filters.liked} label="Liked" onClick={() => setFilter("liked", !filters.liked)} />
        <ToggleChip active={filters.bookmarked} label="Saved" onClick={() => setFilter("bookmarked", !filters.bookmarked)} />
        <ToggleChip active={filters.tagged} label="Tagged" onClick={() => setFilter("tagged", !filters.tagged)} />
        <ToggleChip active={filters.hasNote} label="Has note" onClick={() => setFilter("hasNote", !filters.hasNote)} />
        <select
          value={`${filters.sort}:${filters.order}`}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(":");
            setFilter("sort", sort);
            setFilter("order", order);
          }}
          className="focus-ring rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-xs text-paper-200"
          aria-label="Sort videos"
        >
          <option value="liked:desc">Recently liked</option>
          <option value="liked:asc">Oldest likes</option>
          <option value="published:desc">Newest published</option>
          <option value="views:desc">Most viewed</option>
          <option value="title:asc">Title A–Z</option>
          <option value="duration:desc">Longest</option>
        </select>
        {(filters.tag || filters.channel) && (
          <button
            type="button"
            onClick={() => {
              setFilter("tag", "");
              setFilter("channel", "");
            }}
            className="focus-ring rounded-lg px-2.5 py-1.5 text-xs text-signal hover:bg-signal-soft"
          >
            Clear tag/channel
          </button>
        )}
      </div>

      {show && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs muted">Liked between</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
              className="focus-ring rounded-md border border-ink-600 bg-ink-950 px-2 py-1 text-xs"
            />
            <span className="text-xs muted">and</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
              className="focus-ring rounded-md border border-ink-600 bg-ink-950 px-2 py-1 text-xs"
            />
          </label>
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setFilter("tag", filters.tag === t.name ? "" : t.name)}
                  className={cn(
                    "focus-ring rounded-full border px-2.5 py-1 text-xs",
                    filters.tag === t.name
                      ? "border-signal/50 bg-signal-soft text-signal"
                      : "border-ink-600 text-paper-200 hover:bg-ink-800"
                  )}
                >
                  #{t.name} <span className="muted">{t.usage}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-signal/50 bg-signal-soft text-signal" : "border-ink-600 text-paper-200 hover:bg-ink-800"
      )}
    >
      {label}
    </button>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="focus-ring rounded-lg border border-ink-600 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        ← Prev
      </button>
      <span className="px-2 text-sm tabular-nums muted">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="focus-ring rounded-lg border border-ink-600 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        Next →
      </button>
    </nav>
  );
}
