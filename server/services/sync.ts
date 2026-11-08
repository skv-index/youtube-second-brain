import { getDb } from "../db/index.js";
import { youtubeGet, parseIsoDuration, thumbnailUrl, YouTubeApiError, isConnected, isOAuthConfigured, type YouTubeChannel, type YouTubePlaylist, type YouTubePlaylistItem, type YouTubeSubscription, type YouTubeVideo } from "./youtube.js";
import {
  markSyncStarted,
  markStep,
  markSyncFinished,
  addItems,
  setSynced,
} from "./syncState.js";

const LIKED_PLAYLIST_ID = "LL";
const PAGE_SIZE = 50;
const INCREMENTAL_PAGE_BUDGET = 6; // pages scanned per resource in incremental mode
const PLAYLIST_ITEMS_PAGE_BUDGET = 4; // pages per playlist in incremental mode

type ResourceId = "channel" | "liked" | "playlists" | "subscriptions";

interface SyncContext {
  mode: "incremental" | "full";
  stopped(): boolean;
}

function toMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

function now(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------
// Row writers
// ---------------------------------------------------------------------------

function upsertVideoFull(v: YouTubeVideo): void {
  getDb()
    .prepare(
      `INSERT INTO videos (id, title, description, channel_id, channel_title, published_at, thumbnail,
         duration_seconds, view_count, like_count, comment_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         channel_id = excluded.channel_id,
         channel_title = excluded.channel_title,
         published_at = excluded.published_at,
         thumbnail = excluded.thumbnail,
         duration_seconds = excluded.duration_seconds,
         view_count = excluded.view_count,
         like_count = excluded.like_count,
         comment_count = excluded.comment_count
       WHERE videos.view_count IS NULL OR videos.view_count < 1`
    )
    .run(
      v.id,
      v.snippet.title,
      v.snippet.description,
      v.snippet.channelId,
      v.snippet.channelTitle,
      toMs(v.snippet.publishedAt),
      thumbnailUrl(v.snippet.thumbnails),
      parseIsoDuration(v.contentDetails?.duration),
      Number(v.statistics?.viewCount ?? 0),
      Number(v.statistics?.likeCount ?? 0),
      Number(v.statistics?.commentCount ?? 0)
    );
}

function upsertVideoMinimal(item: YouTubePlaylistItem): string | null {
  const videoId = item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId;
  if (!videoId) return null;
  getDb()
    .prepare(
      `INSERT INTO videos (id, title, description, channel_id, channel_title, published_at, thumbnail)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    )
    .run(
      videoId,
      item.snippet.title,
      item.snippet.description,
      item.snippet.channelId,
      item.snippet.channelTitle,
      toMs(item.contentDetails.videoPublishedAt) ?? toMs(item.snippet.publishedAt),
      thumbnailUrl(item.snippet.thumbnails)
    );
  return videoId;
}

function markLiked(videoId: string, likedAt: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO videos (id, title, liked_at) VALUES ((SELECT id FROM videos WHERE id = ?), (SELECT title FROM videos WHERE id = ?), ?)
     ON CONFLICT(id) DO UPDATE SET liked_at = excluded.liked_at`
  ).run(videoId, videoId, likedAt);
}

function linkPlaylistItem(playlistId: string, videoId: string, addedAt: number): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, position, added_at) VALUES (?, ?, 0, ?)`
    )
    .run(playlistId, videoId, addedAt);
  void 0;
}

/** Enrich a batch of video ids with statistics + duration via videos.list. */
async function enrichVideos(ids: string[], ctx: SyncContext): Promise<void> {
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    if (ctx.stopped()) return;
    const batch = ids.slice(i, i + PAGE_SIZE).join(",");
    const data = await youtubeGet<{ items: YouTubeVideo[] }>(
      "videos",
      { part: "snippet,contentDetails,statistics", id: batch, maxResults: PAGE_SIZE },
      1
    );
    for (const v of data.items ?? []) {
      upsertVideoFull(v);
      addItems(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Resource syncs
// ---------------------------------------------------------------------------

async function syncChannel(ctx: SyncContext): Promise<void> {
  if (ctx.stopped()) return;
  markStep("Channel profile");
  const data = await youtubeGet<{ items: YouTubeChannel[] }>(
    "channels",
    { part: "snippet,statistics", mine: "true" },
    1
  );
  const me = data.items?.[0];
  if (!me) return;
  getDb()
    .prepare(
      `INSERT INTO user_profile (id, channel_id, title, thumbnail, updated_at) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET channel_id = excluded.channel_id, title = excluded.title,
         thumbnail = excluded.thumbnail, updated_at = excluded.updated_at`
    )
    .run(me.id, me.snippet.title, thumbnailUrl(me.snippet.thumbnails), now());
}

async function syncLikedVideos(ctx: SyncContext): Promise<void> {
  if (ctx.stopped()) return;
  markStep("Liked videos");
  const db = getDb();

  // Maintain "LL" as a mirrored pseudo-playlist so the library can treat
  // likes as just another playlist.
  db.prepare(
    `INSERT INTO playlists (id, title, description, item_count, privacy, is_liked_mirror)
     VALUES (?, 'Liked videos', '', 0, 'private', 1)
     ON CONFLICT(id) DO UPDATE SET is_liked_mirror = 1`
  ).run(LIKED_PLAYLIST_ID);

  const incrementalUntil = ctx.mode === "incremental" ? lastCursor("liked") : null;
  const pageBudget = ctx.mode === "incremental" ? INCREMENTAL_PAGE_BUDGET : 200;

  const processed: { id: string; likedAt: number }[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  let oldestSeenAt = Number.POSITIVE_INFINITY;

  while (!ctx.stopped() && pages < pageBudget) {
    const data: {
      items: YouTubePlaylistItem[];
      nextPageToken?: string;
    } = await youtubeGet(
      "playlistItems",
      { part: "snippet,contentDetails", playlistId: LIKED_PLAYLIST_ID, maxResults: PAGE_SIZE, pageToken },
      1
    );
    pages += 1;
    const items = data.items ?? [];
    for (const item of items) {
      const videoId = upsertVideoMinimal(item);
      if (!videoId) continue;
      const likedAt = toMs(item.snippet.publishedAt) ?? now();
      markLiked(videoId, likedAt);
      linkPlaylistItem(LIKED_PLAYLIST_ID, videoId, likedAt);
      processed.push({ id: videoId, likedAt });
      oldestSeenAt = Math.min(oldestSeenAt, likedAt);
      addItems(1);
    }

    // Incremental short-circuit: page entirely older than what we've seen.
    if (incrementalUntil !== null && allOlderThan(items, incrementalUntil)) break;

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  if (!ctx.stopped() && processed.length) {
    await enrichVideos(processed.map((p) => p.id), ctx);
    if (oldestSeenAt !== Number.POSITIVE_INFINITY && ctx.mode === "incremental") {
      setCursor("liked", Math.max(oldestSeenAt, incrementalUntil ?? 0));
    } else if (ctx.mode === "full") {
      setCursor("liked", now());
    }
  }
  if (!ctx.stopped()) setSynced("liked", now());
}

function allOlderThan(items: YouTubePlaylistItem[], until: number): boolean {
  return items.every((item) => {
    const at = toMs(item.snippet.publishedAt);
    return at !== null && at <= until;
  });
}

function lastCursor(resource: ResourceId): number | null {
  const row = getDb().prepare("SELECT sync_token FROM sync_state WHERE resource = ?").get(resource) as
    | { sync_token: string | null }
    | undefined;
  if (!row?.sync_token) return null;
  const value = Number(row.sync_token);
  return Number.isNaN(value) ? null : value;
}

function setCursor(resource: ResourceId, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO sync_state (resource, last_synced_at, sync_token, items_count) VALUES (?, ?, ?, 0)
       ON CONFLICT(resource) DO UPDATE SET sync_token = excluded.sync_token, last_synced_at = excluded.last_synced_at`
    )
    .run(resource, now(), String(at));
}

async function syncUserPlaylists(ctx: SyncContext): Promise<void> {
  if (ctx.stopped()) return;
  markStep("Playlists");
  const db = getDb();

  const playlists: YouTubePlaylist[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  const pageBudget = ctx.mode === "incremental" ? 2 : 20;

  while (!ctx.stopped() && pages < pageBudget) {
    const data = await youtubeGet<{ items: YouTubePlaylist[]; nextPageToken?: string }>(
      "playlists",
      { part: "snippet,contentDetails,status", mine: "true", maxResults: PAGE_SIZE, pageToken },
      1
    );
    pages += 1;
    playlists.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  for (const pl of playlists) {
    db.prepare(
      `INSERT INTO playlists (id, title, description, thumbnail, channel_id, item_count, privacy, published_at, is_liked_mirror)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         thumbnail = excluded.thumbnail,
         channel_id = excluded.channel_id,
         item_count = excluded.item_count,
         privacy = excluded.privacy,
         published_at = excluded.published_at`
    ).run(
      pl.id,
      pl.snippet.title,
      pl.snippet.description,
      thumbnailUrl(pl.snippet.thumbnails),
      pl.snippet.channelId,
      pl.contentDetails.itemCount,
      pl.status.privacyStatus,
      toMs(pl.snippet.publishedAt)
    );
    addItems(1);
  }

  // In incremental mode, skip playlists that are already fully in the mirror
  // (known items >= reported item_count looks complete).
  const targets = ctx.mode === "incremental" ? playlists.filter((pl) => knownItemCount(pl.id) < pl.contentDetails.itemCount) : playlists;

  for (const pl of targets) {
    if (ctx.stopped()) return;
    markStep(`Playlist "${pl.snippet.title.slice(0, 32)}"`);
    await syncPlaylistItems(pl.id, ctx);
  }
}

function knownItemCount(playlistId: string): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM playlist_items WHERE playlist_id = ?").get(playlistId) as { n: number };
  return row.n;
}

async function syncPlaylistItems(playlistId: string, ctx: SyncContext): Promise<void> {
  const db = getDb();
  const pageBudget = ctx.mode === "incremental" ? PLAYLIST_ITEMS_PAGE_BUDGET : 40;
  let pageToken: string | undefined;
  let pages = 0;
  const candidateIds: string[] = [];

  while (pages < pageBudget && !ctx.stopped()) {
    const data = await youtubeGet<{ items: YouTubePlaylistItem[]; nextPageToken?: string }>(
      "playlistItems",
      { part: "snippet,contentDetails", playlistId, maxResults: PAGE_SIZE, pageToken },
      1
    );
    pages += 1;
    for (const item of data.items ?? []) {
      const videoId = upsertVideoMinimal(item);
      if (!videoId) continue;
      linkPlaylistItem(playlistId, videoId, toMs(item.snippet.publishedAt) ?? now());
      // Only enrich videos that have not been enriched before (no view stats).
      const enriched = db.prepare("SELECT 1 FROM videos WHERE id = ? AND view_count IS NOT NULL AND view_count > 0").get(videoId);
      if (!enriched) candidateIds.push(videoId);
      addItems(1);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  if (!ctx.stopped() && playlistId !== LIKED_PLAYLIST_ID && candidateIds.length) {
    await enrichVideos(candidateIds.slice(0, PAGE_SIZE * 2), ctx);
  }

  db.prepare(
    `UPDATE playlists SET item_count = (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = ?) WHERE id = ?`
  ).run(playlistId, playlistId);
}

async function syncSubscriptions(ctx: SyncContext): Promise<void> {
  if (ctx.stopped()) return;
  markStep("Subscriptions");
  const db = getDb();

  const subs: YouTubeSubscription[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  const pageBudget = ctx.mode === "incremental" ? 3 : 40;

  while (!ctx.stopped() && pages < pageBudget) {
    const data = await youtubeGet<{ items: YouTubeSubscription[]; nextPageToken?: string }>(
      "subscriptions",
      { part: "snippet", mine: "true", maxResults: PAGE_SIZE, order: "unread", pageToken },
      1
    );
    pages += 1;
    subs.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  for (const [position, sub] of subs.entries()) {
    const channelId = sub.snippet.resourceId?.channelId;
    if (!channelId) continue;
    db.prepare(
      `INSERT INTO channels (id, title, thumbnail, description, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, thumbnail = excluded.thumbnail,
         description = excluded.description, updated_at = excluded.updated_at`
    ).run(channelId, sub.snippet.title, thumbnailUrl(sub.snippet.thumbnails), sub.snippet.description, now());
    db.prepare(
      `INSERT INTO subscriptions (channel_id, subscribed_at, position, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET updated_at = excluded.updated_at`
    ).run(channelId, toMs(sub.snippet.publishedAt), position, now());
    addItems(1);
  }

  // Subscriber counts, batched.
  const ids: string[] = subs.map((s) => s.snippet.resourceId?.channelId).filter((id): id is string => Boolean(id));
  for (let i = 0; i < ids.length && !ctx.stopped(); i += PAGE_SIZE) {
    const batch = ids.slice(i, i + PAGE_SIZE).join(",");
    const data = await youtubeGet<{ items: YouTubeChannel[] }>(
      "channels",
      { part: "statistics", id: batch, maxResults: PAGE_SIZE },
      1
    );
    for (const ch of data.items ?? []) {
      db.prepare("UPDATE channels SET subscriber_count = ? WHERE id = ?").run(
        ch.statistics?.subscriberCount ? Number(ch.statistics.subscriberCount) : null,
        ch.id
      );
    }
  }

  if (!ctx.stopped()) setSynced("subscriptions", now());
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

export async function runSync(mode: "incremental" | "full"): Promise<void> {
  if (syncing) return;
  if (!isOAuthConfigured()) {
    markSyncStarted(mode);
    markSyncFinished({ message: "Google OAuth client is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.", kind: "CONFIG" });
    return;
  }
  if (!isConnected()) {
    markSyncStarted(mode);
    markSyncFinished({ message: "No connected Google account. Sign in first.", kind: "TOKEN" });
    return;
  }
  syncing = true;
  markSyncStarted(mode);
  try {
    const ctx: SyncContext = { mode, stopped: () => !syncing };
    await syncChannel(ctx);
    await syncLikedVideos(ctx);
    await syncUserPlaylists(ctx);
    await syncSubscriptions(ctx);
    markSyncFinished(null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind =
      err instanceof YouTubeApiError
        ? err.kind
        : err instanceof Error && err.name === "TokenError"
          ? "TOKEN"
          : "UNKNOWN";
    markSyncFinished({ message, kind });
  } finally {
    syncing = false;
  }
}
