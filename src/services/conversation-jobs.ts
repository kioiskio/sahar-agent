import type { Conversation, WorkspaceSettings } from '../types';
import { hashWhatsAppPayload } from '../lib/whatsapp';
import type { WhatsAppEnv } from '../lib/whatsapp';
import { processConversationMessage } from './conversation';
import type { ConversationEnvironment } from './conversation';
import { processWhatsAppRetries } from './deliveries';
import { addServiceNotice } from './service-notice';
import { AiProviderError } from '../lib/ai';
import { consumeRateLimit } from '../lib/rate-limit';

export type WhatsAppServiceEnv = WhatsAppEnv & ConversationEnvironment & { DB: D1Database };

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } }>;
        statuses?: Array<{ id?: string; status?: string; timestamp?: string; recipient_id?: string }>;
      };
    }>;
  }>;
};

type WorkItem =
  | { kind: 'message'; key: string; id: string; from: string; body: string; timestamp: string }
  | { kind: 'status'; key: string; id: string; status: string; timestamp: string; recipientId?: string };

const PROVIDER = 'whatsapp';
const timestamp = () => new Date().toISOString();
const identifier = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getWhatsAppWorkItems(payload: WhatsAppWebhookPayload): WorkItem[] {
  const items: WorkItem[] = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value;
      if (!value) continue;
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const id = asString(message.id);
        const from = asString(message.from);
        const body = asString(message.text?.body);
        if (message.type !== 'text' || !id || !from || !body || id.length > 255 || from.length > 100 || body.length > 2000) continue;
        items.push({ kind: 'message', key: `message:${id}`, id, from, body, timestamp: asString(message.timestamp) ?? '' });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const id = asString(status.id);
        const statusValue = asString(status.status);
        if (!id || !statusValue || !['sent', 'delivered', 'read', 'failed'].includes(statusValue)) continue;
        items.push({ kind: 'status', key: `status:${id}:${statusValue}`, id, status: statusValue, timestamp: asString(status.timestamp) ?? '', recipientId: asString(status.recipient_id) });
      }
    }
  }
  return items;
}

async function markEvent(db: D1Database, eventId: string, status: 'processed' | 'failed', error?: string): Promise<void> {
  await db.prepare('UPDATE webhook_events SET status = ?, processing_error = ?, processed_at = ?, processing_lock_at = NULL WHERE provider = ? AND event_id = ?').bind(status, error ?? null, timestamp(), PROVIDER, eventId).run();
}

async function persistMessage(db: D1Database, item: Extract<WorkItem, { kind: 'message' }>): Promise<void> {
  const settings = await db.prepare('SELECT * FROM workspace_settings WHERE id = 1').first<WorkspaceSettings>();
  if (!settings) throw new Error('Workspace settings are not configured');
  const receivedAt = timestamp();
  let conversation = await db.prepare("SELECT * FROM conversations WHERE wa_id = ? AND channel = 'whatsapp'").bind(item.from).first<Conversation>();
  if (!conversation) {
    await db.prepare("INSERT INTO conversations (id, wa_id, locale, status, intent_stage, lead_score, channel, created_at, updated_at) VALUES (?, ?, ?, 'active', 'new', 0, 'whatsapp', ?, ?) ON CONFLICT(wa_id) DO NOTHING").bind(identifier('conv'), item.from, settings.default_locale, receivedAt, receivedAt).run();
    conversation = await db.prepare("SELECT * FROM conversations WHERE wa_id = ? AND channel = 'whatsapp'").bind(item.from).first<Conversation>();
  }
  if (!conversation) throw new Error('Could not persist the WhatsApp conversation');
  await db.batch([
    db.prepare("INSERT INTO messages (id, conversation_id, direction, sender_type, body, message_type, external_message_id, delivery_status, metadata_json, created_at) VALUES (?, ?, 'inbound', 'buyer', ?, 'text', ?, 'received', ?, ?) ON CONFLICT(external_message_id) DO NOTHING").bind(identifier('msg'), conversation.id, item.body, item.id, JSON.stringify({ provider: PROVIDER, timestamp: item.timestamp }), receivedAt),
    db.prepare("INSERT INTO conversation_jobs (external_message_id, conversation_id, status, next_attempt_at, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, ?) ON CONFLICT(external_message_id) DO NOTHING").bind(item.id, conversation.id, receivedAt, receivedAt, receivedAt),
    db.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(receivedAt, receivedAt, conversation.id)
  ]);
}

async function persistStatus(db: D1Database, item: Extract<WorkItem, { kind: 'status' }>): Promise<void> {
  await db.batch([
    db.prepare('UPDATE messages SET delivery_status = ? WHERE external_message_id = ?').bind(item.status, item.id),
    db.prepare('UPDATE outbound_deliveries SET status = ?, updated_at = ? WHERE external_message_id = ?').bind(item.status, timestamp(), item.id)
  ]);
}

export async function acceptWhatsAppWebhook(env: WhatsAppServiceEnv, payload: WhatsAppWebhookPayload, rawBody: ArrayBuffer, eventId?: string) {
  const db = env.DB;
  const items = Array.from(new Map(getWhatsAppWorkItems(payload).map(item => [item.key, item])).values());
  const payloadHash = await hashWhatsAppPayload(rawBody);
  const providerEventId = eventId?.trim() || `payload:${payloadHash}`;
  const claimedAt = timestamp();
  const staleAt = new Date(Date.now() - 120_000).toISOString();
  const claim = await db.prepare("INSERT INTO webhook_events (provider, event_id, payload_hash, status, created_at, processing_lock_at) VALUES (?, ?, ?, 'processing', ?, ?) ON CONFLICT(provider, event_id) DO UPDATE SET status = 'processing', processing_lock_at = excluded.processing_lock_at, processing_error = NULL WHERE webhook_events.payload_hash = excluded.payload_hash AND (webhook_events.status = 'failed' OR (webhook_events.status = 'processing' AND (webhook_events.processing_lock_at IS NULL OR webhook_events.processing_lock_at < ?)))").bind(PROVIDER, providerEventId, payloadHash, claimedAt, claimedAt, staleAt).run();
  if (!claim.meta.changes) {
    const previous = await db.prepare('SELECT status, payload_hash FROM webhook_events WHERE provider = ? AND event_id = ?').bind(PROVIDER, providerEventId).first<{ status: string; payload_hash: string }>();
    if (previous?.status !== 'processed' || previous.payload_hash !== payloadHash) throw new Error('Webhook is processing or conflicts with a stored event');
    return { duplicate: true, process: async () => undefined };
  }
  try {
    for (const item of items) {
      if (item.kind === 'message') await persistMessage(db, item);
      else await persistStatus(db, item);
    }
  } catch (error) {
    await markEvent(db, providerEventId, 'failed', error instanceof Error ? error.message.slice(0, 500) : 'Webhook persistence failed');
    throw new Error('Could not durably store the WhatsApp webhook');
  }
  return {
    duplicate: false,
    process: async () => {
      try {
        await processConversationJobs(env);
        await markEvent(db, providerEventId, 'processed');
      } catch (error) {
        await markEvent(db, providerEventId, 'failed', error instanceof Error ? error.message.slice(0, 500) : 'Webhook processing failed');
      }
    }
  };
}

type ConversationJob = { external_message_id: string; conversation_id: string; body: string; attempts: number; max_attempts: number };

export async function processConversationJobs(env: WhatsAppServiceEnv): Promise<void> {
  const dueAt = timestamp();
  const staleAt = new Date(Date.now() - 300_000).toISOString();
  await env.DB.prepare("UPDATE conversation_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed' END, next_attempt_at = ?, last_error = 'Processing lease expired', updated_at = ? WHERE status = 'processing' AND updated_at < ?").bind(dueAt, dueAt, staleAt).run();
  const jobs = (await env.DB.prepare("SELECT conversation_jobs.*, messages.body FROM conversation_jobs JOIN messages ON messages.external_message_id = conversation_jobs.external_message_id AND messages.direction = 'inbound' WHERE conversation_jobs.status IN ('pending', 'failed') AND conversation_jobs.attempts < conversation_jobs.max_attempts AND (conversation_jobs.next_attempt_at IS NULL OR conversation_jobs.next_attempt_at <= ?) ORDER BY conversation_jobs.created_at ASC LIMIT 50").bind(dueAt).all<ConversationJob>()).results;
  for (const job of jobs) {
    if (job.body.trim() === '/human') {
      // A customer's handoff request cancels older queued AI work instead of
      // waiting through all of its provider retries. Keep the records for audit.
      await env.DB.prepare("UPDATE conversation_jobs SET status='dead',next_attempt_at=NULL,last_error='Cancelled by customer handoff request',updated_at=? WHERE conversation_id=? AND external_message_id<>? AND status IN ('pending','failed')")
        .bind(timestamp(), job.conversation_id, job.external_message_id).run();
    }
    const channel = await env.DB.prepare('SELECT wa_id, transport FROM conversations WHERE id = ?').bind(job.conversation_id).first<{ wa_id: string; transport: string | null }>();
    if (channel?.transport === 'telegram' && !await consumeRateLimit(env.DB, `telegram:${channel.wa_id}`, 30, 60_000)) {
      await env.DB.prepare("UPDATE conversation_jobs SET next_attempt_at = ? WHERE external_message_id = ? AND status IN ('pending', 'failed')").bind(new Date(Date.now() + 60_000).toISOString(), job.external_message_id).run();
      continue;
    }
    const claimedAt = timestamp();
    const claim = await env.DB.prepare("UPDATE conversation_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE external_message_id = ? AND status IN ('pending', 'failed') AND attempts < max_attempts AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND NOT EXISTS (SELECT 1 FROM conversation_jobs AS other WHERE other.conversation_id = conversation_jobs.conversation_id AND (other.status = 'processing' OR (other.created_at < conversation_jobs.created_at AND other.status IN ('pending', 'failed') AND other.attempts < other.max_attempts)))").bind(claimedAt, job.external_message_id, claimedAt).run();
    if (!claim.meta.changes) continue;
    try {
      await processConversationMessage(env.DB, env, { conversationId: job.conversation_id, text: job.body, externalMessageId: job.external_message_id, alreadyPersisted: true });
      await env.DB.prepare("UPDATE conversation_jobs SET status = 'processed', next_attempt_at = NULL, last_error = NULL, updated_at = ? WHERE external_message_id = ?").bind(timestamp(), job.external_message_id).run();
    } catch (error) {
      const exhausted = job.attempts + 1 >= job.max_attempts;
      const nextAttemptAt = exhausted ? null : new Date(Date.now() + 30_000 * 2 ** job.attempts).toISOString();
      const retryAfterMs = error instanceof Error && 'retryAfterMs' in error && typeof error.retryAfterMs === 'number' ? error.retryAfterMs : null;
      await env.DB.prepare('UPDATE conversation_jobs SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE external_message_id = ?').bind(exhausted ? 'dead' : 'failed', retryAfterMs && !exhausted ? new Date(Date.now() + retryAfterMs).toISOString() : nextAttemptAt, error instanceof Error ? error.message.slice(0, 500) : 'Conversation processing failed', timestamp(), job.external_message_id).run();
      if (error instanceof AiProviderError && (job.attempts === 0 || exhausted)) await addServiceNotice(env.DB, job.external_message_id, job.conversation_id, exhausted);
    }
  }
  await processWhatsAppRetries(env.DB, env);
}

export { processWhatsAppRetries } from './deliveries';
