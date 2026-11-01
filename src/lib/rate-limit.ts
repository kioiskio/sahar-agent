export async function consumeRateLimit(db: D1Database, bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs).toISOString();
  const nowIso = now.toISOString();
  const result = await db.prepare(`INSERT INTO rate_buckets (bucket, hits, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET
      hits = CASE WHEN rate_buckets.reset_at <= ? THEN 1 ELSE rate_buckets.hits + 1 END,
      reset_at = CASE WHEN rate_buckets.reset_at <= ? THEN ? ELSE rate_buckets.reset_at END
    WHERE rate_buckets.reset_at <= ? OR rate_buckets.hits < ?`)
    .bind(bucket, resetAt, nowIso, nowIso, resetAt, nowIso, limit)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
