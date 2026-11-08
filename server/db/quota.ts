import { getDb } from "../db/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

interface QuotaRow {
  date: string;
  units: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getQuotaUsedToday(): number {
  const row = getDb()
    .prepare("SELECT units FROM quota_usage WHERE date = ?")
    .get(todayKey()) as QuotaRow | undefined;
  return row?.units ?? 0;
}

export function addQuotaUnits(units: number): void {
  getDb()
    .prepare(
      `INSERT INTO quota_usage (date, units) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET units = units + excluded.units`
    )
    .run(todayKey(), units);
}

export function resetQuotaIfNewDay(): void {
  getDb().prepare("DELETE FROM quota_usage WHERE date != ?").run(todayKey());
}

export function quotaWindowResetsInMs(): number {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), DAY_MS / 64);
}
