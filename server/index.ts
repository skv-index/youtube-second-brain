import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "./db/index.js";
import { createSession } from "./auth/session.js";
import { hasTokens } from "./auth/tokens.js";
import { isConnected, isOAuthConfigured } from "./services/youtube.js";
import { runSync, isSyncing } from "./services/sync.js";
import { getSyncStatus } from "./services/syncState.js";
import { quotaStatus } from "./services/youtube.js";
import authRouter from "./routes/auth.js";
import videosRouter from "./routes/videos.js";
import playlistsRouter from "./routes/playlists.js";
import subscriptionsRouter from "./routes/subscriptions.js";
import annotationsRouter from "./routes/annotations.js";
import syncRouter from "./routes/sync.js";
import exportRouter from "./routes/export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

// Load .env manually (no dotenv dependency).
loadEnv(path.join(__dirname, "..", ".env"));

function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, "..", ".env"));

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Light request log in dev.
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api")) console.log(`${req.method} ${req.path}`);
    next();
  });
}

// --- Unauthenticated system endpoints ---
app.get("/api/system/config", (_req, res) => {
  const sync = getSyncStatus();
  res.json({
    oauthConfigured: isOAuthConfigured(),
    connected: isConnected(),
    hasTokens: hasTokens(),
    lastCompletedAt: sync.lastCompleted.lastCompletedAt,
    lastError: sync.lastCompleted.lastError,
    lastErrorKind: sync.errorKind ?? null,
    quota: quotaStatus(),
  });
});

// Session bootstrap by shared token is not used; sessions are cookie-only.
app.post("/api/session", (_req, res) => {
  // Creating a session without OAuth is not allowed; this only echoes status.
  void createSession;
  res.status(400).json({ error: "UNSUPPORTED", message: "Use Sign in with Google to create a session." });
});

app.use("/api/auth", authRouter);
app.use("/api/videos", videosRouter);
app.use("/api/playlists", playlistsRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/annotations", annotationsRouter);
app.use("/api/sync", syncRouter);
app.use("/api/export", exportRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Unknown API endpoint." });
});

// Error handler: keep responses JSON, never leak stack traces.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: "INTERNAL", message: "Something went wrong on the server. Check the server console." });
  }
);

// Static SPA in production.
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  getDb();
  console.log(`YouTube Second Brain server listening on http://localhost:${PORT}`);
  if (!isSyncing() && isConnected()) {
    // Catch-up sync on server start so the mirror stays fresh across restarts.
    void runSync("incremental");
  }
  const everyFifteenMinutes = 15 * 60 * 1000;
  setInterval(() => {
    if (!isSyncing() && isConnected()) {
      void runSync("incremental");
    }
  }, everyFifteenMinutes);
});

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});
