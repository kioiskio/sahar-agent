export function budgetLimit(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 400;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) return 400;
  return parsed;
}

export async function consumeAiBudget(db: D1Database, configured: string | undefined): Promise<boolean> {
  const limit = budgetLimit(configured);
  if (limit <= 0) return false;
  const windowStart = new Date().toISOString().slice(0, 10);
  const result = await db.prepare(`INSERT INTO ai_budget_windows (window_start, calls) VALUES (?, 1)
    ON CONFLICT(window_start) DO UPDATE SET calls = calls + 1
    WHERE ai_budget_windows.calls < ?`)
    .bind(windowStart, limit)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
