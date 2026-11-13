import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { YsbDatabase, migrate } from "../server/db/index.js";
import { parseIsoDuration, thumbnailUrl, parseYouTubeErrorBody } from "../server/services/youtube.js";

describe("database migration", () => {
  it("creates every table and upserts a video", () => {
    const db = new YsbDatabase(new DatabaseSync(":memory:"));
    migrate(db);

    db.prepare(
      `INSERT INTO videos (id, title, channel_title, published_at, thumbnail) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).run("abc123", "Test video", "Test Channel", 1700000000000, null);

    const row = db.prepare("SELECT id, title FROM videos WHERE id = ?").get("abc123") as
      | { id: string; title: string }
      | undefined;
    assert.equal(row?.title, "Test video");
  });

  it("enforces unique tag joins via composite key", () => {
    const db = new YsbDatabase(new DatabaseSync(":memory:"));
    migrate(db);

    db.prepare("INSERT INTO tags (name) VALUES (?)").run("deep work");
    const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get("deep work") as { id: number };

    db.prepare("INSERT INTO videos (id, title) VALUES (?, ?)").run("v1", "V1");
    db.prepare("INSERT INTO video_tags (video_id, tag_id) VALUES (?, ?)").run("v1", tag.id);
    db.prepare("INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)").run("v1", tag.id);

    const count = db.prepare("SELECT COUNT(*) AS n FROM video_tags WHERE video_id = ?").get("v1") as { n: number };
    assert.equal(count.n, 1);
  });
});

describe("YouTube helpers", () => {
  it("parses ISO-8601 durations", () => {
    assert.equal(parseIsoDuration("PT1M30S"), 90);
    assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
    assert.equal(parseIsoDuration("P1DT2H"), 93600);
    assert.equal(parseIsoDuration(undefined), 0);
    assert.equal(parseIsoDuration("garbage"), 0);
  });

  it("picks the highest usable thumbnail", () => {
    assert.equal(thumbnailUrl({ medium: { url: "m" }, high: { url: "h" } }), "m");
    assert.equal(thumbnailUrl({ default: { url: "d" } }), "d");
    assert.equal(thumbnailUrl(undefined), null);
    assert.equal(thumbnailUrl({}), null);
  });
});

describe("YouTube error classification", () => {
  it("extracts the reason from a Google API error body", () => {
    const body = JSON.stringify({
      error: {
        code: 404,
        message: "Channel not found.",
        errors: [{ message: "Channel not found.", domain: "youtube", reason: "channelNotFound" }],
      },
    });
    assert.equal(parseYouTubeErrorBody(body).reason, "channelNotFound");
    assert.equal(parseYouTubeErrorBody(body).message, "Channel not found.");
  });

  it("returns empty details for non-JSON error bodies", () => {
    assert.deepEqual(parseYouTubeErrorBody("<html>500</html>"), {});
    assert.deepEqual(parseYouTubeErrorBody(""), {});
  });
});
