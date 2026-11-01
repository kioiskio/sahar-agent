import { HTTPException } from 'hono/http-exception';
import { now } from '../db/repository';
import type { Order } from '../types';
import { PayPalPaymentProvider } from '../lib/paypal';
import type { PayPalCaptureResult, PayPalEnvironment } from '../lib/paypal';
import { safeEqual, sha256 } from '../lib/security';
import { paymentConfirmationStatements } from './deliveries';

export type PaymentEnvironment = PayPalEnvironment & { DB: D1Database };

export async function verifyOrderAccess(order: Order, token: string | undefined): Promise<void> {
  if (!order.access_token_hash || !token || !safeEqual(order.access_token_hash, await sha256(token))) throw new HTTPException(404, { message: 'Checkout not found' });
}

export async function acceptOrderTerms(db: D1Database, orderId: string, mock: boolean): Promise<Order> {
  const timestamp = now();
  const result = await db.prepare("UPDATE deposit_orders SET terms_accepted_at = COALESCE(terms_accepted_at, ?), updated_at = ? WHERE id = ? AND provider = ? AND status = 'pending_payment'").bind(timestamp, timestamp, orderId, mock ? 'mock' : 'paypal').run();
  if (!result.meta.changes) throw new HTTPException(409, { message: 'Only pending orders can accept terms' });
  const order = await db.prepare('SELECT * FROM deposit_orders WHERE id = ?').bind(orderId).first<Order>();
  if (!order) throw new HTTPException(404, { message: 'Order not found' });
  return order;
}

function validateCapture(order: Order, capture: PayPalCaptureResult): string {
  if (capture.status !== 'COMPLETED') throw new Error('PayPal capture has not completed');
  const matches = capture.captures.filter(item => item.custom_id === order.id && item.status === 'COMPLETED' && item.amount.currency_code === order.currency && Math.round(Number(item.amount.value) * 100) === order.amount_cents);
  if (matches.length !== 1) throw new Error('PayPal capture amount, currency or order reference does not match');
  return matches[0].id;
}

export async function captureOrder(env: PaymentEnvironment, order: Order): Promise<Order> {
  if (order.provider !== 'paypal' || !order.paypal_order_id || !order.terms_accepted_at) throw new HTTPException(409, { message: 'Terms must be accepted before payment capture' });
  if (order.status === 'paid') return order;
  if (order.status !== 'pending_payment') throw new HTTPException(409, { message: 'Only pending orders can be captured' });
  const claimed = await dbClaim(env.DB, order.id);
  if (!claimed) throw new HTTPException(409, { message: 'Payment is already processing' });
  try {
    const capture = await new PayPalPaymentProvider(env).captureDepositOrder(order.paypal_order_id);
    const captureId = validateCapture(order, capture);
    return await markOrderPaid(env.DB, order, captureId);
  } catch (error) {
    await env.DB.prepare("UPDATE deposit_orders SET status = 'pending_payment', updated_at = ? WHERE id = ? AND status = 'processing'").bind(now(), order.id).run();
    throw error;
  }
}

async function dbClaim(db: D1Database, orderId: string): Promise<boolean> {
  const result = await db.prepare("UPDATE deposit_orders SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending_payment' AND terms_accepted_at IS NOT NULL").bind(now(), orderId).run();
  return Boolean(result.meta.changes);
}

export async function markOrderPaid(db: D1Database, order: Order, captureId: string): Promise<Order> {
  const timestamp = now();
  if (order.provider_capture_id) {
    if (order.provider_capture_id !== captureId) throw new Error('Payment capture ID does not match the order');
    return order;
  }
  const conversation = await db.prepare('SELECT locale FROM conversations WHERE id = ?').bind(order.conversation_id).first<{ locale: string }>();
  if (!conversation) throw new Error('Payment conversation is missing');
  await db.batch([
    db.prepare("UPDATE deposit_orders SET status = 'paid', provider_capture_id = ?, paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ? AND status IN ('pending_payment', 'processing') AND terms_accepted_at IS NOT NULL AND provider_capture_id IS NULL").bind(captureId, timestamp, timestamp, order.id),
    db.prepare("UPDATE conversations SET intent_stage = 'paid', lead_score = 100, status = 'handoff', handoff_requested_at = COALESCE(handoff_requested_at, ?), updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM deposit_orders WHERE id = ? AND status = 'paid' AND provider_capture_id = ?)").bind(timestamp, timestamp, order.conversation_id, order.id, captureId),
    ...paymentConfirmationStatements(db, order, captureId, conversation.locale, timestamp)
  ]);
  const saved = await db.prepare('SELECT * FROM deposit_orders WHERE id = ?').bind(order.id).first<Order>();
  if (!saved || saved.status !== 'paid' || saved.provider_capture_id !== captureId) throw new Error('Payment confirmation could not be saved');
  return saved;
}
