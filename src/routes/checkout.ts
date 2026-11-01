import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings } from '../index';
import type { Order } from '../types';
import { resolveLocale, type Locale } from '../i18n/locales';
import { verifyOrderAccess, acceptOrderTerms, captureOrder } from '../services/payments';
import { ensureCheckoutApproval } from '../services/checkout-approval';
import { assertSameOrigin } from '../lib/session';
import en from '../../web/messages/en';
import zhCN from '../../web/messages/zh-CN';
import zhTW from '../../web/messages/zh-TW';
import fr from '../../web/messages/fr';
import de from '../../web/messages/de';
import ar from '../../web/messages/ar';

const checkout = new Hono<{ Bindings: Bindings }>();
const translations = { en, 'zh-CN': zhCN, 'zh-TW': zhTW, fr, de, ar };
type Checkout = Order & { title: string; area: string; terms: string; locale: string };
const notices: Record<Locale, { cancelled: string; returned: string; pending: string; error: string }> = {
  en: { cancelled: 'Checkout was cancelled. Payment has not been confirmed. You can try again or return to the conversation.', returned: 'You have returned from PayPal. If you approved the payment, complete it below.', pending: 'Payment has not been confirmed. You can continue to PayPal or return to the conversation.', error: 'We could not confirm this request. Check the order status before trying again.' },
  'zh-CN': { cancelled: '已取消本次结账，尚未确认付款。你可以重试或返回对话。', returned: '你已从 PayPal 返回。如果已批准付款，请在下方完成付款。', pending: '尚未确认付款。你可以继续前往 PayPal，也可以返回对话。', error: '暂时无法确认此请求。请先查看订单状态，再决定是否重试。' },
  'zh-TW': { cancelled: '已取消本次結帳，尚未確認付款。你可以重試或返回對話。', returned: '你已從 PayPal 返回。如果已批准付款，請在下方完成付款。', pending: '尚未確認付款。你可以繼續前往 PayPal，也可以返回對話。', error: '暫時無法確認此請求。請先查看訂單狀態，再決定是否重試。' },
  fr: { cancelled: 'Le paiement a été annulé et n’est pas confirmé. Vous pouvez réessayer ou revenir à la conversation.', returned: 'Vous êtes de retour de PayPal. Si vous avez approuvé le paiement, finalisez-le ci-dessous.', pending: 'Le paiement n’est pas confirmé. Continuez vers PayPal ou revenez à la conversation.', error: 'Cette demande n’a pas pu être confirmée. Vérifiez le statut avant de réessayer.' },
  de: { cancelled: 'Der Checkout wurde abgebrochen. Die Zahlung ist nicht bestätigt. Sie können es erneut versuchen oder zum Gespräch zurückkehren.', returned: 'Sie sind von PayPal zurückgekehrt. Falls Sie die Zahlung genehmigt haben, schließen Sie sie unten ab.', pending: 'Die Zahlung ist nicht bestätigt. Fahren Sie mit PayPal fort oder kehren Sie zum Gespräch zurück.', error: 'Die Anfrage konnte nicht bestätigt werden. Prüfen Sie vor einem erneuten Versuch den Status.' },
  ar: { cancelled: 'تم إلغاء عملية الدفع ولم يتم تأكيدها. يمكنك المحاولة مجدداً أو العودة للمحادثة.', returned: 'عدت من PayPal. إذا وافقت على الدفع، أكمل العملية أدناه.', pending: 'لم يتم تأكيد الدفع. يمكنك المتابعة إلى PayPal أو العودة للمحادثة.', error: 'تعذر تأكيد هذا الطلب. تحقق من حالة الطلب قبل المحاولة مجدداً.' }
};
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const safeReturn = (value: unknown): string | null => typeof value === 'string' && (['/workspace', '/admin', '/console/orders', '/console/overview', '/console/conversations', '/console/listings', '/console/settings'].includes(value) || /^\/workspace\/[A-Za-z0-9_-]{1,120}$/.test(value)) ? value : null;

function page(content: string, locale: Locale = 'en', refresh?: string): string {
  return `<!doctype html><html lang="${esc(locale)}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><title>Sahar · PayPal checkout</title>${refresh ? `<meta http-equiv="refresh" content="3;url=${esc(refresh)}">` : ''}<style>
*{box-sizing:border-box}body{margin:0;background:#f6f8f5;color:#1c2d27;font:16px/1.6 Inter,"Segoe UI",Arial,sans-serif}.checkout-shell{min-height:100dvh;display:grid;place-items:center;padding:32px 16px}.checkout-panel{width:min(600px,100%);padding:32px;border:1px solid #e5e9e3;border-radius:20px;background:#fff;box-shadow:0 16px 50px #173f3508}.checkout-brand{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e9ede7;padding-bottom:24px;margin-bottom:28px}.brand{color:#173f35;text-decoration:none;font-size:28px;font-weight:750;letter-spacing:-1px}.brand b{color:#de7948}.provider{color:#1677ff;background:#e6f4ff;font-size:13px;padding:3px 10px;border-radius:8px}h1{font-size:24px;line-height:1.3;margin:0 0 8px}.area,.label{color:#718279}.area{margin:0 0 24px}.amount{font-size:42px;line-height:1.25;font-weight:650;letter-spacing:-1px;margin:12px 0 20px}.status{display:inline-block;border-radius:6px;background:#fff7df;color:#946500;padding:2px 9px;font-size:13px;margin-bottom:20px}.status.paid{background:#f6ffed;color:#389e0d}.notice{background:#fffaf0;border:1px solid #f0e5ce;border-radius:12px;padding:14px 16px;margin:0 0 20px;white-space:pre-wrap;overflow-wrap:anywhere}.info{background:#f5f9f6;border-color:#dce8df}.error{background:#fff2f0;border-color:#ffccc7}.agreement{display:flex;gap:10px;align-items:flex-start;margin:18px 0;color:#1c2d27}.agreement input{flex:none;accent-color:#276749;width:20px;height:20px;margin:3px 0}button,.back{display:flex;justify-content:center;align-items:center;width:100%;min-height:46px;padding:10px 16px;border-radius:12px;font:inherit;font-weight:600;line-height:1.4;text-decoration:none;text-align:center;cursor:pointer}button{border:1px solid #276749;color:#fff;background:#276749}button:hover{background:#20563c}button:disabled{background:#f4f4f4;color:#93a096;border-color:#d9dfd9;cursor:default}.back{border:1px solid #dce3dd;color:#173f35;background:white;margin-top:18px;font-weight:500}.back:hover{background:#f5f9f6}:focus-visible{outline:3px solid #93b9a1;outline-offset:3px}.summary{margin:0 0 18px;color:#65756e}@media(max-width:480px){.checkout-shell{padding:16px 12px;align-items:start}.checkout-panel{padding:24px 20px}h1{font-size:22px}.amount{font-size:38px}}
</style></head><body><main class="checkout-shell"><section class="checkout-panel">${content}</section></main></body></html>`;
}

async function readOrder(env: Bindings, id: string, token: string): Promise<Checkout> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HTTPException(404, { message: 'Checkout not found' });
  const order = await env.DB.prepare("SELECT o.*, l.title, l.area, c.locale, s.deposit_terms AS terms FROM deposit_orders o JOIN conversations c ON c.id=o.conversation_id JOIN listings l ON l.id=o.listing_id CROSS JOIN workspace_settings s WHERE o.id=? AND o.provider='paypal'").bind(id).first<Checkout>();
  if (!order || order.wa_id.startsWith('demo-') || (order.wa_id.startsWith('sandbox-') && env.PAYPAL_MODE !== 'sandbox')) throw new HTTPException(404, { message: 'Checkout not found' });
  await verifyOrderAccess(order, token);
  return order;
}

function selfUrl(id: string, token: string, destination: string, returned = false): string {
  const params = new URLSearchParams({ access_token: token, return_to: destination });
  if (returned) params.set('payment_return', '1');
  return `/checkout/${encodeURIComponent(id)}?${params}`;
}

function render(order: Checkout, token: string, destination: string, params: URLSearchParams, error?: string): string {
  const locale = resolveLocale(order.locale), messages = translations[locale], ui = messages.ui;
  const paid = order.status === 'paid', processing = order.status === 'processing';
  const returned = params.get('payment_return') === '1', cancelled = params.get('payment_cancelled') === '1';
  const canPay = order.status === 'pending_payment';
  const state = paid ? ui.statusPaid : processing ? ui.statusProcessing : canPay ? ui.statusPending : order.status;
  const url = selfUrl(order.id, token, destination, returned);
  const attempts = Math.max(0, Math.min(10, Number(params.get('sync')) || 0));
  let refresh: string | undefined;
  if (processing && attempts < 10) refresh = url + '&sync=' + (attempts + 1);
  const back = destination === '/console/orders' ? messages.account.backToOrders : destination.startsWith('/console/') ? messages.account.backToAgentWorkspace : messages.account.backToChat;
  const content = `<header class="checkout-brand"><a class="brand" href="/">sahar<b>.</b></a><span class="provider">PayPal</span></header><h1>${esc(order.title)}</h1><p class="area">${esc(order.area)}</p><div class="label">${esc(messages.console.deposit)}</div><div class="amount">${esc(new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(order.amount_cents / 100))}</div><span class="status ${paid ? 'paid' : ''}">${esc(state)}</span>${order.terms ? `<div class="notice">${esc(order.terms)}</div>` : ''}${error ? `<div class="notice error" role="alert">${esc(error)}</div>` : ''}${!paid ? `<p class="summary">${esc(cancelled ? notices[locale].cancelled : returned ? notices[locale].returned : notices[locale].pending)}</p>` : ''}${canPay ? `<form method="post" action="/checkout/${esc(order.id)}/${returned ? 'capture' : 'continue'}"><input type="hidden" name="access_token" value="${esc(token)}"><input type="hidden" name="return_to" value="${esc(destination)}">${!returned || !order.terms_accepted_at ? `<label class="agreement"><input type="checkbox" name="accepted" value="yes" required><span>${esc(ui.depositAgreementReal)}</span></label>` : ''}<button type="submit">${esc(returned ? ui.capturePayment : ui.continueToPaypal)}</button></form>` : `<button disabled>${esc(state)}</button>`}${processing || error ? `<a class="back" href="${esc(url)}">${esc(ui.refresh)}</a>` : ''}<a class="back" href="${esc(destination)}">← ${esc(back)}</a>`;
  return page(content, locale, refresh);
}

checkout.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('Referrer-Policy', 'same-origin');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  if (c.req.raw.body) {
    const headers = new Headers(c.req.raw.headers); headers.delete('content-length');
    c.req.raw = new Request(c.req.raw, { headers });
  }
  return bodyLimit({ maxSize: 8192 })(c, next);
});

checkout.get('/:id', async (c, next) => {
  const params = new URL(c.req.url).searchParams;
  const token = params.get('access_token') ?? params.get('token');
  // Scripted mock checkout remains separate from real PayPal checkout.
  if (!token) {
    const demo = await c.env.DB.prepare("SELECT id FROM deposit_orders WHERE id=? AND provider='mock' AND wa_id LIKE 'demo-%'").bind(c.req.param('id')).first();
    if (demo) return next();
    throw new HTTPException(404, { message: 'Checkout not found' });
  }
  const order = await readOrder(c.env, c.req.param('id'), token);
  const cookie = c.req.header('Cookie')?.match(/(?:^|;\s*)sahar_checkout_return=([^;]*)/)?.[1];
  let remembered: string | null = null;
  try { remembered = safeReturn(decodeURIComponent(cookie ?? '')); } catch { /* Invalid cookies are ignored. */ }
  const destination = safeReturn(params.get('return_to')) ?? remembered ?? '/workspace';
  if (safeReturn(params.get('return_to'))) c.header('Set-Cookie', `sahar_checkout_return=${encodeURIComponent(destination)}; Path=/checkout/${encodeURIComponent(order.id)}; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`);
  return c.html(render(order, token, destination, params));
});

checkout.post('/:id/:operation', async c => {
  assertSameOrigin(c.req.url, c.req.header('Origin'));
  const operation = c.req.param('operation');
  if (!['continue', 'capture'].includes(operation)) throw new HTTPException(404, { message: 'Checkout action not found' });
  const body = await c.req.parseBody();
  const token = typeof body.access_token === 'string' ? body.access_token : '';
  const order = await readOrder(c.env, c.req.param('id'), token);
  const destination = safeReturn(body.return_to) ?? '/workspace';
  const url = selfUrl(order.id, token, destination, operation === 'capture');
  if (order.status === 'paid' || order.status === 'processing') return c.redirect(url, 303);
  if (order.status !== 'pending_payment') throw new HTTPException(409, { message: 'Only pending orders can be paid' });
  if ((operation === 'continue' || !order.terms_accepted_at) && body.accepted !== 'yes') return c.html(render(order, token, destination, new URLSearchParams(operation === 'capture' ? 'payment_return=1' : ''), translations[resolveLocale(order.locale)].ui.depositAgreementReal), 400);
  try {
    if (operation === 'capture') {
      if (!order.terms_accepted_at) await acceptOrderTerms(c.env.DB, order.id, false);
      const current = await readOrder(c.env, order.id, token);
      await captureOrder(c.env, current);
      return c.redirect(url, 303);
    }
    const ready = await ensureCheckoutApproval(c.env, order, token);
    const target = new URL(ready.approval_url ?? '');
    const allowedHosts = c.env.PAYPAL_MODE === 'sandbox' ? ['www.sandbox.paypal.com', 'sandbox.paypal.com'] : c.env.PAYPAL_MODE === 'live' ? ['www.paypal.com', 'paypal.com'] : [];
    if (target.protocol !== 'https:' || target.username || target.password || !allowedHosts.includes(target.hostname)) throw new Error('Invalid payment approval URL');
    await acceptOrderTerms(c.env.DB, order.id, false);
    return c.redirect(target.href, 303);
  } catch {
    const current = await readOrder(c.env, order.id, token);
    if (current.status === 'paid') return c.redirect(url, 303);
    return c.html(render(current, token, destination, new URLSearchParams(operation === 'capture' ? 'payment_return=1' : ''), notices[resolveLocale(order.locale)].error), 502);
  }
});

checkout.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 503;
  const message = status === 404 ? 'Checkout not found. Please reopen the original checkout link.' : status === 403 ? 'This request could not be verified. Reopen the checkout link and try again.' : 'Checkout is temporarily unavailable. Please try again.';
  return c.html(page(`<header class="checkout-brand"><a class="brand" href="/">sahar<b>.</b></a></header><h1>Checkout</h1><div class="notice error" role="alert">${esc(message)}</div><a class="back" href="/workspace">Back to chat</a>`), status);
});

export default checkout;
