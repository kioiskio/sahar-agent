import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { id, now } from '../db/repository';
import { safeEqual, sha256 } from './security';
import type { Bindings } from '../index';

export const SIGNUP_CREDITS = 50;
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const OTP_MS = 5 * 60 * 1000;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export type SessionUser = { id: string; email: string; admin: boolean };
type SessionContext = Context<{ Bindings: Bindings }> | { env: Bindings; req: { header(name: string): string | undefined; url: string } };

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

export function isAdminEmail(env: { ADMIN_EMAILS?: string }, email: string): boolean {
  const configured = env.ADMIN_EMAILS?.trim() || 'kioiskio01@gmail.com';
  return configured.split(',').map(item => item.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}

export function authSecret(env: { AUTH_SECRET?: string }): string {
  const secret = env.AUTH_SECRET?.trim() ?? '';
  if (secret.length < 16) throw new HTTPException(503, { message: 'Sign-in is not configured' });
  return secret;
}

export async function hashOtp(secret: string, email: string, code: string): Promise<string> {
  return sha256(`${secret}\n${email}\n${code}`);
}

export function assertSameOrigin(requestUrl: string, origin: string | undefined): void {
  if (!origin) throw new HTTPException(403, { message: 'Origin is required' });
  let originHost = '';
  let requestHost = '';
  try {
    originHost = new URL(origin).host;
    requestHost = new URL(requestUrl).host;
  } catch {
    throw new HTTPException(403, { message: 'Origin is invalid' });
  }
  if (originHost !== requestHost) throw new HTTPException(403, { message: 'Origin is invalid' });
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number): string {
  return `sahar_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function clientIpHash(env: { AUTH_SECRET?: string }, ip: string | undefined): Promise<string> {
  return sha256(`${authSecret(env)}\n${ip?.trim() || 'unknown'}`);
}

export async function ensureVerifiedUser(db: D1Database, email: string): Promise<{ id: string; created: boolean }> {
  const timestamp = now();
  const userId = id('user');
  const inserted = await db.prepare(
    "INSERT INTO users (id, email, email_verified_at, created_at, last_login_at, status) VALUES (?, ?, ?, ?, ?, 'active') ON CONFLICT(email) DO NOTHING"
  ).bind(userId, email, timestamp, timestamp, timestamp).run();
  const user = await db.prepare('SELECT id, status FROM users WHERE email = ?').bind(email).first<{ id: string; status: string }>();
  if (!user) throw new HTTPException(500, { message: 'Could not create the account' });
  if (user.status !== 'active') throw new HTTPException(403, { message: 'This account cannot sign in' });
  await db.batch([
    db.prepare(`INSERT INTO credit_accounts (user_id, balance, reserved, lifetime_granted, lifetime_spent, created_at, updated_at)
      SELECT ?, ?, 0, ?, 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM credit_accounts WHERE user_id = ?)`)
      .bind(user.id, SIGNUP_CREDITS, SIGNUP_CREDITS, timestamp, timestamp, user.id),
    db.prepare(`INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, idempotency_key, actor_user_id, note, created_at)
      SELECT ?, ?, ?, ?, 'signup_grant', 'signup', NULL, NULL, ?
      WHERE NOT EXISTS (SELECT 1 FROM credit_ledger WHERE user_id = ? AND idempotency_key = 'signup')`)
      .bind(id('ledger'), user.id, SIGNUP_CREDITS, SIGNUP_CREDITS, timestamp, user.id),
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(timestamp, user.id)
  ]);
  return { id: user.id, created: Number(inserted.meta.changes ?? 0) > 0 };
}

export async function createSession(db: D1Database, userId: string, ipHash: string): Promise<string> {
  const token = randomToken();
  const timestamp = now();
  const expires = new Date(Date.now() + SESSION_MS).toISOString();
  await db.prepare('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at, ip_hash) VALUES (?, ?, ?, ?, ?, NULL, ?)')
    .bind(id('session'), userId, await sha256(token), timestamp, expires, ipHash).run();
  return token;
}

export async function readSession(c: SessionContext): Promise<SessionUser | null> {
  const token = readCookie(c.req.header('cookie'), 'sahar_session');
  if (!token) return null;
  const row = await c.env.DB.prepare(`SELECT sessions.user_id AS id, sessions.expires_at, sessions.revoked_at, users.email, users.status
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?`)
    .bind(await sha256(token)).first<{ id: string; expires_at: string; revoked_at: string | null; email: string; status: string }>();
  if (!row || row.revoked_at || row.status !== 'active' || row.expires_at <= new Date().toISOString()) return null;
  return { id: row.id, email: row.email, admin: isAdminEmail(c.env, row.email) };
}

export async function revokeSession(c: SessionContext): Promise<void> {
  const token = readCookie(c.req.header('cookie'), 'sahar_session');
  if (!token) return;
  await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(now(), await sha256(token)).run();
}

export function hasWorkspaceKey(c: SessionContext): boolean {
  const configured = c.env.WORKSPACE_API_KEY?.trim();
  return Boolean(configured && safeEqual(c.req.header('X-Workspace-Key') ?? '', configured));
}

export async function isOperator(c: SessionContext): Promise<boolean> {
  if (hasWorkspaceKey(c)) return true;
  const user = await readSession(c);
  return Boolean(user?.admin);
}

export async function recordLoginEvent(db: D1Database, input: { userId?: string | null; email: string; eventType: 'otp_sent' | 'otp_failed' | 'login' | 'logout'; ipHash?: string | null }): Promise<void> {
  await db.prepare('INSERT INTO login_events (id, user_id, email, event_type, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id('login'), input.userId ?? null, input.email, input.eventType, now(), input.ipHash ?? null).run();
}

export function otpExpiry(): string {
  return new Date(Date.now() + OTP_MS).toISOString();
}

export async function creditsFor(db: D1Database, userId: string): Promise<{ balance: number; reserved: number; spent: number }> {
  const row = await db.prepare('SELECT balance, reserved, lifetime_spent AS spent FROM credit_accounts WHERE user_id = ?')
    .bind(userId).first<{ balance: number; reserved: number; spent: number }>();
  return row ?? { balance: 0, reserved: 0, spent: 0 };
}
