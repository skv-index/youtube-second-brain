import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { requireSession } from "../auth/session.js";

const router = Router();
router.use(requireSession);

const videoIdSchema = z.string().min(1).max(64);

// ---- Tags ----

router.get("/tags", (_req: Request, res: Response) => {
  const rows = getDb()
    .prepare(
      `SELECT t.name, COUNT(vt.video_id) AS usage FROM tags t
       LEFT JOIN video_tags vt ON vt.tag_id = t.id
       GROUP BY t.id ORDER BY usage DESC, t.name ASC`
    )
    .all() as { name: string; usage: number }[];
  res.json({ tags: rows });
});

const setTagsSchema = z.object({ tags: z.array(z.string().trim().min(1).max(30)).max(15) });

router.put("/videos/:id/tags", (req: Request, res: Response) => {
  const id = videoIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "BAD_ID", message: "Invalid video id." });
    return;
  }
  const parsed = setTagsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "BAD_TAGS", message: "Tags must be 1-30 characters, up to 15 per video." });
    return;
  }
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM videos WHERE id = ?").get(id.data) as { 1?: number } | undefined;
  if (!exists) {
    res.status(404).json({ error: "NOT_FOUND", message: "Video not found in your library." });
    return;
  }
  const names = [...new Set(parsed.data.tags.map((t: string) => t.toLowerCase()))];
  db.prepare("DELETE FROM video_tags WHERE video_id = ?").run(id.data);
  for (const name of names) {
    db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(name);
    const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as { id: number };
    db.prepare("INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)").run(id.data, tag.id);
  }
  res.json({ ok: true, tags: names });
});

// ---- Note ----

const noteSchema = z.object({ body: z.string().max(20_000) });

router.get("/videos/:id/note", (req: Request, res: Response) => {
  const row = getDb()
    .prepare("SELECT body, updated_at FROM notes WHERE video_id = ?")
    .get(String(req.params.id)) as { body: string; updated_at: number } | undefined;
  res.json({ body: row?.body ?? "", updatedAt: row?.updated_at ?? null });
});

router.put("/videos/:id/note", (req: Request, res: Response) => {
  const id = videoIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "BAD_ID", message: "Invalid video id." });
    return;
  }
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "BAD_NOTE", message: "Note too long (20k characters max)." });
    return;
  }
  const db = getDb();
  const now = Date.now();
  if (parsed.data.body.trim() === "") {
    db.prepare("DELETE FROM notes WHERE video_id = ?").run(id.data);
    res.json({ ok: true, empty: true });
    return;
  }
  db.prepare(
    `INSERT INTO notes (video_id, body, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
  ).run(id.data, parsed.data.body, now);
  res.json({ ok: true, updatedAt: now });
});

// ---- Bookmark (local watch-later) ----

router.post("/videos/:id/bookmark", (req: Request, res: Response) => {
  const id = videoIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "BAD_ID", message: "Invalid video id." });
    return;
  }
  getDb()
    .prepare("INSERT OR IGNORE INTO bookmarks (video_id, created_at) VALUES (?, ?)")
    .run(id.data, Date.now());
  res.json({ ok: true, bookmarked: true });
});

router.delete("/videos/:id/bookmark", (req: Request, res: Response) => {
  const id = videoIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "BAD_ID", message: "Invalid video id." });
    return;
  }
  getDb().prepare("DELETE FROM bookmarks WHERE video_id = ?").run(id.data);
  res.json({ ok: true, bookmarked: false });
});

// ---- Collections ----

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).optional(),
});

router.get("/collections", (_req: Request, res: Response) => {
  const rows = getDb()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_videos cv WHERE cv.collection_id = c.id) AS video_count
       FROM collections c ORDER BY c.created_at DESC`
    )
    .all() as Record<string, unknown>[];
  res.json({ items: rows });
});

router.post("/collections", (req: Request, res: Response) => {
  const parsed = collectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "BAD_COLLECTION", message: "Collection needs a name (max 80 chars)." });
    return;
  }
  const result = getDb()
    .prepare("INSERT INTO collections (name, description, created_at) VALUES (?, ?, ?)")
    .run(parsed.data.name, parsed.data.description ?? "", Date.now());
  res.json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.put("/collections/:id", (req: Request, res: Response) => {
  const parsed = collectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "BAD_COLLECTION", message: "Collection needs a name (max 80 chars)." });
    return;
  }
  const info = getDb()
    .prepare("UPDATE collections SET name = ?, description = ? WHERE id = ?")
    .run(parsed.data.name, parsed.data.description ?? "", Number(req.params.id));
  if (info.changes === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Collection not found." });
    return;
  }
  res.json({ ok: true });
});

router.delete("/collections/:id", (req: Request, res: Response) => {
  getDb().prepare("DELETE FROM collections WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

router.get("/collections/:id/videos", (req: Request, res: Response) => {
  const rows = getDb()
    .prepare(
      `SELECT v.*, cv.position,
        EXISTS (SELECT 1 FROM bookmarks b WHERE b.video_id = v.id) AS bookmarked,
        (SELECT GROUP_CONCAT(t.name, ' ') FROM video_tags vt JOIN tags t ON t.id = vt.tag_id WHERE vt.video_id = v.id) AS tag_names
       FROM collection_videos cv JOIN videos v ON v.id = cv.video_id
       WHERE cv.collection_id = ? ORDER BY cv.position, COALESCE(v.liked_at, v.published_at) DESC`
    )
    .all(Number(req.params.id)) as Record<string, unknown>[];
  res.json({ items: rows });
});

router.post("/collections/:id/videos/:videoId", (req: Request, res: Response) => {
  const db = getDb();
  const collectionId = Number(req.params.id);
  const exists = db.prepare("SELECT 1 FROM collections WHERE id = ?").get(collectionId);
  if (!exists) {
    res.status(404).json({ error: "NOT_FOUND", message: "Collection not found." });
    return;
  }
  db.prepare(
    `INSERT OR IGNORE INTO collection_videos (collection_id, video_id, position) VALUES (?, ?, 0)`
  ).run(collectionId, String(req.params.videoId));
  res.json({ ok: true });
});

router.delete("/collections/:id/videos/:videoId", (req: Request, res: Response) => {
  getDb()
    .prepare("DELETE FROM collection_videos WHERE collection_id = ? AND video_id = ?")
    .run(Number(req.params.id), String(req.params.videoId));
  res.json({ ok: true });
});

export default router;
