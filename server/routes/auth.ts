import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { buildAuthUrl, exchangeCodeForTokens, isOAuthConfigured, isConnected } from "../services/youtube.js";
import { saveTokens, needsReauth } from "../auth/tokens.js";
import { createSession, destroySession } from "../auth/session.js";
import { getSyncStatus } from "../services/syncState.js";
import { getDb } from "../db/index.js";
import { runSync } from "../services/sync.js";

const router = Router();

const SESSION_COOKIE = "ysb_session";

function sessionValid(req: Request): boolean {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  return Boolean(getDb().prepare("SELECT 1 FROM sessions WHERE token = ?").get(token));
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function profile(): { title: string | null; thumbnail: string | null; channelId: string | null } {
  const row = getDb().prepare("SELECT channel_id, title, thumbnail FROM user_profile WHERE id = 1").get() as
    | { channel_id: string; title: string; thumbnail: string }
    | undefined;
  return { channelId: row?.channel_id ?? null, title: row?.title ?? null, thumbnail: row?.thumbnail ?? null };
}

/**
 * Landing endpoint the client polls: tells the UI whether it should show the
 * connect gate, the dashboard, or a "reconnect" screen.
 */
router.get("/status", (req, res) => {
  const sync = getSyncStatus();
  res.json({
    oauthConfigured: isOAuthConfigured(),
    authenticated: sessionValid(req),
    connected: isConnected(),
    needsReauth: needsReauth(),
    profile: profile(),
    lastCompletedAt: sync.lastCompleted.lastCompletedAt,
    lastError: sync.lastCompleted.lastError,
    lastErrorKind: (sync as { lastErrorKind?: string }).lastErrorKind ?? null,
  });
});

// Kick off the OAuth flow. State doubles as CSRF protection (short-lived,
// stored in memory, single use, verified on callback).
const pendingStates = new Map<string, number>();

router.get("/google", (_req, res) => {
  if (!isOAuthConfigured()) {
    res.status(503).json({
      error: "CONFIG",
      message:
        "OAuth client is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the .env file and restart the server.",
    });
    return;
  }
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());
  for (const [key, created] of pendingStates) {
    if (Date.now() - created > 10 * 60 * 1000) pendingStates.delete(key);
  }
  res.redirect(buildAuthUrl(state));
});

router.get("/google/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const issuedAt = state ? pendingStates.get(state) : undefined;
  pendingStates.delete(state ?? "");

  if (!code || !issuedAt || Date.now() - issuedAt > 10 * 60 * 1000) {
    res.redirect("/?authError=invalid_state");
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    saveTokens(tokens);
    createSession(res);
    // Populate the mirror immediately; the UI watches sync progress live.
    void runSync("full");
    res.redirect("/?connected=1");
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    res.redirect(`/?authError=${encodeURIComponent(message.slice(0, 120))}`);
  }
});

router.post("/logout", (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

export default router;
