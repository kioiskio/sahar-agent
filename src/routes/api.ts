import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Context, Next } from 'hono';
import { resolveLocale } from '../i18n/locales';
import { createDemoConversation, getBootstrap, getConversation, getConversationMessages, getDemoSnapshot, getSettings, id, now } from '../db/repository';
import { completeMockOrder, processDemoMessage } from '../services/demo';
import { acceptOrderTerms, captureOrder, verifyOrderAccess } from '../services/payments';
import { ensureCheckoutApproval } from '../services/checkout-approval';
import { isOperator } from '../lib/session';
import sandbox from './sandbox';
import accounts from './accounts';
import type { Bindings } from '../index';
import type { Listing, Order } from '../types';

const api = new Hono<{ Bindings: Bindings }>();
api.route('/payments/sandbox', sandbox);
api.route('/', accounts);
type AppContext = Context<{ Bindings: Bindings }>;

async function workspace(c: AppContext, next: Next) {
  if (!(await isOperator(c))) throw new HTTPException(401, { message: 'Workspace authentication required' });
  await next();
}

api.get('/health', async c => {
  await c.env.DB.prepare('SELECT 1 AS ok').first();
  return c.json({ ok: true, database: 'available', channel: c.env.CHANNEL_MODE ?? 'mock', payments: c.env.PAYPAL_MODE ?? 'mock', ai: c.env.AI_PROVIDER ?? 'rules' });
});
api.use('/bootstrap', workspace);
api.use('/settings', workspace);
api.use('/listings', workspace);
api.use('/listings/*', workspace);
api.use('/conversations/*', workspace);

api.get('/bootstrap', async c => c.json(await getBootstrap(c.env.DB, c.env)));

api.post('/demo/session', async c => {
  const body = await c.req.json<{ locale?: string }>().catch(() => ({} as { locale?: string }));
  const conversation = await createDemoConversation(c.env.DB, resolveLocale(body.locale));
  await processDemoMessage(c.env.DB, conversation.id, 'hello');
  return c.json(await getDemoSnapshot(c.env.DB, conversation.id), 201);
});
api.get('/demo/session/:id', async c => {
  const snapshot = await getDemoSnapshot(c.env.DB, c.req.param('id'));
  if (!snapshot) throw new HTTPException(404, { message: 'Demo conversation not found' });
  return c.json(snapshot);
});
api.post('/demo/messages', async c => {
  const body = await c.req.json<{ conversationId?: string; text?: string }>().catch(() => ({} as { conversationId?: string; text?: string }));
  if (!body.conversationId || !body.text) throw new HTTPException(400, { message: 'conversationId and text are required' });
  return c.json(await processDemoMessage(c.env.DB, body.conversationId, body.text));
});
api.get('/demo/checkout/:id', async c => c.json({ order: await getCheckout(c, c.req.param('id'), true) }));
api.post('/demo/orders/:id/complete', async c => {
  const body = await c.req.json<{ accepted?: boolean }>().catch(() => ({} as { accepted?: boolean }));
  return c.json({ order: await completeMockOrder(c.env.DB, c.req.param('id'), body.accepted === true) });
});

api.get('/conversations/:id', async c => {
  const conversation = await getConversation(c.env.DB, c.req.param('id'));
  if (!conversation) throw new HTTPException(404, { message: 'Conversation not found' });
  const [messages, orders] = await Promise.all([
    getConversationMessages(c.env.DB, c.req.param('id')),
    c.env.DB.prepare('SELECT deposit_orders.*, listings.title FROM deposit_orders JOIN listings ON listings.id = deposit_orders.listing_id WHERE conversation_id = ? ORDER BY created_at DESC').bind(c.req.param('id')).all()
  ]);
  return c.json({ conversation, messages, orders: orders.results });
});
api.post('/conversations/:id/handoff', async c => {
  const body = await c.req.json<{ action?: string }>().catch(() => ({} as { action?: string }));
  const status = body.action === 'resume' ? 'active' : body.action === 'close' ? 'closed' : body.action === 'handoff' || !body.action ? 'handoff' : null;
  if (!status) throw new HTTPException(400, { message: 'Invalid conversation action' });
  const timestamp = now();
  const result = await c.env.DB.prepare("UPDATE conversations SET status = ?, handoff_requested_at = CASE WHEN ? = 'handoff' THEN COALESCE(handoff_requested_at, ?) ELSE handoff_requested_at END, updated_at = ? WHERE id = ?").bind(status, status, timestamp, timestamp, c.req.param('id')).run();
  if (!result.meta.changes) throw new HTTPException(404, { message: 'Conversation not found' });
  return c.json({ conversation: await getConversation(c.env.DB, c.req.param('id')) });
});
api.post('/conversations/:id/messages', async c => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({} as { text?: string }));
  const text = body.text?.trim();
  if (!text || text.length > 2000) throw new HTTPException(400, { message: 'A message between 1 and 2000 characters is required' });
  const conversation = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(c.req.param('id')).first<{ id: string; wa_id: string; status: string }>();
  if (!conversation) throw new HTTPException(404, { message: 'Conversation not found' });
  if (conversation.status === 'closed') throw new HTTPException(409, { message: 'Conversation is closed' });
  const demo = conversation.wa_id.startsWith('demo-') || conversation.wa_id.startsWith('sandbox-');
  const messageId = id('msg');
  const timestamp = now();
  await c.env.DB.prepare("INSERT INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, created_at) VALUES (?, ?, 'outbound', 'agent', ?, 'text', ?, ?)").bind(messageId, conversation.id, text, demo ? 'simulated' : 'pending', timestamp).run();
  if (!demo) {
    await c.env.DB.prepare("INSERT INTO outbound_deliveries (id, conversation_id, message_id, recipient, body, status, attempts, max_attempts, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?, ?)").bind(id('delivery'), conversation.id, messageId, conversation.wa_id, text, timestamp, timestamp, timestamp).run();
    const { processWhatsAppRetries } = await import('../services/conversation-jobs');
    c.executionCtx.waitUntil(processWhatsAppRetries(c.env.DB, c.env));
  }
  return c.json({ message: await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(messageId).first() }, 201);
});

api.post('/listings', async c => {
  const input = validateListing(await c.req.json<Partial<Listing>>().catch(() => ({})));
  const listingId = id('listing');
  const timestamp = now();
  await c.env.DB.prepare('INSERT INTO listings (id, title, area, layout, bedrooms, bathrooms, price_cents, currency, deposit_cents, deposit_currency, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(listingId, input.title, input.area, input.layout, input.bedrooms, input.bathrooms, input.price_cents, input.currency, input.deposit_cents, input.deposit_currency, input.description, input.status, timestamp, timestamp).run();
  return c.json({ listing: await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(listingId).first() }, 201);
});
api.patch('/listings/:id', async c => {
  const previous = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(c.req.param('id')).first<Listing>();
  if (!previous) throw new HTTPException(404, { message: 'Listing not found' });
  const input = validateListing({ ...previous, ...await c.req.json<Partial<Listing>>().catch(() => ({})) });
  await c.env.DB.prepare('UPDATE listings SET title = ?, area = ?, layout = ?, bedrooms = ?, bathrooms = ?, price_cents = ?, currency = ?, deposit_cents = ?, deposit_currency = ?, description = ?, status = ?, updated_at = ? WHERE id = ?').bind(input.title, input.area, input.layout, input.bedrooms, input.bathrooms, input.price_cents, input.currency, input.deposit_cents, input.deposit_currency, input.description, input.status, now(), c.req.param('id')).run();
  return c.json({ listing: await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(c.req.param('id')).first() });
});

function validateListing(input: Partial<Listing>): Listing {
  const strings = ['title', 'area', 'layout', 'description'] as const;
  for (const key of strings) if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 1000) throw new HTTPException(400, { message: 'Invalid listing ' + key });
  const numbers = ['bedrooms', 'bathrooms', 'price_cents', 'deposit_cents'] as const;
  for (const key of numbers) if (!Number.isSafeInteger(input[key]) || Number(input[key]) < (key === 'deposit_cents' ? 1 : 0) || Number(input[key]) > 1_000_000_000_000) throw new HTTPException(400, { message: 'Invalid listing ' + key });
  for (const key of ['currency', 'deposit_currency'] as const) if (!/^[A-Z]{3}$/.test(input[key] ?? '')) throw new HTTPException(400, { message: 'Currency must be a three-letter uppercase ISO code' });
  if (!['active', 'inactive'].includes(input.status ?? '')) throw new HTTPException(400, { message: 'Invalid listing status' });
  return input as Listing;
}

api.patch('/settings', async c => {
  const body = await c.req.json<{ default_locale?: string; ai_provider?: string; ai_tone?: string; auto_reply_enabled?: boolean; deposit_terms?: string }>().catch(() => ({}) as { default_locale?: string; ai_provider?: string; ai_tone?: string; auto_reply_enabled?: boolean; deposit_terms?: string });
  const settings = await getSettings(c.env.DB);
  const tone = ['concise', 'warm', 'professional'].includes(body.ai_tone ?? '') ? body.ai_tone : settings.ai_tone;
  const provider = ['rules', 'openai'].includes(body.ai_provider ?? '') ? body.ai_provider : settings.ai_provider;
  const terms = body.deposit_terms?.trim() || settings.deposit_terms;
  if (terms.length > 4000) throw new HTTPException(400, { message: 'Terms are too long' });
  await c.env.DB.prepare('UPDATE workspace_settings SET default_locale = ?, ai_provider = ?, ai_tone = ?, auto_reply_enabled = ?, deposit_terms = ?, updated_at = ? WHERE id = 1').bind(body.default_locale ? resolveLocale(body.default_locale) : settings.default_locale, provider, tone, body.auto_reply_enabled === undefined ? settings.auto_reply_enabled : Number(body.auto_reply_enabled), terms, now()).run();
  return c.json({ settings: await getSettings(c.env.DB) });
});

const demoTerms: Record<string, string> = {
  en: 'Demonstration only. Deposit terms, refund conditions, property availability and the receiving business must be confirmed by an authorised agent before payment.',
  'zh-CN': '仅供演示。付款前，授权中介必须确认意向金条款、退款条件、房源可用性和收款方。',
  'zh-TW': '僅供示範。付款前，授權仲介必須確認意向金條款、退款條件、物件可用性和收款方。',
  fr: 'Démonstration uniquement. Avant le paiement, un agent autorisé doit confirmer les conditions de l’acompte et de remboursement, la disponibilité du bien et le bénéficiaire.',
  de: 'Nur zur Demonstration. Vor der Zahlung muss ein autorisierter Berater die Anzahlungs- und Rückerstattungsbedingungen, die Verfügbarkeit und den Zahlungsempfänger bestätigen.',
  ar: 'للعرض التجريبي فقط. قبل الدفع، يجب أن يؤكد وكيل معتمد شروط العربون والاسترداد وتوافر العقار والجهة المستلمة للدفع.'
};

async function getCheckout(c: AppContext, orderId: string, demo: boolean, token?: string): Promise<Order & { title: string; area: string; terms: string }> {
  const order = await c.env.DB.prepare('SELECT deposit_orders.*, listings.title, listings.area, workspace_settings.deposit_terms AS terms FROM deposit_orders JOIN conversations ON conversations.id = deposit_orders.conversation_id JOIN listings ON listings.id = deposit_orders.listing_id CROSS JOIN workspace_settings WHERE deposit_orders.id = ? AND deposit_orders.provider = ? AND conversations.wa_id LIKE ?').bind(orderId, demo ? 'mock' : 'paypal', demo ? 'demo-%' : '%').first<Order & { title: string; area: string; terms: string }>();
  if (!order || (!demo && order.wa_id.startsWith('demo-'))) throw new HTTPException(404, { message: 'Checkout not found' });
  if (order.wa_id.startsWith('sandbox-') && c.env.PAYPAL_MODE !== 'sandbox') throw new HTTPException(404, { message: 'Checkout not found' });
  if (!demo) await verifyOrderAccess(order, token ?? new URL(c.req.url).searchParams.get('token') ?? undefined);
  if (demo) {
    const conversation = await c.env.DB.prepare('SELECT locale FROM conversations WHERE id = ?').bind(order.conversation_id).first<{ locale: string }>();
    order.terms = demoTerms[conversation?.locale ?? 'en'] ?? demoTerms.en;
  }
  return order;
}
api.get('/payments/orders/:id', async c => {
  const order = await getCheckout(c, c.req.param('id'), false);
  const { access_token_hash: _accessTokenHash, ...safeOrder } = order;
  return c.json({ order: safeOrder });
});
api.post('/payments/orders/:id/terms', async c => {
  const body = await c.req.json<{ token?: string; accepted?: boolean }>().catch(() => ({}) as { token?: string; accepted?: boolean });
  const order = await getCheckout(c, c.req.param('id'), false, body.token);
  if (body.accepted !== true) throw new HTTPException(400, { message: 'You must accept the deposit terms' });
  await ensureCheckoutApproval(c.env, order, body.token ?? new URL(c.req.url).searchParams.get('token') ?? '');
  await acceptOrderTerms(c.env.DB, order.id, false);
  const { access_token_hash: _hash, ...safeOrder } = await getCheckout(c, order.id, false, body.token);
  return c.json({ order: safeOrder });
});
api.post('/payments/orders/:id/capture', async c => {
  const body = await c.req.json<{ token?: string; accepted?: boolean }>().catch(() => ({}) as { token?: string; accepted?: boolean });
  const order = await getCheckout(c, c.req.param('id'), false, body.token);
  if (!order.terms_accepted_at) {
    if (body.accepted !== true) throw new HTTPException(400, { message: 'You must accept the deposit terms' });
    await acceptOrderTerms(c.env.DB, order.id, false);
  }
  const currentOrder = await c.env.DB.prepare('SELECT * FROM deposit_orders WHERE id = ?').bind(order.id).first<Order>();
  if (!currentOrder) throw new HTTPException(404, { message: 'Order not found' });
  await captureOrder(c.env, currentOrder);
  const { access_token_hash: _hash, ...safeOrder } = await getCheckout(c, order.id, false, body.token);
  return c.json({ order: safeOrder });
});

export default api;
