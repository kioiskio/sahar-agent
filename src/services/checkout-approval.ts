import { HTTPException } from 'hono/http-exception';
import { PayPalPaymentProvider, PayPalRequestError, type PayPalEnvironment } from '../lib/paypal';
import type { Order } from '../types';

// Refresh only an order that PayPal confirms no longer exists. Never replace an
// approved or completed payment based on age, a timeout, or an unavailable API.
export async function ensureCheckoutApproval(env: PayPalEnvironment & { DB: D1Database; APP_BASE_URL?: string }, order: Order, token: string): Promise<Order> {
  if (order.provider !== 'paypal' || !order.paypal_order_id || order.status !== 'pending_payment') return order;
  const claim = await env.DB.prepare("UPDATE deposit_orders SET status='processing',updated_at=? WHERE id=? AND status='pending_payment' AND paypal_order_id=? AND provider_capture_id IS NULL")
    .bind(new Date().toISOString(), order.id, order.paypal_order_id).run();
  if (!claim.meta.changes) throw new HTTPException(409, { message: 'Checkout is already processing. Please refresh shortly.' });
  try {
    const provider = new PayPalPaymentProvider(env);
    let missing = false;
    try { await provider.getOrder(order.paypal_order_id); }
    catch (error) { if (error instanceof PayPalRequestError && error.status === 404) missing = true; else throw error; }
    if (missing) {
      const origin = new URL(env.APP_BASE_URL ?? '');
      if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('A valid HTTPS APP_BASE_URL is required');
      const checkout = new URL(`/checkout/${encodeURIComponent(order.id)}`, origin);
      checkout.searchParams.set('access_token', token);
      const returnUrl = new URL(checkout); returnUrl.searchParams.set('payment_return', '1');
      const cancelUrl = new URL(checkout); cancelUrl.searchParams.set('payment_cancelled', '1');
      const replacement = await provider.createDepositOrder({
        orderId: order.id, amountCents: order.amount_cents, currency: order.currency,
        requestKey: `renew-${order.id}-${order.paypal_order_id}`,
        returnUrl: returnUrl.href, cancelUrl: cancelUrl.href
      });
      await env.DB.prepare("UPDATE deposit_orders SET paypal_order_id=?,approval_url=?,updated_at=? WHERE id=? AND status='processing' AND paypal_order_id=? AND provider_capture_id IS NULL")
        .bind(replacement.providerOrderId, replacement.approvalUrl, new Date().toISOString(), order.id, order.paypal_order_id).run();
    }
  } finally {
    await env.DB.prepare("UPDATE deposit_orders SET status='pending_payment',updated_at=? WHERE id=? AND status='processing' AND provider_capture_id IS NULL")
      .bind(new Date().toISOString(), order.id).run();
  }
  const saved = await env.DB.prepare('SELECT * FROM deposit_orders WHERE id=?').bind(order.id).first<Order>();
  if (!saved) throw new Error('Checkout no longer exists');
  return saved;
}
