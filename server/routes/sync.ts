import { Router, type Request, type Response } from "express";
import { requireSession } from "../auth/session.js";
import { getSyncStatus } from "../services/syncState.js";
import { isSyncing, runSync } from "../services/sync.js";
import { quotaStatus } from "../services/youtube.js";

const router = Router();
router.use(requireSession);

router.get("/status", (_req: Request, res: Response) => {
  res.json({ ...getSyncStatus(), syncingNow: isSyncing(), quota: quotaStatus() });
});

router.post("/trigger", (req: Request, res: Response) => {
  const mode = req.body?.mode === "full" ? "full" : "incremental";
  if (isSyncing()) {
    res.json({ ok: true, alreadyRunning: true });
    return;
  }
  // Fire and forget; progress is polled via GET /api/sync/status.
  void runSync(mode);
  res.json({ ok: true, started: true, mode });
});

export default router;
