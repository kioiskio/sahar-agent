import { HTTPException } from 'hono/http-exception';
import type { ConversationEnvironment, ConversationMessageInput } from './conversation';
import { processConversationMessage } from './conversation';
import { now } from '../db/repository';
import type { Order } from '../types';
import { acceptOrderTerms } from './payments';

export async function processDemoMessage(db: D1Database, conversationId: string, text: string) {
  const conversation = await db.prepare("SELECT id FROM conversations WHERE id = ? AND wa_id LIKE 'demo-%'").bind(conversationId).first();
  if (!conversation) throw new HTTPException(404, { message: 'Demo conversation not found' });
  return processConversationMessage(db, { CHANNEL_MODE: 'mock', PAYPAL_MODE: 'mock', AI_PROVIDER: 'rules' }, { conversationId, text } satisfies ConversationMessageInput);
}

export async function completeMockOrder(db: D1Database, orderId: string, accepted: boolean): Promise<Order | null> {
  if (!accepted) throw new HTTPException(400, { message: 'You must accept the demonstration terms' });
  const order = await db.prepare("SELECT deposit_orders.* FROM deposit_orders JOIN conversations ON conversations.id = deposit_orders.conversation_id WHERE deposit_orders.id = ? AND provider = 'mock' AND conversations.wa_id LIKE 'demo-%'").bind(orderId).first<Order>();
  if (!order) throw new HTTPException(404, { message: 'Demo order not found' });
  if (order.status === 'paid') return order;
  await acceptOrderTerms(db, orderId, true);
  const timestamp = now();
  const updated = await db.prepare("UPDATE deposit_orders SET status = 'paid', provider_capture_id = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending_payment' AND terms_accepted_at IS NOT NULL").bind('MOCK-CAPTURE-' + orderId, timestamp, timestamp, orderId).run();
  if (updated.meta.changes) {
    const locale = await db.prepare('SELECT locale FROM conversations WHERE id = ?').bind(order.conversation_id).first<string>('locale');
    const confirmation = locale === 'ar'
      ? 'اكتمل الدفع التجريبي. لم تُعالج أي دفعة حقيقية. يمكن للوكيل الآن تولي المتابعة.'
      : 'Demo payment completed. No real payment was processed. An agent can now take over.';
    await db.batch([
      db.prepare("UPDATE conversations SET intent_stage = 'paid', lead_score = 100, status = 'handoff', handoff_requested_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, timestamp, order.conversation_id),
      db.prepare("INSERT INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, metadata_json, created_at) VALUES (?, ?, 'outbound', 'system', ?, 'payment_confirmation', 'simulated', ?, ?)").bind('msg_' + crypto.randomUUID(), order.conversation_id, confirmation, JSON.stringify({ orderId, captureId: 'MOCK-CAPTURE-' + orderId }), timestamp)
    ]);
  }
  return db.prepare('SELECT * FROM deposit_orders WHERE id = ?').bind(orderId).first<Order>();
}

export type { ConversationEnvironment };
