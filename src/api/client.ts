// Types mirrored from the server's JSON responses.

export interface AuthStatus {
  oauthConfigured: boolean;
  authenticated: boolean;
  connected: boolean;
  needsReauth: boolean;
  profile: { title: string | null; thumbnail: string | null; channelId: string | null } | null;
  lastCompletedAt: number | null;
  lastError: string | null;
  lastErrorKind: string | null;
}

export interface SyncStatus {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  mode: "incremental" | "full" | null;
  step: string;
  stepIndex: number;
  stepCount: number;
  error: string | null;
  errorKind: string | null;
  itemsSynced: number;
  lastCompleted: { lastCompletedAt: number | null; lastError: string | null; lastMode: string | null };
  syncingNow: boolean;
  quota: { used: number; limit: number };
}

export interface Video {
  id: string;
  title: string;
  description: string;
  channelId: string | null;
  channelTitle: string;
  publishedAt: number | null;
  thumbnail: string | null;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  likedAt: number | null;
  bookmarked: boolean;
  hasNote: boolean;
  tags: string[];
}

export interface VideoDetail extends Video {
  note: string;
  noteUpdatedAt: number | null;
  playlists: { id: string; title: string; added_at: number | null }[];
  bookmarked: boolean;
}

export interface VideoPage {
  items: Video[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  item_count: number;
  privacy: string;
  published_at: number | null;
  is_liked_mirror: number;
  enriched_count: number;
}

export interface SubscriptionChannel {
  id: string;
  title: string;
  thumbnail: string | null;
  description: string;
  subscriber_count: number | null;
  subscribed_at: number | null;
  liked_videos: number;
}

export interface StatsResponse {
  totals: {
    liked: number;
    videos: number;
    channels: number;
    playlists: number;
    playlistItems: number;
    subscriptions: number;
    bookmarks: number;
    notes: number;
    tags: number;
    collections: number;
    totalLikedSeconds: number;
    lastSyncedAt: number | null;
  };
  monthly: { month: string; n: number }[];
  topChannels: { channelId: string; title: string; videoCount: number; lastLikedAt: number; thumbnail: string | null }[];
}

export interface TagInfo {
  name: string;
  usage: number;
}

export interface CollectionSummary {
  id: number;
  name: string;
  description: string;
  created_at: number;
  video_count: number;
}

export interface ApiError extends Error {
  status: number;
  kind: string;
}

export class ApiRequestError extends Error implements ApiError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly kind: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiRequestError("Cannot reach the local server. Is it running?", 0, "NETWORK");
  }
  if (res.status === 401) {
    throw new ApiRequestError("Sign in with Google to continue.", 401, "UNAUTHENTICATED");
  }
  if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ApiRequestError(body.message ?? `Request failed (${res.status})`, res.status, body.error ?? "ERROR");
  }
  if (!res.ok) {
    throw new ApiRequestError(`Request failed (${res.status})`, res.status, "ERROR");
  }
  return (await res.json()) as T;
}
