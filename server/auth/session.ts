import type { Request } from "express";
import { randomBytes } from "node:crypto";
import type { NextFunction, Response } from "express";
import { getDb } from "../db/index.js";

const SESSION_COOKIE = "ysb_session";

export function parseCookies(req: Request): Record<string, string> {
  return parseCookieHeader(req.headers.cookie);
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

function sessionToken(req: Request): string | null {
  return parseCookieHeader(req.headers.cookie)[SESSION_COOKIE] ?? null;
}

const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(res: Response): string {
  const token = randomBytes(32).toString("hex");
  getDb()
    .prepare("INSERT INTO sessions (token, created_at) VALUES (?, ?)")
    .run(token, Date.now());
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_SESSION_AGE_MS / 1000}`
  );
  return token;
}

export function destroySession(req: Request, res: Response): void {
  const token = sessionToken(req);
  if (token) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const token = sessionToken(req);
  if (!token) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Sign in with Google to continue." });
    return;
  }
  const row = getDb().prepare("SELECT created_at FROM sessions WHERE token = ?").get(token) as
    | { created_at: number }
    | undefined;
  if (!row || Date.now() - row.created_at > MAX_SESSION_AGE_MS) {
    if (row) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Sign in with Google to continue." });
    return;
  }
  next();
}
