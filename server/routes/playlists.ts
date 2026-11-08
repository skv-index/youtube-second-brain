import { Router, type Request, type Response } from "express";
import { getDb } from "../db/index.js";
import { requireSession } from "../auth/session.js";

const router = Router();
router.use(requireSession);

router.get("/", (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
  const db = getDb();
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.description, p.thumbnail, p.item_count, p.privacy, p.published_at, p.is_liked_mirror,
        (SELECT COUNT(*) FROM playlist_items pi JOIN videos v ON v.id = pi.video_id
          WHERE pi.playlist_id = p.id AND v.view_count > 0) AS enriched_count
       FROM playlists p
       ${q ? "WHERE LOWER(p.title) LIKE ?" : ""}
       ORDER BY p.is_liked_mirror DESC, p.published_at DESC`
    )
    .all(...(q ? [like] : [])) as Record<string, unknown>[];
  res.json({ items: rows });
});

router.get("/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const db = getDb();
  const playlist = db
    .prepare("SELECT id, title, description, thumbnail, item_count, privacy, published_at, is_liked_mirror FROM playlists WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!playlist) {
    res.status(404).json({ error: "NOT_FOUND", message: "Playlist not found in your library. Sync to fetch your latest playlists." });
    return;
  }
  const items = db
    .prepare(
      `SELECT v.id, v.title, v.channel_title, v.thumbnail, v.duration_seconds, v.published_at, v.view_count,
        pi.added_at, vi.position,
        EXISTS (SELECT 1 FROM bookmarks b WHERE b.video_id = v.id) AS bookmarked,
        (SELECT GROUP_CONCAT(t.name, ' ') FROM video_tags vt JOIN tags t ON t.id = vt.tag_id WHERE vt.video_id = v.id) AS tag_names
       FROM playlist_items pi
       JOIN videos v ON v.id = pi.video_id
       JOIN playlists vi ON vi.id = pi.playlist_id
       WHERE pi.playlist_id = ?
       ORDER BY COALESCE(pi.added_at, 0) DESC`
    )
    .all(id) as Record<string, unknown>[];
  res.json({ playlist, items });
});

export default router;
