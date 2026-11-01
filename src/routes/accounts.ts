import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Bindings } from '../index';
import { grantCredits } from '../lib/credits';
import { sendLoginCode } from '../lib/mailer';
import { consumeRateLimit } from '../lib/rate-limit';
import { assertSameOrigin, authSecret, clientIpHash, createSession, creditsFor, ensureVerifiedUser, hashOtp, normalizeEmail, otpExpiry, readSession, recordLoginEvent, revokeSession, sessionCookie } from '../lib/session';
import { safeEqual } from '../lib/security';
import { verifyTurnstile } from '../lib/turnstile';
import { id, now } from '../db/repository';
import { createWebConversation, deleteWebConversation, listWebConversations, renameWebConversation, sendWebMessage, webSnapshot } from '../services/web-chat';

const accounts = new Hono<{ Bindings: Bindings }>();
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestIp(header: (name: string) => string | undefined): string | undefined {
  return header('cf-connecting-ip') ?? undefined;
}

function testSink(env: Bindings, url: string): boolean {
  return env.OTP_TEST_SINK === '1' && new URL(url).hostname === 'test.local';
}

accounts.get('/auth/config', c => c.json({
  turnstileSiteKey: c.env.TURNSTILE_SITE_KEY?.trim() || null,
  contactEmail: 'kioiskio01@gmail.com'
}));

accounts.get('/auth/session', async c => {
  const user = await readSession(c);
  if (!user) return c.json({ user: null }, 401);
  return c.json({ user, credits: await creditsFor(c.env.DB, user.id) });
});

accounts.post('/auth/logout', async c => {
  assertSameOrigin(c.req.url, c.req.header('origin'));
  const user = await readSession(c);
  await revokeSession(c);
  if (user) await recordLoginEvent(c.env.DB, { userId: user.id, email: user.email, eventType: 'logout', ipHash: await clientIpHash(c.env, requestIp(name => c.req.header(name))) });
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ ok: true });
});

accounts.post('/auth/email-code', async c => {
  assertSameOrigin(c.req.url, c.req.header('origin'));
  const body = await c.req.json<{ email?: unknown; turnstileToken?: unknown }>().catch(() => ({} as { email?: unknown; turnstileToken?: unknown }));
  const email = normalizeEmail(body.email);
  if (!email) throw new HTTPException(400, { message: 'A valid email is required' });
  await verifyTurnstile(c.env, body.turnstileToken, requestIp(name => c.req.header(name)), c.req.url);
  const ipHash = await clientIpHash(c.env, requestIp(name => c.req.header(name)));
  const allowed = await consumeRateLimit(c.env.DB, `otp-cd:${email}`, 1, 60_000)
    && await consumeRateLimit(c.env.DB, `otp-hr:${email}`, 5, 60 * 60_000)
    && await consumeRateLimit(c.env.DB, `otp-ip:${ipHash}`, 20, 60 * 60_000);
  if (!allowed) throw new HTTPException(429, { message: 'Please wait before requesting another code' });
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const timestamp = now();
  const otpId = id('otp');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE email_otps SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL').bind(timestamp, email),
    c.env.DB.prepare('INSERT INTO email_otps (id, email, code_hash, created_at, expires_at, consumed_at, attempts, max_attempts) VALUES (?, ?, ?, ?, ?, NULL, 0, 5)')
      .bind(otpId, email, await hashOtp(authSecret(c.env), email, code), timestamp, otpExpiry())
  ]);
  await recordLoginEvent(c.env.DB, { email, eventType: 'otp_sent', ipHash });
  if (!testSink(c.env, c.req.url)) {
    try {
      await sendLoginCode(c.env, email, code);
    } catch (error) {
      await c.env.DB.prepare('DELETE FROM email_otps WHERE id = ?').bind(otpId).run();
      throw error;
    }
  }
  return c.json({ ok: true, ...(testSink(c.env, c.req.url) ? { testCode: code } : {}) });
});

accounts.post('/auth/email-code/verify', async c => {
  assertSameOrigin(c.req.url, c.req.header('origin'));
  const body = await c.req.json<{ email?: unknown; code?: unknown; turnstileToken?: unknown }>().catch(() => ({} as { email?: unknown; code?: unknown; turnstileToken?: unknown }));
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) throw new HTTPException(400, { message: 'Email and a 6-digit code are required' });
  // The Turnstile token is single-use and was already checked when the code was sent.
  const ipHash = await clientIpHash(c.env, requestIp(name => c.req.header(name)));
  if (!await consumeRateLimit(c.env.DB, `otp-verify:${ipHash}`, 30, 60 * 60_000)) throw new HTTPException(429, { message: 'Too many verification attempts' });
  const secret = authSecret(c.env);
  const submitted = await hashOtp(secret, email, code);
  const row = await c.env.DB.prepare('SELECT id, code_hash, attempts, max_attempts FROM email_otps WHERE email = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .bind(email, new Date().toISOString()).first<{ id: string; code_hash: string; attempts: number; max_attempts: number }>();
  const fail = async () => {
    await recordLoginEvent(c.env.DB, { email, eventType: 'otp_failed', ipHash });
    throw new HTTPException(401, { message: 'That code is incorrect, expired, or already used' });
  };
  if (!row || row.attempts >= row.max_attempts) return fail();
  const attempt = await c.env.DB.prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts').bind(row.id).run();
  if (!Number(attempt.meta.changes ?? 0) || !safeEqual(submitted, row.code_hash)) return fail();
  const consumed = await c.env.DB.prepare('UPDATE email_otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now(), row.id).run();
  if (!Number(consumed.meta.changes ?? 0)) return fail();
  const user = await ensureVerifiedUser(c.env.DB, email);
  const token = await createSession(c.env.DB, user.id, ipHash);
  await recordLoginEvent(c.env.DB, { userId: user.id, email, eventType: 'login', ipHash });
  c.header('Set-Cookie', sessionCookie(token, 14 * 24 * 60 * 60));
  const sessionUser = await readSession({ env: c.env, req: { header: name => name.toLowerCase() === 'cookie' ? `sahar_session=${token}` : c.req.header(name), url: c.req.url } });
  return c.json({ user: sessionUser, credits: await creditsFor(c.env.DB, user.id) });
});

async function requireUser(c: Parameters<typeof readSession>[0]) {
  assertSameOrigin(c.req.url, c.req.header('origin'));
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  return user;
}

accounts.get('/me', async c => {
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  return c.json({ user, credits: await creditsFor(c.env.DB, user.id) });
});

accounts.get('/me/conversations', async c => {
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  return c.json(await listWebConversations(c.env.DB, user.id));
});

accounts.post('/me/conversations', async c => {
  const user = await requireUser(c);
  const body = await c.req.json<{ locale?: unknown; title?: unknown }>().catch(() => ({} as { locale?: unknown; title?: unknown }));
  if (!await consumeRateLimit(c.env.DB, `conv:${user.id}`, 20, 60 * 60_000)) throw new HTTPException(429, { message: 'Too many conversations were created' });
  return c.json(await createWebConversation(c.env.DB, user.id, body.locale, body.title), 201);
});

accounts.patch('/me/conversations/:id', async c => {
  const user = await requireUser(c);
  const body = await c.req.json<{ title?: unknown }>().catch(() => ({} as { title?: unknown }));
  return c.json(await renameWebConversation(c.env.DB, user.id, c.req.param('id'), body.title));
});

accounts.delete('/me/conversations/:id', async c => {
  const user = await requireUser(c);
  await deleteWebConversation(c.env.DB, user.id, c.req.param('id'));
  return c.json({ ok: true });
});

accounts.get('/me/conversations/:id', async c => {
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  return c.json(await webSnapshot(c.env.DB, user.id, c.req.param('id')));
});

accounts.post('/me/conversations/:id/messages', async c => {
  const user = await requireUser(c);
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > 8_000) throw new HTTPException(413, { message: 'Message is too large' });
  const body = await c.req.json<{ text?: unknown; requestId?: unknown }>().catch(() => ({} as { text?: unknown; requestId?: unknown }));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2_000) throw new HTTPException(400, { message: 'A message between 1 and 2000 characters is required' });
  if (typeof body.requestId !== 'string' || !UUID_V4.test(body.requestId)) throw new HTTPException(400, { message: 'A UUID v4 requestId is required' });
  const ipHash = await clientIpHash(c.env, requestIp(name => c.req.header(name)));
  const allowed = await consumeRateLimit(c.env.DB, `chat-user:${user.id}`, 20, 60_000)
    && await consumeRateLimit(c.env.DB, `chat-ip:${ipHash}`, 60, 60_000);
  if (!allowed) throw new HTTPException(429, { message: 'Too many messages were sent' });
  return c.json(await sendWebMessage(c.env.DB, c.env, user.id, c.req.param('id'), text, body.requestId.toLowerCase()));
});

accounts.get('/admin/users', async c => {
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  if (!user.admin) throw new HTTPException(403, { message: 'Administration is not available for this account' });
  const users = await c.env.DB.prepare(`SELECT users.id, users.email, users.email_verified_at, users.created_at, users.last_login_at, users.status,
      COALESCE(credit_accounts.balance, 0) AS balance,
      COALESCE(credit_accounts.lifetime_spent, 0) AS spent,
      COALESCE(credit_accounts.lifetime_granted, 0) AS granted,
      COALESCE((SELECT SUM(prompt_tokens) FROM ai_requests WHERE ai_requests.user_id = users.id), 0) AS prompt_tokens,
      COALESCE((SELECT SUM(completion_tokens) FROM ai_requests WHERE ai_requests.user_id = users.id), 0) AS completion_tokens
    FROM users LEFT JOIN credit_accounts ON credit_accounts.user_id = users.id
    ORDER BY users.created_at DESC LIMIT 200`).all();
  return c.json({ users: users.results });
});

accounts.get('/admin/users/:id', async c => {
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  if (!user.admin) throw new HTTPException(403, { message: 'Administration is not available for this account' });
  const account = await c.env.DB.prepare(`SELECT users.id, users.email, users.email_verified_at, users.created_at, users.last_login_at, users.status,
      COALESCE(credit_accounts.balance, 0) AS balance, COALESCE(credit_accounts.lifetime_spent, 0) AS spent
    FROM users LEFT JOIN credit_accounts ON credit_accounts.user_id = users.id WHERE users.id = ?`).bind(c.req.param('id')).first();
  if (!account) throw new HTTPException(404, { message: 'User not found' });
  const [events, ledger] = await Promise.all([
    c.env.DB.prepare('SELECT id, event_type, created_at FROM login_events WHERE user_id = ? OR (user_id IS NULL AND email = ?) ORDER BY created_at DESC LIMIT 50').bind(c.req.param('id'), (account as { email: string }).email).all(),
    c.env.DB.prepare('SELECT id, delta, balance_after, reason, note, actor_user_id, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(c.req.param('id')).all()
  ]);
  return c.json({ user: account, events: events.results, ledger: ledger.results });
});

accounts.post('/admin/credits', async c => {
  assertSameOrigin(c.req.url, c.req.header('origin'));
  const user = await readSession(c);
  if (!user) throw new HTTPException(401, { message: 'Sign in is required' });
  if (!user.admin) throw new HTTPException(403, { message: 'Administration is not available for this account' });
  const body = await c.req.json<{ userId?: unknown; amount?: unknown; note?: unknown; requestId?: unknown; role?: unknown; email?: unknown }>().catch(() => ({} as { userId?: unknown; amount?: unknown; note?: unknown; requestId?: unknown }));
  if (typeof body.userId !== 'string' || typeof body.note !== 'string' || typeof body.requestId !== 'string' || !UUID_V4.test(body.requestId)) {
    throw new HTTPException(400, { message: 'userId, note and a UUID v4 requestId are required' });
  }
  const result = await grantCredits(c.env.DB, user.id, body.userId, Number(body.amount), body.note, body.requestId.toLowerCase());
  return c.json(result);
});

export default accounts;
