import { Router, type Request, type Response } from "express";
import { getDb } from "../db/index.js";
import { requireSession } from "../auth/session.js";

const router = Router();
router.use(requireSession);

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

const DATASETS = new Set(["videos", "playlists", "subscriptions", "notes", "collections"]);

router.get("/", (req: Request, res: Response) => {
  const dataset = String(req.query.dataset ?? "videos");
  const format = String(req.query.format ?? "json");
  if (!DATASETS.has(dataset)) {
    res.status(400).json({ error: "BAD_DATASET", message: `dataset must be one of: ${[...DATASETS].join(", ")}` });
    return;
  }
  if (format !== "json" && format !== "csv") {
    res.status(400).json({ error: "BAD_FORMAT", message: "format must be json or csv" });
    return;
  }
  const db = getDb();
  let rows: Record<string, unknown>[];
  switch (dataset) {
    case "videos":
      rows = db
        .prepare(
          `SELECT id, title, channel_title, published_at, liked_at, duration_seconds, view_count, like_count
           FROM videos ORDER BY COALESCE(liked_at, published_at) DESC`
        )
        .all() as Record<string, unknown>[];
      break;
    case "playlists":
      rows = db.prepare(`SELECT p.id, p.title, p.item_count, p.privacy, p.published_at FROM playlists p WHERE p.is_liked_mirror = 0`).all() as Record<string, unknown>[];
      break;
    case "subscriptions":
      rows = db
        .prepare(
          `SELECT c.id, c.title, c.subscriber_count, s.subscribed_at FROM subscriptions s JOIN channels c ON c.id = s.channel_id ORDER BY c.title`
        )
        .all() as Record<string, unknown>[];
      break;
    case "notes":
      rows = db
        .prepare(
          `SELECT n.video_id, v.title, n.body, n.updated_at FROM notes n JOIN videos v ON v.id = n.video_id ORDER BY n.updated_at DESC`
        )
        .all() as Record<string, unknown>[];
      break;
    case "collections":
      rows = db
        .prepare(
          `SELECT c.id, c.name, c.description, c.created_at,
            (SELECT COUNT(*) FROM collection_videos cv WHERE cv.collection_id = c.id) AS video_count
           FROM collections c ORDER BY c.created_at DESC`
        )
        .all() as Record<string, unknown>[];
      break;
    default:
      rows = [];
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ysb-${dataset}-${stamp}.csv"`);
    res.send(toCsv(rows));
  } else {
    res.setHeader("Content-Disposition", `attachment; filename="ysb-${dataset}-${stamp}.json"`);
    res.json({ dataset, exportedAt: new Date().toISOString(), count: rows.length, rows });
  }
});

export default router;
