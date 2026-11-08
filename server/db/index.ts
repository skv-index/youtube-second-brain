import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { StatementSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

/**
 * Thin adapter over node:sqlite exposing the better-sqlite3-style surface the
 * rest of the codebase uses (prepare().run/get/all, exec, pragma), with
 * prepared-statement caching for performance.
 */
export class YsbDatabase {
  private stmts = new Map<string, StatementSync>();

  constructor(private readonly inner: DatabaseSync) {}

  exec(sql: string): void {
    this.inner.exec(sql);
  }

  pragma(statement: string): void {
    this.inner.exec(`PRAGMA ${statement};`);
  }

  prepare(sql: string): StatementSync {
    let stmt = this.stmts.get(sql);
    if (!stmt) {
      stmt = this.inner.prepare(sql);
      this.stmts.set(sql, stmt);
    }
    return stmt;
  }
}

export type YsbStatement = StatementSync;
export type RunResult = { changes: number | bigint; lastInsertRowid: number | bigint };

let db: YsbDatabase | null = null;

export function getDb(): YsbDatabase {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const inner = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  const wrapped = new YsbDatabase(inner);
  wrapped.pragma("journal_mode = WAL");
  wrapped.pragma("foreign_keys = ON");
  migrate(wrapped);
  db = wrapped;
  return wrapped;
}

export function migrate(target: YsbDatabase): void {
  target.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      channel_id TEXT,
      title TEXT,
      thumbnail TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_at INTEGER NOT NULL,
      scope TEXT,
      needs_reauth INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      thumbnail TEXT,
      description TEXT DEFAULT '',
      subscriber_count INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
      subscribed_at INTEGER,
      position INTEGER DEFAULT 0,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      channel_id TEXT,
      channel_title TEXT,
      published_at INTEGER,
      thumbnail TEXT,
      duration_seconds INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      privacy_status TEXT,
      liked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
    CREATE INDEX IF NOT EXISTS idx_videos_liked_at ON videos(liked_at);
    CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at);

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      thumbnail TEXT,
      channel_id TEXT,
      item_count INTEGER DEFAULT 0,
      privacy TEXT,
      published_at INTEGER,
      is_liked_mirror INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      position INTEGER DEFAULT 0,
      added_at INTEGER,
      PRIMARY KEY (playlist_id, video_id)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_items_video ON playlist_items(video_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS video_tags (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (video_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_videos (
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      position INTEGER DEFAULT 0,
      PRIMARY KEY (collection_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      resource TEXT PRIMARY KEY,
      last_synced_at INTEGER,
      sync_token TEXT,
      items_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quota_usage (
      date TEXT PRIMARY KEY,
      units INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function closeDb(): void {
  // node:sqlite closes implicitly on GC; explicit close kept for shutdown hooks.
  db = null;
}
