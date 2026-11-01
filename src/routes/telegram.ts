import { Hono } from 'hono';
import type { Bindings } from '../index';
import { safeEqual, sha256 } from '../lib/security';
import { resolveLocale } from '../i18n/locales';
import { processConversationJobs } from '../services/conversation-jobs';

const telegram = new Hono<{ Bindings: Bindings }>();

telegram.post('/', async c => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || !c.env.TELEGRAM_BOT_TOKEN) return c.text('Not configured', 503);
  if (!safeEqual(c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '', secret)) return c.text('Unauthorized', 401);
  const raw = await c.req.text();
  if (raw.length > 65_536) return c.text('Too large', 413);
  let update: { update_id?: number; message?: { message_id?: number; from?: { id?: number; is_bot?: boolean; language_code?: string }; chat?: { id?: number; type?: string }; text?: string } };
  try { update = JSON.parse(raw); } catch { return c.text('Bad request', 400); }
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id! < 0) return c.text('Bad request', 400);
  const message = update.message;
  // Only private, human-authored text enters the buyer workflow.
  if (!message || message.chat?.type !== 'private' || message.from?.is_bot || !Number.isSafeInteger(message.chat.id) || message.chat.id! <= 0 || message.from?.id !== message.chat.id || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 2000) return c.text('OK');
  const db = c.env.DB;
  const eventId = String(update.update_id);
  const hash = await sha256(raw);
  const previous = await db.prepare("SELECT payload_hash FROM webhook_events WHERE provider='telegram' AND event_id=?").bind(eventId).first<{ payload_hash: string }>();
  if (previous && previous.payload_hash !== hash) return c.text('Conflicting update', 409);
  const timestamp = new Date().toISOString();
  const conversationId = `tgconv_${message.chat.id}`;
  const recipient = `tg:${message.chat.id}`;
  const externalId = `tgupdate:${eventId}`;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO conversations (id,wa_id,locale,status,intent_stage,lead_score,channel,transport,created_at,updated_at) VALUES (?, ?, ?, 'active','new',0,'whatsapp','telegram',?,?)").bind(conversationId,recipient,resolveLocale(message.from?.language_code),timestamp,timestamp),
    db.prepare("INSERT OR IGNORE INTO messages (id,conversation_id,direction,sender_type,body,message_type,external_message_id,delivery_status,metadata_json,created_at) VALUES (?,?,'inbound','buyer',?,'text',?,'received',?,?)").bind(`tgmsg_in_${eventId}`,conversationId,message.text.trim(),externalId,JSON.stringify({ provider:'telegram', updateId:update.update_id }),timestamp),
    db.prepare("INSERT OR IGNORE INTO conversation_jobs (external_message_id,conversation_id,status,next_attempt_at,created_at,updated_at) VALUES (?,?,'pending',?,?,?)").bind(externalId,conversationId,timestamp,timestamp,timestamp),
    db.prepare("INSERT OR IGNORE INTO webhook_events (provider,event_id,payload_hash,status,created_at,processed_at) VALUES ('telegram',?,?,'processed',?,?)").bind(eventId,hash,timestamp,timestamp),
    db.prepare('UPDATE conversations SET last_message_at=?,updated_at=? WHERE id=?').bind(timestamp,timestamp,conversationId)
  ]);
  // HTTP success means durably accepted; job/delivery state is tracked separately.
  c.executionCtx.waitUntil(processConversationJobs(c.env));
  return c.text('OK');
});
export default telegram;
