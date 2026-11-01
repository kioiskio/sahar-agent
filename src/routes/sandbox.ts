import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Bindings } from '../index';
import type { Listing, Order } from '../types';
import { now } from '../db/repository';
import { resolveLocale } from '../i18n/locales';
import { sha256 } from '../lib/security';
import { isOperator } from '../lib/session';
import { PayPalPaymentProvider } from '../lib/paypal';

const sandbox = new Hono<{ Bindings: Bindings }>();
sandbox.use('*', async (c, next) => {
  if (!(await isOperator(c))) throw new HTTPException(401, { message: 'Workspace authentication required' });
  if (c.env.PAYPAL_MODE !== 'sandbox') throw new HTTPException(409, { message: 'Sandbox checkout requires PayPal sandbox mode' });
  await next();
});

sandbox.post('/orders', async c => {
  const body = await c.req.json<{ listingId?: unknown; locale?: unknown; requestId?: unknown }>().catch(() => ({} as { listingId?: unknown; locale?: unknown; requestId?: unknown }));
  if (typeof body.listingId !== 'string' || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) throw new HTTPException(400, { message: 'A listing ID and UUID v4 requestId are required' });
  let baseUrl: URL;
  try { baseUrl = new URL(c.env.APP_BASE_URL ?? ''); } catch { throw new HTTPException(503, { message: 'APP_BASE_URL is not configured' }); }
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) throw new HTTPException(503, { message: 'APP_BASE_URL must be an HTTPS origin' });
  const suffix = (await sha256(body.requestId.toLowerCase())).slice(0, 24);
  const orderId = `sbx_${suffix}`;
  const conversationId = `sbxconv_${suffix}`;
  const waId = `sandbox-${suffix}`;
  let order = await c.env.DB.prepare('SELECT * FROM deposit_orders WHERE id = ?').bind(orderId).first<Order>();
  if (order && order.listing_id !== body.listingId) throw new HTTPException(409, { message: 'This requestId belongs to a different listing' });
  if (!order) {
    const listing = await c.env.DB.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").bind(body.listingId).first<Listing>();
    if (!listing) throw new HTTPException(404, { message: 'Active listing not found' });
    const timestamp = now();
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
    const checkoutUrl = `${baseUrl.origin}/checkout/${orderId}?access_token=${encodeURIComponent(token)}`;
    // Sandbox web sessions share test retention but never enter the public mock API.
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT OR IGNORE INTO conversations (id, wa_id, locale, status, intent_stage, lead_score, selected_listing_id, channel, created_at, updated_at) VALUES (?, ?, ?, 'active', 'checkout', 95, ?, 'demo', ?, ?)").bind(conversationId, waId, resolveLocale(typeof body.locale === 'string' ? body.locale : 'en'), listing.id, timestamp, timestamp),
      c.env.DB.prepare("INSERT OR IGNORE INTO deposit_orders (id, conversation_id, wa_id, listing_id, amount_cents, currency, provider, status, access_token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'paypal', 'draft', ?, ?, ?)").bind(orderId, conversationId, waId, listing.id, listing.deposit_cents, listing.deposit_currency, await sha256(token), timestamp, timestamp),
      c.env.DB.prepare("INSERT OR IGNORE INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, metadata_json, created_at) VALUES (?, ?, 'outbound', 'system', ?, 'checkout_link', 'not_applicable', ?, ?)").bind(`sbxlink_${suffix}`, conversationId, checkoutUrl, JSON.stringify({ orderId, environment: 'sandbox' }), timestamp)
    ]);
    order = await c.env.DB.prepare('SELECT * FROM deposit_orders WHERE id = ?').bind(orderId).first<Order>();
  }
  if (!order || order.listing_id !== body.listingId) throw new HTTPException(409, { message: 'This requestId belongs to a different listing' });
  const link = await c.env.DB.prepare("SELECT body FROM messages WHERE id = ? AND conversation_id = ?").bind(`sbxlink_${suffix}`, conversationId).first<{ body: string }>();
  if (!link) throw new HTTPException(409, { message: 'Checkout link is unavailable' });
  if (order.status === 'draft') {
    let result;
    try {
      result = await new PayPalPaymentProvider(c.env).createDepositOrder({ orderId, amountCents: order.amount_cents, currency: order.currency, returnUrl: `${link.body}&payment_return=1`, cancelUrl: `${link.body}&payment_cancelled=1` });
    } catch { throw new HTTPException(503, { message: 'PayPal Sandbox is unavailable; retry this checkout request' }); }
    await c.env.DB.prepare("UPDATE deposit_orders SET paypal_order_id = ?, approval_url = ?, status = 'pending_payment', updated_at = ? WHERE id = ? AND status = 'draft'").bind(result.providerOrderId, result.approvalUrl, now(), orderId).run();
  }
  return c.json({ orderId, checkoutUrl: link.body }, order.status === 'draft' ? 201 : 200);
});

export default sandbox;
