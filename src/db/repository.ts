import type { Conversation, Listing, Message, Order, WorkspaceSettings } from '../types';
import type { Locale } from '../i18n/locales';

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export async function getListings(db: D1Database, activeOnly = false): Promise<Listing[]> {
  const query = `SELECT * FROM listings ${activeOnly ? "WHERE status = 'active'" : ''} ORDER BY price_cents ASC`;
  return (await db.prepare(query).all<Listing>()).results;
}

export async function getSettings(db: D1Database): Promise<WorkspaceSettings> {
  const settings = await db.prepare('SELECT * FROM workspace_settings WHERE id = 1').first<WorkspaceSettings>();
  if (!settings) throw new Error('Workspace settings are missing. Run the D1 migrations.');
  return settings;
}

export async function getConversation(db: D1Database, conversationId: string): Promise<Conversation | null> {
  const row = await db.prepare('SELECT * FROM conversations WHERE id = ?').bind(conversationId).first<Conversation & { transport?: Conversation['channel'] }>();
  return row ? normalizeConversation(row) : null;
}

export function normalizeConversation<T extends { channel?: unknown; transport?: unknown }>(row: T) {
  return { ...row, channel: row.transport ?? row.channel } as T;
}

export async function getConversationMessages(db: D1Database, conversationId: string): Promise<Message[]> {
  return (await db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC').bind(conversationId).all<Message>()).results;
}

export async function getLatestOrder(db: D1Database, conversationId: string): Promise<Order | null> {
  return db.prepare('SELECT * FROM deposit_orders WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').bind(conversationId).first<Order>();
}

export async function addMessage(db: D1Database, input: { conversationId: string; direction: string; senderType: string; body: string; messageType?: string; metadata?: Record<string, unknown> }): Promise<void> {
  await db.prepare(
    'INSERT INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id('msg'), input.conversationId, input.direction, input.senderType, input.body, input.messageType ?? 'text', input.direction === 'inbound' ? 'received' : 'simulated', input.metadata ? JSON.stringify(input.metadata) : null, now()).run();
}

export async function createDemoConversation(db: D1Database, locale: Locale): Promise<Conversation> {
  const timestamp = now();
  const conversationId = id('conv');
  const waId = `demo-${crypto.randomUUID()}`;
  await db.prepare(
    "INSERT INTO conversations (id, wa_id, locale, status, intent_stage, lead_score, channel, created_at, updated_at) VALUES (?, ?, ?, 'active', 'new', 0, 'demo', ?, ?)"
  ).bind(conversationId, waId, locale, timestamp, timestamp).run();
  const conversation = await getConversation(db, conversationId);
  if (!conversation) throw new Error('Could not create demo conversation');
  return conversation;
}

export async function getDemoSnapshot(db: D1Database, conversationId: string) {
  const conversation = await getConversation(db, conversationId);
  if (!conversation || !conversation.wa_id.startsWith('demo-') || conversation.user_id) return null;
  const [messages, order, listings] = await Promise.all([getConversationMessages(db, conversationId), getLatestOrder(db, conversationId), getListings(db, true)]);
  return { conversation, messages, order, checkoutUrl: order?.provider === 'mock' && order.status !== 'paid' ? `/checkout/${order.id}` : null, listings };
}

export async function getBootstrap(db: D1Database, env: { WHATSAPP_TOKEN?: string; WHATSAPP_APP_SECRET?: string; WHATSAPP_PHONE_NUMBER_ID?: string; PAYPAL_CLIENT_ID?: string; PAYPAL_SECRET?: string; PAYPAL_WEBHOOK_ID?: string; AI_API_KEY?: string; QINIU_SAHAR?: unknown; AI_MODEL?: string; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_WEBHOOK_SECRET?: string; CHANNEL_MODE?: string; PAYPAL_MODE?: string; AI_PROVIDER?: string }) {
  const [listings, conversations, orders, settings, stats] = await Promise.all([
    getListings(db),
    db.prepare('SELECT conversations.*, listings.title, listings.area FROM conversations LEFT JOIN listings ON conversations.selected_listing_id = listings.id ORDER BY COALESCE(conversations.last_message_at, conversations.created_at) DESC LIMIT 100').all(),
    db.prepare("SELECT deposit_orders.*, listings.title, (SELECT body FROM messages WHERE conversation_id = deposit_orders.conversation_id AND message_type = 'checkout_link' AND json_extract(metadata_json, '$.orderId') = deposit_orders.id ORDER BY created_at DESC LIMIT 1) AS checkout_message FROM deposit_orders JOIN listings ON deposit_orders.listing_id = listings.id ORDER BY deposit_orders.created_at DESC LIMIT 100").all<Order & { title: string; checkout_message: string | null }>(),
    getSettings(db),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM conversations) AS conversations,
      (SELECT COUNT(*) FROM conversations WHERE lead_score >= 70) AS highIntent,
      (SELECT COUNT(*) FROM deposit_orders WHERE status = 'paid') AS paidOrders,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM deposit_orders WHERE status = 'paid' AND currency = 'USD') AS paidCents,
      (SELECT COUNT(*) FROM conversations WHERE status = 'handoff') AS pendingHandoffs`).first<{ conversations: number; highIntent: number; paidOrders: number; paidCents: number; pendingHandoffs: number }>()
  ]);
  return {
    stats: { ...(stats ?? { conversations: 0, highIntent: 0, paidOrders: 0, paidCents: 0, pendingHandoffs: 0 }), currency: 'USD' },
    listings,
    conversations: conversations.results.map(row => normalizeConversation(row)),
    orders: orders.results.map(({ access_token_hash: _hash, checkout_message, ...order }) => ({ ...order, checkout_url: order.provider === 'mock' ? `/checkout/${order.id}` : checkout_message?.match(/https?:\/\/\S+/)?.[0] ?? null })),
    settings: { ...settings, channel_mode: env.CHANNEL_MODE ?? 'mock', ai_model: env.AI_MODEL ?? null, whatsapp_mode: env.CHANNEL_MODE === 'whatsapp' ? 'whatsapp' : 'mock', paypal_mode: env.PAYPAL_MODE ?? 'mock', connections: { telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET), whatsapp: Boolean(env.CHANNEL_MODE === 'whatsapp' && env.WHATSAPP_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_PHONE_NUMBER_ID), paypal: Boolean(['sandbox', 'live'].includes(env.PAYPAL_MODE ?? '') && env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET && env.PAYPAL_WEBHOOK_ID), ai: Boolean(settings.ai_provider === 'openai' && (env.AI_API_KEY || env.QINIU_SAHAR)) } }
  };
}
