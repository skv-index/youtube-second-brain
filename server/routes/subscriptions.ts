import { Router, type Request, type Response } from "express";
import { getDb } from "../db/index.js";
import { requireSession } from "../auth/session.js";

const router = Router();
router.use(requireSession);

router.get("/", (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
  const sort = String(req.query.sort ?? "subscriber_count");
  const dir = String(req.query.order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
  const allowed = new Set(["subscriber_count", "title", "subscribed_at"]);
  const sortCol = allowed.has(sort) ? sort : "subscriber_count";
  const like = `%${q}%`;
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.title, c.thumbnail, c.description, c.subscriber_count,
        s.subscribed_at,
        (SELECT COUNT(*) FROM videos v WHERE v.channel_id = c.id AND v.liked_at IS NOT NULL) AS liked_videos
       FROM subscriptions s JOIN channels c ON c.id = s.channel_id
       ${q ? "WHERE LOWER(c.title) LIKE ?" : ""}
       ORDER BY ${sortCol === "title" ? "LOWER(c.title)" : sortCol === "subscribed_at" ? "s.subscribed_at" : "c.subscriber_count"} ${dir}
       LIMIT 400`
    )
    .all(...(q ? [like] : [])) as Record<string, unknown>[];
  res.json({ items: rows });
});

export default router;
