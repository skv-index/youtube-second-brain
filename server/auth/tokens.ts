import { getDb } from "../db/index.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiryAt: number;
  scope: string | null;
  needsReauth: boolean;
}

export function getTokens(): StoredTokens | null {
  const row = getDb()
    .prepare("SELECT access_token, refresh_token, expiry_at, scope, needs_reauth FROM oauth_tokens WHERE id = 1")
    .get() as
    | { access_token: string; refresh_token: string | null; expiry_at: number; scope: string | null; needs_reauth: number }
    | undefined;
  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiryAt: row.expiry_at,
    scope: row.scope,
    needsReauth: row.needs_reauth === 1,
  };
}

export function hasTokens(): boolean {
  return getTokens() !== null;
}

export function needsReauth(): boolean {
  const row = getDb().prepare("SELECT needs_reauth FROM oauth_tokens WHERE id = 1").get() as
    | { needs_reauth: number }
    | undefined;
  return row?.needs_reauth === 1;
}

export function setNeedsReauth(value: boolean): void {
  getDb().prepare("UPDATE oauth_tokens SET needs_reauth = ? WHERE id = 1").run(value ? 1 : 0);
}

export function saveTokens(tokens: {
  accessToken: string | null | undefined;
  refreshToken: string | null | undefined;
  expiresIn: number | null | undefined;
  scope: string | null | undefined;
}): void {
  const db = getDb();
  const existing = getTokens();
  // Google only returns refresh_token on first consent; keep the old one otherwise.
  const refreshToken = tokens.refreshToken ?? existing?.refreshToken ?? null;
  const expiryAt = Date.now() + (tokens.expiresIn ?? 3600) * 1000;
  db.prepare(
    `INSERT INTO oauth_tokens (id, access_token, refresh_token, expiry_at, scope, needs_reauth)
     VALUES (1, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
       expiry_at = excluded.expiry_at,
       scope = excluded.scope,
       needs_reauth = 0`
  ).run(tokens.accessToken ?? existing?.accessToken ?? "", refreshToken, expiryAt, tokens.scope ?? existing?.scope ?? null, refreshToken);
}
