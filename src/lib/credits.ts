import { HTTPException } from 'hono/http-exception';
import { id, now } from '../db/repository';

const RESERVATION_MS = 120_000;
const GRANT_LIMIT = 500;
const BALANCE_LIMIT = 1_000_000;

export type ReserveResult =
  | { kind: 'replay'; snapshot: unknown }
  | { kind: 'inflight' }
  | { kind: 'exhausted' }
  | { kind: 'busy' }
  | { kind: 'reserved' };

type ReservationRow = { status: string; expires_at: string; updated_at: string };
type RequestRow = { status: string; snapshot_json: string | null; conversation_id: string | null; request_hash: string | null };

async function readReservation(db: D1Database, userId: string, requestId: string): Promise<{ reservation: ReservationRow | null; request: RequestRow | null; balance: number; reserved: number }> {
  const [reservation, request, account] = await Promise.all([
    db.prepare('SELECT status, expires_at, updated_at FROM credit_reservations WHERE user_id = ? AND request_id = ?').bind(userId, requestId).first<ReservationRow>(),
    db.prepare('SELECT status, snapshot_json, conversation_id, request_hash FROM ai_requests WHERE user_id = ? AND request_id = ?').bind(userId, requestId).first<RequestRow>(),
    db.prepare('SELECT balance, reserved FROM credit_accounts WHERE user_id = ?').bind(userId).first<{ balance: number; reserved: number }>()
  ]);
  return { reservation: reservation ?? null, request: request ?? null, balance: account?.balance ?? 0, reserved: account?.reserved ?? 0 };
}

export async function recoverCreditReservations(db: D1Database, userId?: string): Promise<void> {
  const timestamp = now();
  const marker = crypto.randomUUID();
  const userClause = userId ? ' AND user_id = ?' : '';
  const release = db.prepare(`UPDATE credit_reservations SET status = 'released', operation_id = ?, updated_at = ?
    WHERE status = 'reserved' AND expires_at < ?${userClause}
      AND NOT EXISTS (
        SELECT 1 FROM ai_requests
        WHERE ai_requests.user_id = credit_reservations.user_id
          AND ai_requests.request_id = credit_reservations.request_id
          AND ai_requests.status = 'succeeded'
      )`).bind(...(userId ? [marker, timestamp, timestamp, userId] : [marker, timestamp, timestamp]));
  const refund = db.prepare(`UPDATE credit_accounts SET
      balance = balance + (SELECT COUNT(*) FROM credit_reservations WHERE user_id = credit_accounts.user_id AND status = 'released' AND operation_id = ?),
      reserved = MAX(0, reserved - (SELECT COUNT(*) FROM credit_reservations WHERE user_id = credit_accounts.user_id AND status = 'released' AND operation_id = ?)),
      updated_at = ?
    WHERE EXISTS (SELECT 1 FROM credit_reservations WHERE user_id = credit_accounts.user_id AND status = 'released' AND operation_id = ?)${userId ? ' AND user_id = ?' : ''}`)
    .bind(...(userId ? [marker, marker, timestamp, marker, userId] : [marker, marker, timestamp, marker]));
  const settleMarker = crypto.randomUUID();
  const settleRows = db.prepare(`UPDATE credit_reservations SET status = 'settled', operation_id = ?, updated_at = ?
    WHERE status = 'reserved'${userClause}
      AND EXISTS (
        SELECT 1 FROM ai_requests
        WHERE ai_requests.user_id = credit_reservations.user_id
          AND ai_requests.request_id = credit_reservations.request_id
          AND ai_requests.status = 'succeeded'
      )`).bind(...(userId ? [settleMarker, timestamp, userId] : [settleMarker, timestamp]));
  const settleAccounts = db.prepare(`UPDATE credit_accounts SET
      reserved = MAX(0, reserved - (SELECT COUNT(*) FROM credit_reservations WHERE user_id = credit_accounts.user_id AND status = 'settled' AND operation_id = ?)),
      lifetime_spent = lifetime_spent + (SELECT COUNT(*) FROM credit_reservations WHERE user_id = credit_accounts.user_id AND status = 'settled' AND operation_id = ?),
      updated_at = ?
    WHERE EXISTS (SELECT 1 FROM credit_reservations WHERE user_id = credit_accounts.user_id AND status = 'settled' AND operation_id = ?)${userId ? ' AND user_id = ?' : ''}`)
    .bind(...(userId ? [settleMarker, settleMarker, timestamp, settleMarker, userId] : [settleMarker, settleMarker, timestamp, settleMarker]));
  await db.batch([release, refund, settleRows, settleAccounts]);
  await db.prepare(`UPDATE ai_requests SET status = 'failed', error_kind = 'expired', updated_at = ?
    WHERE status = 'reserved' AND EXISTS (
      SELECT 1 FROM credit_reservations
      WHERE credit_reservations.user_id = ai_requests.user_id
        AND credit_reservations.request_id = ai_requests.request_id
        AND credit_reservations.status = 'released'
        AND credit_reservations.operation_id = ?
    )`).bind(timestamp, marker).run();
}

export async function reserveCredit(db: D1Database, userId: string, requestId: string, conversationId: string, requestHash: string): Promise<ReserveResult> {
  await recoverCreditReservations(db, userId);
  const current = await readReservation(db, userId, requestId);
  if (current.request && (current.request.conversation_id !== conversationId || current.request.request_hash !== requestHash)) {
    throw new HTTPException(409, { message: 'This request ID was already used for a different message' });
  }
  if (current.request?.status === 'succeeded' && current.request.snapshot_json) {
    try {
      return { kind: 'replay', snapshot: JSON.parse(current.request.snapshot_json) };
    } catch {
      return { kind: 'replay', snapshot: null };
    }
  }
  if (current.reservation?.status === 'reserved' && current.reservation.expires_at > new Date().toISOString()) return { kind: 'inflight' };
  if (current.reserved > 0) return { kind: 'busy' };
  if (current.balance < 1) return { kind: 'exhausted' };

  const timestamp = now();
  const operationId = crypto.randomUUID();
  const expires = new Date(Date.now() + RESERVATION_MS).toISOString();
  const results = await db.batch([
    db.prepare(`INSERT INTO credit_reservations (user_id, request_id, status, expires_at, created_at, updated_at)
      SELECT ?, ?, 'reserved', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM credit_accounts WHERE user_id = ? AND balance >= 1 AND reserved = 0)
        AND NOT EXISTS (SELECT 1 FROM credit_reservations WHERE user_id = ? AND request_id = ?)`)
      .bind(userId, requestId, expires, timestamp, timestamp, userId, userId, requestId),
    db.prepare(`UPDATE credit_reservations SET status = 'reserved', expires_at = ?, operation_id = ?, updated_at = ?
      WHERE user_id = ? AND request_id = ? AND status = 'released'
        AND EXISTS (SELECT 1 FROM credit_accounts WHERE user_id = ? AND balance >= 1 AND reserved = 0)`)
      .bind(expires, operationId, timestamp, userId, requestId, userId),
    db.prepare(`UPDATE credit_accounts SET balance = balance - 1, reserved = reserved + 1, updated_at = ?
      WHERE user_id = ? AND balance >= 1 AND reserved = 0
        AND EXISTS (
          SELECT 1 FROM credit_reservations
          WHERE user_id = ? AND request_id = ? AND status = 'reserved'
          AND (operation_id = ? OR (operation_id IS NULL AND updated_at = ?))
        )`).bind(timestamp, userId, userId, requestId, operationId, timestamp)
  ]);
  const changedReservation = Number(results[0].meta.changes ?? 0) + Number(results[1].meta.changes ?? 0);
  const debited = Number(results[2].meta.changes ?? 0);
  if (debited !== 1) {
    if (changedReservation) {
      await db.prepare("UPDATE credit_reservations SET status = 'released', updated_at = ? WHERE user_id = ? AND request_id = ? AND updated_at = ?")
        .bind(now(), userId, requestId, timestamp).run();
    }
    const again = await readReservation(db, userId, requestId);
    if (again.request && (again.request.conversation_id !== conversationId || again.request.request_hash !== requestHash)) {
      throw new HTTPException(409, { message: 'This request ID was already used for a different message' });
    }
    if (again.request?.status === 'succeeded' && again.request.snapshot_json) return { kind: 'replay', snapshot: JSON.parse(again.request.snapshot_json) };
    if (again.reserved > 0) return { kind: 'busy' };
    return { kind: 'exhausted' };
  }
  const saved = await db.prepare(`INSERT INTO ai_requests (user_id, request_id, conversation_id, status, snapshot_json, error_kind, prompt_tokens, completion_tokens, request_hash, created_at, updated_at)
    VALUES (?, ?, ?, 'reserved', NULL, NULL, NULL, NULL, ?, ?, ?)
    ON CONFLICT(user_id, request_id) DO UPDATE SET status = 'reserved', error_kind = NULL, updated_at = excluded.updated_at
    WHERE ai_requests.status != 'succeeded' AND ai_requests.conversation_id = excluded.conversation_id AND ai_requests.request_hash = excluded.request_hash`)
    .bind(userId, requestId, conversationId, requestHash, timestamp, timestamp).run();
  if (!Number(saved.meta.changes ?? 0)) {
    await releaseCredit(db, userId, requestId, 'request_conflict');
    throw new HTTPException(409, { message: 'This request ID was already used for a different message' });
  }
  return { kind: 'reserved' };
}

export async function settleCredit(db: D1Database, userId: string, requestId: string, usage?: { promptTokens: number | null; completionTokens: number | null }, snapshot?: unknown): Promise<void> {
  const timestamp = now();
  const operationId = crypto.randomUUID();
  const ledgerKey = `ai:${userId}:${requestId}`;
  const account = await db.prepare('SELECT balance FROM credit_accounts WHERE user_id = ?').bind(userId).first<{ balance: number }>();
  await db.batch([
    db.prepare("UPDATE credit_reservations SET status = 'settled', operation_id = ?, updated_at = ? WHERE user_id = ? AND request_id = ? AND status = 'reserved'").bind(operationId, timestamp, userId, requestId),
    db.prepare(`UPDATE credit_accounts SET reserved = MAX(0, reserved - 1), lifetime_spent = lifetime_spent + 1, updated_at = ?
      WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM credit_reservations WHERE user_id = ? AND request_id = ? AND status = 'settled' AND operation_id = ?
      )`).bind(timestamp, userId, userId, requestId, operationId),
    db.prepare(`INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, idempotency_key, actor_user_id, note, created_at)
      SELECT ?, ?, -1, ?, 'ai_reply', ?, NULL, NULL, ?
      WHERE EXISTS (
        SELECT 1 FROM credit_reservations WHERE user_id = ? AND request_id = ? AND status = 'settled' AND operation_id = ?
      ) AND NOT EXISTS (SELECT 1 FROM credit_ledger WHERE user_id = ? AND idempotency_key = ?)`)
      .bind(id('ledger'), userId, account?.balance ?? 0, ledgerKey, timestamp, userId, requestId, operationId, userId, ledgerKey),
    db.prepare(`UPDATE ai_requests SET status = 'succeeded', snapshot_json = ?, error_kind = NULL, prompt_tokens = ?, completion_tokens = ?, updated_at = ?
      WHERE user_id = ? AND request_id = ?`)
      .bind(snapshot ? JSON.stringify(snapshot).slice(0, 80_000) : null, usage?.promptTokens ?? null, usage?.completionTokens ?? null, timestamp, userId, requestId)
  ]);
}

export async function releaseCredit(db: D1Database, userId: string, requestId: string, errorKind: string): Promise<void> {
  const timestamp = now();
  const operationId = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE credit_reservations SET status = 'released', operation_id = ?, updated_at = ? WHERE user_id = ? AND request_id = ? AND status = 'reserved'").bind(operationId, timestamp, userId, requestId),
    db.prepare(`UPDATE credit_accounts SET balance = balance + 1, reserved = MAX(0, reserved - 1), updated_at = ?
      WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM credit_reservations WHERE user_id = ? AND request_id = ? AND status = 'released' AND operation_id = ?
      )`).bind(timestamp, userId, userId, requestId, operationId),
    db.prepare(`UPDATE ai_requests SET status = 'failed', error_kind = ?, updated_at = ?
      WHERE user_id = ? AND request_id = ? AND status != 'succeeded'`).bind(errorKind.slice(0, 80), timestamp, userId, requestId)
  ]);
}

export async function waiveCredit(db: D1Database, userId: string, requestId: string, snapshot: unknown): Promise<void> {
  await releaseCredit(db, userId, requestId, 'waived');
  await db.prepare("UPDATE ai_requests SET status = 'succeeded', snapshot_json = ?, error_kind = 'waived', updated_at = ? WHERE user_id = ? AND request_id = ?")
    .bind(JSON.stringify(snapshot).slice(0, 80_000), now(), userId, requestId).run();
}

export async function grantCredits(db: D1Database, actorId: string, targetId: string, amount: number, note: string, requestId: string): Promise<{ balance: number; applied: boolean }> {
  if (!Number.isInteger(amount) || amount < 1 || amount > GRANT_LIMIT) throw new HTTPException(400, { message: 'Credit amount must be a whole number from 1 to 500' });
  const cleanNote = note.trim();
  if (!cleanNote || cleanNote.length > 500) throw new HTTPException(400, { message: 'A note of 1 to 500 characters is required' });
  const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
  if (!target) throw new HTTPException(404, { message: 'User not found' });
  const account = await db.prepare('SELECT balance FROM credit_accounts WHERE user_id = ?').bind(targetId).first<{ balance: number }>();
  if (!account) throw new HTTPException(404, { message: 'Credit account not found' });
  const key = `admin:${targetId}:${requestId}`;
  const existing = await db.prepare('SELECT id, delta, note, actor_user_id FROM credit_ledger WHERE user_id = ? AND idempotency_key = ?').bind(targetId, key).first<{ id: string; delta: number; note: string; actor_user_id: string }>();
  if (existing) {
    if (existing.delta !== amount || existing.note !== cleanNote || existing.actor_user_id !== actorId) throw new HTTPException(409, { message: 'This request ID was already used for a different grant' });
    const current = await db.prepare('SELECT balance FROM credit_accounts WHERE user_id = ?').bind(targetId).first<{ balance: number }>();
    return { balance: current?.balance ?? account.balance, applied: false };
  }
  const timestamp = now();
  const ledgerId = id('ledger');
  const results = await db.batch([
    db.prepare(`INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, idempotency_key, actor_user_id, note, created_at)
      SELECT ?, ?, ?, balance + ?, 'admin_grant', ?, ?, ?, ? FROM credit_accounts
      WHERE user_id = ? AND balance + ? <= ?
      ON CONFLICT(user_id, idempotency_key) DO NOTHING`)
      .bind(ledgerId, targetId, amount, amount, key, actorId, cleanNote, timestamp, targetId, amount, BALANCE_LIMIT),
    db.prepare(`UPDATE credit_accounts SET balance = balance + ?, lifetime_granted = lifetime_granted + ?, updated_at = ?
      WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE user_id = ? AND idempotency_key = ? AND id = ?)`)
      .bind(amount, amount, timestamp, targetId, targetId, key, ledgerId),
    db.prepare(`INSERT INTO admin_audit (id, actor_user_id, action, target_user_id, idempotency_key, payload_json, created_at)
      SELECT ?, ?, 'grant_credits', ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)
      ON CONFLICT(actor_user_id, idempotency_key) DO NOTHING`)
      .bind(id('audit'), actorId, targetId, requestId, JSON.stringify({ amount, note: cleanNote }), timestamp, ledgerId)
  ]);
  if (!Number(results[0].meta.changes ?? 0)) {
    const saved = await db.prepare('SELECT delta, note, actor_user_id FROM credit_ledger WHERE user_id = ? AND idempotency_key = ?').bind(targetId, key).first<{ delta: number; note: string; actor_user_id: string }>();
    if (!saved) throw new HTTPException(400, { message: 'Credit balance would exceed the allowed limit' });
    if (saved.delta !== amount || saved.note !== cleanNote || saved.actor_user_id !== actorId) throw new HTTPException(409, { message: 'This request ID was already used for a different grant' });
  }
  const balance = await db.prepare('SELECT balance FROM credit_accounts WHERE user_id = ?').bind(targetId).first<{ balance: number }>();
  return { balance: balance?.balance ?? account.balance, applied: Number(results[0].meta.changes ?? 0) > 0 };
}
