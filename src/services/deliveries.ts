import { createWhatsAppSender, WhatsAppConfigurationError } from '../lib/whatsapp';
import type { WhatsAppEnv } from '../lib/whatsapp';
import { TelegramSender, TelegramDeliveryError, type TelegramEnv } from '../lib/telegram';

const RETRY_BASE_MS = 30_000;

type OutboundDelivery = {
  id: string;
  recipient: string;
  body: string;
  message_id: string;
  attempts: number;
  max_attempts: number;
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'WhatsApp delivery failed';
}

async function sendDelivery(db: D1Database, env: WhatsAppEnv & TelegramEnv, delivery: OutboundDelivery): Promise<boolean> {
  const claimedAt = new Date().toISOString();
  const claim = await db.prepare(
    "UPDATE outbound_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status IN ('pending', 'failed') AND attempts < max_attempts AND (next_attempt_at IS NULL OR next_attempt_at <= ?)"
  ).bind(claimedAt, delivery.id, claimedAt).run();
  if (!claim.meta.changes) return true;

  try {
    const result = delivery.recipient.startsWith('tg:')
      ? { externalMessageId: (await new TelegramSender(env).sendText(delivery.recipient, delivery.body)).id }
      : await createWhatsAppSender(env).sendText(delivery.recipient, delivery.body);
    const sentAt = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE outbound_deliveries SET status = 'sent', external_message_id = ?, last_error = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ? AND status = 'sending'").bind(result.externalMessageId, sentAt, delivery.id),
      db.prepare("UPDATE messages SET delivery_status = 'sent' WHERE id = ?").bind(delivery.message_id)
    ]);
    return true;
  } catch (error) {
    const attempts = delivery.attempts + 1;
    const exhausted = attempts >= delivery.max_attempts || error instanceof WhatsAppConfigurationError || (error instanceof TelegramDeliveryError && error.permanent);
    const retryDelay = error instanceof TelegramDeliveryError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : RETRY_BASE_MS * 2 ** (attempts - 1);
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + retryDelay).toISOString();
    const status = exhausted ? 'dead' : 'failed';
    const failedAt = new Date().toISOString();
    await db.batch([
      db.prepare('UPDATE outbound_deliveries SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?').bind(status, nextAttemptAt, safeError(error), failedAt, delivery.id),
      db.prepare('UPDATE messages SET delivery_status = ? WHERE id = ?').bind(status, delivery.message_id)
    ]);
    return false;
  }
}

export async function processWhatsAppRetries(db: D1Database, env: WhatsAppEnv & TelegramEnv): Promise<void> {
  const dueAt = new Date().toISOString();
  const staleAt = new Date(Date.now() - 300_000).toISOString();
  await db.prepare("UPDATE outbound_deliveries SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed' END, next_attempt_at = ?, last_error = 'Delivery lease expired', updated_at = ? WHERE status = 'sending' AND updated_at < ?").bind(dueAt, dueAt, staleAt).run();
  const deliveries = (await db.prepare(
    "SELECT * FROM outbound_deliveries WHERE status IN ('pending', 'failed') AND attempts < max_attempts AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY next_attempt_at ASC, created_at ASC LIMIT 100"
  ).bind(dueAt).all<OutboundDelivery>()).results;
  for (const delivery of deliveries) await sendDelivery(db, env, delivery);
}

export function paymentConfirmationStatements(db: D1Database, order: { id: string; conversation_id: string; wa_id: string }, captureId: string, locale: string, timestamp: string): D1PreparedStatement[] {
  const copy: Record<string, string> = {
    en: 'Payment confirmed. An authorised agent can now take over.',
    'zh-CN': '付款已确认，授权中介现在可以接手后续流程。',
    'zh-TW': '付款已確認，授權仲介現在可以接手後續流程。',
    fr: 'Paiement confirmé. Un agent autorisé peut maintenant prendre le relais.',
    de: 'Zahlung bestätigt. Ein autorisierter Makler kann jetzt übernehmen.',
    ar: 'تم تأكيد الدفع. يمكن للوكيل المعتمد الآن تولي المتابعة.'
  };
  const demo = order.wa_id.startsWith('demo-');
  const sandbox = order.wa_id.startsWith('sandbox-');
  const demoBody = locale === 'ar'
    ? 'اكتمل الدفع التجريبي. لم تُعالج أي دفعة حقيقية. يمكن للوكيل الآن تولي المتابعة.'
    : 'Demo payment completed. No real payment was processed. An agent can now take over.';
  const sandboxBody = locale === 'ar'
    ? 'تم تأكيد دفع PayPal Sandbox. أموال اختبارية فقط؛ لم تُرسل رسالة Telegram.'
    : 'PayPal Sandbox payment confirmed. Test funds only; no Telegram message was sent.';
  const body = demo ? demoBody : sandbox ? sandboxBody : copy[locale] ?? copy.en;
  const messageId = 'payment_confirmation_' + order.id;
  const deliveryId = 'payment_delivery_' + order.id;
  return [
    db.prepare("INSERT OR IGNORE INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, metadata_json, created_at) SELECT ?, ?, 'outbound', 'system', ?, 'payment_confirmation', ?, ?, ? WHERE EXISTS (SELECT 1 FROM deposit_orders WHERE id = ? AND status = 'paid' AND provider_capture_id = ?)").bind(messageId, order.conversation_id, body, demo ? 'simulated' : sandbox ? 'not_applicable' : 'pending', JSON.stringify({ orderId: order.id, captureId }), timestamp, order.id, captureId),
    ...(demo || sandbox ? [] : [db.prepare("INSERT OR IGNORE INTO outbound_deliveries (id, conversation_id, message_id, recipient, body, status, attempts, max_attempts, next_attempt_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?, ? WHERE EXISTS (SELECT 1 FROM messages WHERE id = ?)").bind(deliveryId, order.conversation_id, messageId, order.wa_id, body, timestamp, timestamp, timestamp, messageId)])
  ];
}
