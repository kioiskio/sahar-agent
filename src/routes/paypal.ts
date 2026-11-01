import { Hono } from 'hono';
import type { Bindings } from '../index';
import { verifyPayPalWebhook } from '../lib/paypal';
import type { PayPalCaptureDetails, PayPalWebhookEvent } from '../lib/paypal';
import { markOrderPaid } from '../services/payments';
import type { Order } from '../types';
import { now } from '../db/repository';

const paypal = new Hono<{ Bindings: Bindings }>();

paypal.post('/', async c => {
  if (!['sandbox', 'live'].includes(c.env.PAYPAL_MODE ?? '')) return c.text('Not found', 404);
  const rawBody = await c.req.text();
  let event: PayPalWebhookEvent;
  try { event = JSON.parse(rawBody) as PayPalWebhookEvent; } catch { return c.text('Bad request', 400); }
  if (!event.id || !event.event_type || !event.resource || typeof event.resource !== 'object') return c.text('Bad request', 400);
  try { await verifyPayPalWebhook(c.env, c.req.raw.headers, rawBody, event); } catch { return c.text('Unauthorized', 401); }

  const claimedAt = now();
  const staleAt = new Date(Date.now() - 120_000).toISOString();
  const claim = await c.env.DB.prepare("INSERT INTO webhook_events (provider, event_id, event_type, status, created_at, processing_lock_at) VALUES ('paypal', ?, ?, 'processing', ?, ?) ON CONFLICT(provider, event_id) DO UPDATE SET status = 'processing', processing_lock_at = excluded.processing_lock_at, processing_error = NULL WHERE webhook_events.status = 'failed' OR (webhook_events.status = 'processing' AND (webhook_events.processing_lock_at IS NULL OR webhook_events.processing_lock_at < ?))").bind(event.id, event.event_type, claimedAt, claimedAt, staleAt).run();
  if (!claim.meta.changes) {
    const previous = await c.env.DB.prepare("SELECT status FROM webhook_events WHERE provider = 'paypal' AND event_id = ?").bind(event.id).first<{ status: string }>();
    return previous?.status === 'processed' ? c.text('OK') : c.text('Service unavailable', 503);
  }
  try {
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event.resource as PayPalCaptureDetails;
      const providerOrderId = capture.supplementary_data?.related_ids?.order_id;
      if (!capture.id || (!capture.custom_id && !providerOrderId)) throw new Error('Capture reference is missing');
      const order = capture.custom_id
        ? await c.env.DB.prepare("SELECT * FROM deposit_orders WHERE id = ? AND provider = 'paypal'").bind(capture.custom_id).first<Order>()
        : await c.env.DB.prepare("SELECT * FROM deposit_orders WHERE paypal_order_id = ? AND provider = 'paypal'").bind(providerOrderId).first<Order>();
      if (!order || (providerOrderId && order.paypal_order_id !== providerOrderId) || order.currency !== capture.amount.currency_code || Math.round(Number(capture.amount.value) * 100) !== order.amount_cents || capture.status !== 'COMPLETED') throw new Error('Capture does not match the order');
      if (order.wa_id.startsWith('sandbox-') && c.env.PAYPAL_MODE !== 'sandbox') throw new Error('Sandbox order cannot receive live payment events');
      await markOrderPaid(c.env.DB, order, capture.id);
    } else if (event.event_type === 'PAYMENT.CAPTURE.DENIED') {
      const capture = event.resource as PayPalCaptureDetails;
      if (capture.custom_id) await c.env.DB.prepare("UPDATE deposit_orders SET status = 'failed', updated_at = ? WHERE id = ? AND provider = 'paypal' AND status IN ('pending_payment', 'processing')").bind(now(), capture.custom_id).run();
    } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      const capture = event.resource as { status?: string; supplementary_data?: { related_ids?: { capture_id?: string } }; links?: Array<{ rel?: string; href?: string }>; amount?: { value?: string; currency_code?: string } };
      let captureId = capture.supplementary_data?.related_ids?.capture_id;
      const parent = capture.links?.find(link => link.rel === 'up')?.href;
      if (!captureId && parent) {
        const url = new URL(parent);
        if (url.protocol === 'https:' && ['api.paypal.com', 'api-m.paypal.com', 'api.sandbox.paypal.com', 'api-m.sandbox.paypal.com'].includes(url.hostname)) captureId = url.pathname.match(/^\/v2\/payments\/captures\/([A-Za-z0-9-]+)$/)?.[1];
      }
      const order = captureId ? await c.env.DB.prepare("SELECT * FROM deposit_orders WHERE provider_capture_id = ? AND provider = 'paypal'").bind(captureId).first<Order>() : null;
      if (!order || capture.status !== 'COMPLETED' || capture.amount?.currency_code !== order.currency || Math.round(Number(capture.amount.value) * 100) !== order.amount_cents) throw new Error('Refund does not match the captured order');
      await c.env.DB.prepare("UPDATE deposit_orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status = 'paid'").bind(now(), order.id).run();
    }
    await c.env.DB.prepare("UPDATE webhook_events SET status = 'processed', processed_at = ? WHERE provider = 'paypal' AND event_id = ?").bind(now(), event.id).run();
    return c.text('OK');
  } catch (error) {
    await c.env.DB.prepare("UPDATE webhook_events SET status = 'failed', processing_error = ?, processed_at = ? WHERE provider = 'paypal' AND event_id = ?").bind(error instanceof Error ? error.message.slice(0, 300) : 'Payment event failed', now(), event.id).run();
    return c.text('Service unavailable', 503);
  }
});
export default paypal;
