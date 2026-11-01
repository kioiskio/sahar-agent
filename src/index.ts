import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import whatsapp from './routes/whatsapp';
import paypal from './routes/paypal';
import telegram from './routes/telegram';
import api from './routes/api';
import { runMaintenance } from './services/maintenance';
import { publicError } from './lib/security';
import type { SecretBinding } from './lib/ai';
import type { EmailBinding } from './lib/mailer';
import { canonicalRedirect } from './lib/canonical-origin';

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_BASE_URL?: string;
  AI_DAILY_CALL_BUDGET?: string;
  CHANNEL_MODE?: string;
  PAYPAL_MODE?: string;
  AI_PROVIDER?: string;
  WORKSPACE_API_KEY?: string;
  APP_BASE_URL?: string;
  AUTH_SECRET?: string;
  ADMIN_EMAILS?: string;
  EMAIL_FROM?: string;
  OTP_TEST_SINK?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_MODE?: string;
  QINIU_SAHAR?: SecretBinding;
  EMAIL?: EmailBinding;
};

const app = new Hono<{ Bindings: Bindings }>({ strict: false });
// Ignore caller-supplied lengths: the middleware measures the actual body stream.
app.use('/api/*', async (c, next) => {
  if (!c.req.raw.body) return next();
  const headers = new Headers(c.req.raw.headers);
  headers.delete('content-length');
  c.req.raw = new Request(c.req.raw, { headers });
  return bodyLimit({
    maxSize: 128 * 1024,
    onError: () => { throw new HTTPException(413, { message: 'Request body is too large' }); }
  })(c, next);
});
app.use(secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://challenges.cloudflare.com'], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https://challenges.cloudflare.com'], connectSrc: ["'self'", 'data:', 'https://challenges.cloudflare.com', 'https://hagen.challenges.cloudflare.com', 'https://brunhild.challenges.cloudflare.com'], fontSrc: ["'self'", 'data:'], frameSrc: ['https://challenges.cloudflare.com', 'https://hagen.challenges.cloudflare.com', 'https://brunhild.challenges.cloudflare.com'], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'", 'https://www.paypal.com', 'https://www.sandbox.paypal.com'] },
  xFrameOptions: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));
app.route('/api', api);
app.route('/webhook/whatsapp', whatsapp);
app.route('/webhook/paypal', paypal);
app.route('/webhook/telegram', telegram);
app.onError((error, c) => {
  const requestId = crypto.randomUUID();
  console.error('Request failed', { requestId, message: error instanceof Error ? error.message : 'Unknown error' });
  if (error instanceof HTTPException) return c.json({ error: error.message, requestId }, error.status);
  return c.json({ error: publicError(error), requestId }, 500);
});
app.notFound(async c => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/webhook/')) return c.json({ error: 'Not found' }, 404);
  // Asset requests for client routes such as /workspace have no file. Serve the app shell.
  const shellUrl = new URL(c.req.url);
  shellUrl.pathname = '/index.html';
  shellUrl.search = '';
  try {
    const direct = await c.env.ASSETS.fetch(c.req.raw);
    if (direct.ok) return new Response(direct.body, direct);
  } catch (error) {
    console.error('Asset lookup failed', { message: error instanceof Error ? error.message : 'asset lookup failed' });
  }
  const shell = await c.env.ASSETS.fetch(new Request(shellUrl, { method: 'GET' }));
  return new Response(shell.body, { status: shell.status, headers: { 'Content-Type': shell.headers.get('Content-Type') ?? 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
});
export default {
  fetch: (request: Request, env: Bindings, ctx: ExecutionContext) =>
    canonicalRedirect(request, env.APP_BASE_URL) ?? app.fetch(request, env, ctx),
  scheduled: async (_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => { ctx.waitUntil(runMaintenance(env)); }
};
