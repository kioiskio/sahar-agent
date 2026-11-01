import { HTTPException } from 'hono/http-exception';
import { id, now, getConversation, getConversationMessages, getLatestOrder } from '../db/repository';
import { AiProviderError } from '../lib/ai';
import { releaseCredit, reserveCredit, settleCredit, waiveCredit } from '../lib/credits';
import { sha256 } from '../lib/security';
import { creditsFor } from '../lib/session';
import type { Locale } from '../i18n/locales';
import { resolveLocale } from '../i18n/locales';
import type { Message } from '../types';
import { processConversationMessage, type ConversationEnvironment } from './conversation';

const welcomeCopy: Record<Locale, string> = {
  en: 'What area, budget, or layout should I look at?',
  'zh-CN': '想看哪个区域、预算或户型？',
  'zh-TW': '想看哪個區域、預算或戶型？',
  fr: 'Quel quartier, budget ou plan voulez-vous regarder ?',
  de: 'Welchen Stadtteil, welches Budget oder welchen Grundriss soll ich ansehen?',
  ar: 'أي منطقة أو ميزانية أو مخطط تريد أن أبحث عنه؟'
};

export type WebSnapshot = {
  conversation: { id: string; title: string | null; locale: string; status: string; intent_stage: string; lead_score: number; selected_listing_id: string | null; last_message_at: string | null };
  messages: Array<{ id: string; direction: string; sender_type: string; body: string; message_type: string; created_at: string }>;
  order: { id: string; status: string; amount_cents: number; currency: string; listing_id: string } | null;
  checkoutUrl: string | null;
  credits: { balance: number; reserved: number; spent: number };
};

async function ownedConversation(db: D1Database, userId: string, conversationId: string) {
  const conversation = await getConversation(db, conversationId);
  const owner = await db.prepare('SELECT user_id FROM conversations WHERE id = ?').bind(conversationId).first<{ user_id: string | null }>();
  if (!conversation || owner?.user_id !== userId || conversation.transport !== 'web') throw new HTTPException(404, { message: 'Conversation not found' });
  return conversation;
}

function publicMessage(message: Message) {
  return { id: message.id, direction: message.direction, sender_type: message.sender_type, body: message.body, message_type: message.message_type, created_at: message.created_at };
}

export async function webSnapshot(db: D1Database, userId: string, conversationId: string, checkoutUrl: string | null = null): Promise<WebSnapshot> {
  const conversation = await ownedConversation(db, userId, conversationId);
  const [messages, order, credits] = await Promise.all([
    getConversationMessages(db, conversationId),
    getLatestOrder(db, conversationId),
    creditsFor(db, userId)
  ]);
  return {
    conversation: {
      id: conversation.id,
      title: conversationTitle(conversation),
      locale: conversation.locale,
      status: conversation.status,
      intent_stage: conversation.intent_stage,
      lead_score: conversation.lead_score,
      selected_listing_id: conversation.selected_listing_id,
      last_message_at: conversation.last_message_at
    },
    messages: messages.map(publicMessage),
    order: order ? { id: order.id, status: order.status, amount_cents: order.amount_cents, currency: order.currency, listing_id: order.listing_id } : null,
    checkoutUrl,
    credits
  };
}

function conversationTitle(conversation: { title?: string | null }): string | null {
  const title = conversation.title?.trim();
  return title ? title.slice(0, 80) : null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim().replace(/\s+/g, ' ');
  if (!title || title.length > 80) return null;
  return title;
}

export async function createWebConversation(db: D1Database, userId: string, localeInput: unknown, titleInput?: unknown): Promise<WebSnapshot> {
  const locale = resolveLocale(typeof localeInput === 'string' ? localeInput : 'en');
  const title = cleanTitle(titleInput);
  const conversationId = id('conv');
  const timestamp = now();
  await db.batch([
    db.prepare("INSERT INTO conversations (id, wa_id, locale, status, intent_stage, lead_score, channel, transport, user_id, title, created_at, updated_at) VALUES (?, ?, ?, 'active', 'new', 0, 'whatsapp', 'web', ?, ?, ?, ?)")
      .bind(conversationId, `web:${userId}:${conversationId}`, locale, userId, title, timestamp, timestamp),
    db.prepare("INSERT INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, metadata_json, created_at) VALUES (?, ?, 'outbound', 'ai', ?, 'text', 'delivered', ?, ?)")
      .bind(id('msg'), conversationId, welcomeCopy[locale], JSON.stringify({ provider: 'welcome' }), timestamp)
  ]);
  return webSnapshot(db, userId, conversationId);
}

export async function listWebConversations(db: D1Database, userId: string) {
  const rows = await db.prepare(`SELECT conversations.id, conversations.title, conversations.status, conversations.updated_at, conversations.created_at,
      (SELECT body FROM messages WHERE messages.conversation_id = conversations.id AND messages.message_type = 'text' ORDER BY messages.created_at DESC, messages.id DESC LIMIT 1) AS preview
    FROM conversations WHERE user_id = ? AND transport = 'web' ORDER BY updated_at DESC LIMIT 100`).bind(userId).all<{ id: string; title: string | null; status: string; updated_at: string; created_at: string; preview: string | null }>();
  return {
    conversations: rows.results.map(row => ({ ...row, title: row.title?.trim() || null, preview: row.preview?.replace(/\s+/g, ' ').trim().slice(0, 140) || null })),
    credits: await creditsFor(db, userId)
  };
}

export async function renameWebConversation(db: D1Database, userId: string, conversationId: string, titleInput: unknown): Promise<{ title: string }> {
  const title = cleanTitle(titleInput);
  if (!title) throw new HTTPException(400, { message: 'A conversation name of 1 to 80 characters is required' });
  const updated = await db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ? AND transport = 'web'").bind(title, now(), conversationId, userId).run();
  if (!Number(updated.meta.changes ?? 0)) throw new HTTPException(404, { message: 'Conversation not found' });
  return { title };
}

export async function deleteWebConversation(db: D1Database, userId: string, conversationId: string): Promise<void> {
  const owned = await db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ? AND transport = 'web'").bind(conversationId, userId).first();
  if (!owned) throw new HTTPException(404, { message: 'Conversation not found' });
  const protectedOrder = await db.prepare("SELECT id FROM deposit_orders WHERE conversation_id = ? AND status IN ('pending_payment', 'processing', 'paid') LIMIT 1").bind(conversationId).first();
  if (protectedOrder) throw new HTTPException(409, { message: 'This conversation has a payment record and cannot be deleted' });
  const active = await db.prepare("SELECT request_id FROM ai_requests WHERE conversation_id = ? AND status = 'reserved' LIMIT 1").bind(conversationId).first();
  if (active) throw new HTTPException(409, { message: 'Please wait for the current reply before deleting this conversation' });
  const protectedChildren = `
    AND NOT EXISTS (SELECT 1 FROM ai_requests WHERE conversation_id = ? AND status = 'reserved')
    AND NOT EXISTS (SELECT 1 FROM deposit_orders WHERE conversation_id = ? AND status IN ('pending_payment', 'processing', 'paid'))`;
  const deleted = await db.batch([
    db.prepare(`DELETE FROM outbound_deliveries WHERE conversation_id = ?${protectedChildren}`).bind(conversationId, conversationId, conversationId),
    db.prepare(`DELETE FROM conversation_jobs WHERE conversation_id = ?${protectedChildren}`).bind(conversationId, conversationId, conversationId),
    db.prepare(`DELETE FROM deposit_orders WHERE conversation_id = ?${protectedChildren}`).bind(conversationId, conversationId, conversationId),
    db.prepare(`DELETE FROM messages WHERE conversation_id = ?${protectedChildren}`).bind(conversationId, conversationId, conversationId),
    db.prepare(`DELETE FROM conversations WHERE id = ? AND user_id = ? AND transport = 'web'
      AND NOT EXISTS (SELECT 1 FROM ai_requests WHERE conversation_id = conversations.id AND status = 'reserved')
      AND NOT EXISTS (SELECT 1 FROM deposit_orders WHERE conversation_id = conversations.id AND status IN ('pending_payment', 'processing', 'paid'))`).bind(conversationId, userId)
  ]);
  if (!Number(deleted[4].meta.changes ?? 0)) throw new HTTPException(409, { message: 'Please wait for the current reply before deleting this conversation' });
}

async function rememberTitle(db: D1Database, userId: string, conversationId: string, text: string): Promise<void> {
  const title = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!title) return;
  await db.prepare("UPDATE conversations SET title = ? WHERE id = ? AND user_id = ? AND transport = 'web' AND (title IS NULL OR trim(title) = '')").bind(title, conversationId, userId).run();
}

function usageFrom(message: Message | undefined): { promptTokens: number | null; completionTokens: number | null } | undefined {
  if (!message?.metadata_json) return undefined;
  try {
    const metadata = JSON.parse(message.metadata_json) as { usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } };
    if (!metadata.usage) return undefined;
    return { promptTokens: metadata.usage.prompt_tokens ?? null, completionTokens: metadata.usage.completion_tokens ?? null };
  } catch {
    return undefined;
  }
}

export async function sendWebMessage(db: D1Database, env: ConversationEnvironment, userId: string, conversationId: string, text: string, requestId: string): Promise<WebSnapshot> {
  await ownedConversation(db, userId, conversationId);
  await rememberTitle(db, userId, conversationId, text);
  const requestHash = await sha256(text);
  const reservation = await reserveCredit(db, userId, requestId, conversationId, requestHash);
  if (reservation.kind === 'replay') {
    const snapshot = reservation.snapshot && typeof reservation.snapshot === 'object' ? reservation.snapshot as WebSnapshot : await webSnapshot(db, userId, conversationId);
    return { ...snapshot, credits: await creditsFor(db, userId) };
  }
  if (reservation.kind === 'inflight') throw new HTTPException(409, { message: 'This request is already running' });
  if (reservation.kind === 'busy') throw new HTTPException(429, { message: 'Another reply is still running for this account' });
  if (reservation.kind === 'exhausted') throw new HTTPException(402, { message: 'Trial credits are used up' });

  const externalId = `web:${requestId}`;
  try {
    const existingInbound = await db.prepare('SELECT id FROM messages WHERE external_message_id = ?').bind(externalId).first();
    const result = await processConversationMessage(db, env, { conversationId, text, externalMessageId: externalId, alreadyPersisted: Boolean(existingInbound) });
    const reply = result.messages.find(message => message.id === `reply_${externalId}_text`);
    let provider = '';
    if (reply?.metadata_json) {
      try { provider = String((JSON.parse(reply.metadata_json) as { provider?: string }).provider ?? ''); } catch { provider = ''; }
    }
    const snapshot = await webSnapshot(db, userId, conversationId, result.checkoutUrl);
    if (provider === 'openai') await settleCredit(db, userId, requestId, usageFrom(reply), snapshot);
    else await waiveCredit(db, userId, requestId, snapshot);
    const titled = await webSnapshot(db, userId, conversationId, result.checkoutUrl);
    return { ...titled, credits: await creditsFor(db, userId) };
  } catch (error) {
    const kind = error instanceof AiProviderError ? error.kind : 'failed';
    await releaseCredit(db, userId, requestId, kind);
    if (error instanceof AiProviderError && error.kind === 'budget') throw new HTTPException(503, { message: 'The assistant is temporarily unavailable' });
    if (error instanceof AiProviderError || error instanceof Error) throw new HTTPException(502, { message: 'The assistant could not reply. No credit was used.' });
    throw error;
  }
}
