import { getDb } from "../db/index.js";
import { quotaStatus } from "./youtube.js";

export type SyncResourceId = "channel" | "liked" | "playlists" | "subscriptions";

export interface SyncProgress {
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
}

interface PersistedSyncState {
  lastCompletedAt: number | null;
  lastError: string | null;
  lastMode: string | null;
}

const state: SyncProgress = {
  running: false,
  startedAt: null,
  finishedAt: null,
  mode: null,
  step: "",
  stepIndex: 0,
  stepCount: 0,
  error: null,
  errorKind: null,
  itemsSynced: 0,
};

const PERSISTED_KEY = "global";

export function getSyncStatus(): SyncProgress & { lastCompleted: PersistedSyncState; quota: { used: number; limit: number } } {
  const db = getDb();
  const row = db.prepare("SELECT sync_token AS value FROM sync_state WHERE resource = ?").get(`__persist_${PERSISTED_KEY}`) as { value: string | null } | undefined;
  let lastCompleted: PersistedSyncState = { lastCompletedAt: null, lastError: null, lastMode: null };
  if (row?.value) {
    try {
      lastCompleted = JSON.parse(row.value) as PersistedSyncState;
    } catch {
      // corrupted persisted state is ignored
    }
  }
  return {
    ...state,
    lastCompleted,
    quota: quotaStatus(),
  };
}

export function markSyncStarted(mode: "incremental" | "full"): void {
  state.running = true;
  state.startedAt = Date.now();
  state.mode = mode;
  state.error = null;
  state.errorKind = null;
  state.itemsSynced = 0;
  state.stepIndex = 0;
  state.stepCount = 4;
  state.step = "Starting";
}

export function markStep(step: string): void {
  state.step = step;
  state.stepIndex += 1;
}

export function addItems(n: number): void {
  state.itemsSynced += n;
}

export function markSyncFinished(error: { message: string; kind: string } | null): void {
  state.running = false;
  state.finishedAt = Date.now();
  state.step = error ? "Failed" : "Done";
  if (error) {
    state.error = error.message;
    state.errorKind = error.kind;
  }
  const db = getDb();
  const value = error
    ? JSON.stringify({ lastCompletedAt: null, lastError: error.message, lastMode: state.mode } satisfies PersistedSyncState)
    : JSON.stringify({ lastCompletedAt: Date.now(), lastError: null, lastMode: state.mode } satisfies PersistedSyncState);
  const key = `__persist_${PERSISTED_KEY}`;
  db.prepare(
    `INSERT INTO sync_state (resource, last_synced_at, sync_token, items_count) VALUES (?, ?, ?, 0)
     ON CONFLICT(resource) DO UPDATE SET last_synced_at = excluded.last_synced_at, sync_token = excluded.sync_token`
  ).run(key, Date.now(), value);
}

export function lastSyncedAt(resource: SyncResourceId): number | null {
  const row = getDb().prepare("SELECT last_synced_at FROM sync_state WHERE resource = ?").get(resource) as
    | { last_synced_at: number | null }
    | undefined;
  return row?.last_synced_at ?? null;
}

export function setSynced(resource: SyncResourceId, when: number, syncToken?: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO sync_state (resource, last_synced_at, sync_token, items_count) VALUES (?, ?, ?, 0)
     ON CONFLICT(resource) DO UPDATE SET last_synced_at = excluded.last_synced_at, sync_token = COALESCE(excluded.sync_token, sync_state.sync_token)`
  ).run(resource, when, syncToken ?? null);
}
