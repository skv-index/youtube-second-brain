# YouTube Second Brain

A local-first web app that mirrors your **liked videos, playlists and subscriptions** from YouTube
into a private, searchable library you can **tag, annotate, bookmark and export**.
No mock data — everything is pulled live from the YouTube Data API v3 and stored in SQLite on your machine.

> Note: YouTube's API does not expose watch history or Watch Later. This app's tags, notes,
> bookmarks and collections are the local layer you get instead.

## Stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 18 + Vite 6 + TypeScript + Tailwind CSS (dark mode default)  |
| Backend    | Express 4 + TypeScript (`tsx`)                                     |
| Database   | SQLite via Node's built-in `node:sqlite` (WAL mode, zero native deps) |
| Auth       | Google OAuth 2.0 **Authorization Code flow**, tokens server-side only |
| Data fetch | `@tanstack/react-query` on the client, polling sync progress        |

## Architecture

```
server/                      Express API
  index.ts                   entrypoint: static SPA + API mount + auto-sync scheduler
  db/index.ts                SQLite schema (videos, channels, playlists, tags, notes,
                             bookmarks, collections, sync state, quota usage, tokens)
  db/quota.ts                daily YouTube quota accounting
  auth/session.ts            httpOnly cookie sessions
  auth/tokens.ts             OAuth token storage + refresh-token bookkeeping
  services/youtube.ts        YouTube Data API client: token refresh, quota guard,
                             typed errors (TOKEN / QUOTA / CONFIG / YOUTUBE)
  services/sync.ts           sync engine: channel + liked videos + playlists +
                             subscriptions, incremental cursors, enrichment batching
  services/syncState.ts      live progress + last-run persistence
  routes/                    auth, videos (search/filter/stats), playlists,
                             subscriptions, annotations (tags/notes/bookmarks/
                             collections), sync trigger/status, export (JSON/CSV)

src/                         React SPA (Vite)
  pages/                     Dashboard, Library, Playlists, Playlist detail, Channels,
                             Collections, Settings
  components/                Shell, video cards, detail modal (tags+note+collections),
                             connect gate, sync status UI
```

Security model: the browser never sees OAuth tokens — it only holds a session cookie.
Access + refresh tokens live in `server/data/app.db` alongside your data.
Scopes requested: `youtube.readonly` only; the app never writes to your YouTube account.

## Setup

1. **Google Cloud Console**
   - Enable **YouTube Data API v3** (APIs & Services → Library).
   - Create an **OAuth client ID** of type *Web application*.
   - Authorized JavaScript origins: `http://localhost:5173` and `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
2. **`.env`** at the project root (already scaffolded):

   ```
   YOUTUBE_API_KEY=...
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
3. **Run**

   ```
   npm install
   npm run dev      # Express on :3000 + Vite on :5173
   ```

   Open **http://localhost:5173**, press *Connect your YouTube account*, grant read access.
   The first full sync starts automatically; the UI shows live progress.
4. **Production build**: `npm run build && npm start` (SPA served from Express on :3000).

## Features

- **Dashboard** — totals, likes-per-month chart, most-liked channels, sync health + quota meter
- **Library** — full-text search (titles, channels, descriptions, notes, tags), filter chips
  (liked / saved / tagged / has-note), + tag & date filters, sort by recency/views/title/duration
- **Playlists** — every playlist mirrored; per-playlist view with completion indicators
- **Channels** — subscription list with subscriber counts and "how many you actually liked"
- **Collections** — local cross-playlist groups ("watch later" replacement), managed from
  the video panel or the collections page
- **Notes & tags** — a per-video note editor with autosave, free tags with autocomplete
  from your own tag vocabulary
- **Export** — JSON or CSV for videos, notes, collections, subscriptions, playlists
- **Automatic sync** — on server start, every 15 minutes while running, and manual
  "Sync now" / "Full re-scan" buttons; quota-aware with progress meter
- **Error states** — typed errors surfaced everywhere: unauthenticated, quota exceeded,
  revoked token ("reconnect"), network, empty results

## Scripts

| Command           | Purpose                     |
| ----------------- | --------------------------- |
| `npm run dev`     | API + SPA in watch mode     |
| `npm run build`   | production SPA build        |
| `npm start`       | serve built SPA from Express |
| `npm test`        | unit tests (node:test)      |
| `npm run typecheck` | strict TS, server + client |

## Data location

`server/data/app.db` — add it to nothing, share it with no one; it is your whole mirror
(gitignored by default). Delete it to reset; re-syncing rebuilds it.

## Troubleshooting

- *403 API not enabled* → enable YouTube Data API v3 for your project.
- *"Refresh token rejected"* → press Reconnect; Google revokes tokens when you change scopes/password.
- *Quota warnings* → the daily default is 10,000 units; first syncs consume the most. Syncs pause
  near the limit and resume the next day automatically.
