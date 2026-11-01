import { addMessage, getConversation, getDemoSnapshot, getLatestOrder, getListings, now, id } from '../db/repository';
import { generateAiReply, generateRuleReply } from '../lib/ai';
import type { AiEnvironment } from '../lib/ai';
import { MockPaymentProvider, PayPalPaymentProvider } from '../lib/paypal';
import type { PayPalEnvironment } from '../lib/paypal';
import type { WhatsAppEnv } from '../lib/whatsapp';
import type { TelegramEnv } from '../lib/telegram';
import { sha256 } from '../lib/security';
import { hasExplicitDepositConsent } from '../lib/payment-consent';
import type { Listing, Message, Order } from '../types';
import type { Locale } from '../i18n/locales';

export type ConversationEnvironment = AiEnvironment & PayPalEnvironment & WhatsAppEnv & TelegramEnv & {
  APP_BASE_URL?: string;
};

export type ConversationMessageInput = {
  conversationId: string;
  text: string;
  externalMessageId?: string;
  alreadyPersisted?: boolean;
};

const paidCopy: Record<Locale, string> = {
  en: 'This order is already paid.',
  'zh-CN': '此订单已支付。',
  'zh-TW': '此訂單已付款。',
  fr: 'Cette commande est déjà payée.',
  de: 'Dieser Auftrag ist bereits bezahlt.',
  ar: 'تم دفع هذا الطلب بالفعل.'
};

const checkoutCopy: Record<Locale, (url: string) => string> = {
  en: url => `Your checkout is ready: ${url}`,
  'zh-CN': url => `结账链接已生成：${url}`,
  'zh-TW': url => `結帳連結已產生：${url}`,
  fr: url => `Votre paiement est prêt : ${url}`,
  de: url => `Ihr Checkout ist bereit: ${url}`,
  ar: url => `رابط الدفع جاهز: ${url}`
};

const consentCopy: Record<Locale, string> = {
  en: 'To create a PayPal Sandbox checkout using test funds, first select a listing and reply “confirm deposit”. No funds will be charged without approval on PayPal.',
  'zh-CN': '请先选择房源，再回复“确认定金”以创建 PayPal Sandbox 测试付款。只有在 PayPal 上批准后才会扣除测试资金。',
  'zh-TW': '請先選擇房源，再回覆「確認訂金」以建立 PayPal Sandbox 測試付款。只有在 PayPal 上核准後才會扣除測試資金。',
  fr: 'Sélectionnez un bien, puis répondez « confirmer acompte » pour créer un paiement PayPal Sandbox avec des fonds de test. Aucun débit sans votre approbation sur PayPal.',
  de: 'Wählen Sie zuerst ein Objekt und antworten Sie „Anzahlung bestätigen“, um einen PayPal-Sandbox-Checkout mit Testgeld zu erstellen. Keine Abbuchung ohne Ihre Zustimmung bei PayPal.',
  ar: 'اختر عقاراً أولاً ثم اكتب «تأكيد العربون» لإنشاء دفع PayPal Sandbox بأموال اختبارية. لن تُخصم أموال دون موافقتك على PayPal.'
};

const checkoutReadyCopy: Record<Locale, (listing: Listing) => string> = {
  en: listing => `The ${listing.deposit_currency} ${(listing.deposit_cents / 100).toFixed(2)} intent-deposit checkout for ${listing.title} is ready.

Open the checkout below to review the terms and approve using PayPal Sandbox test funds.

Creating a checkout does not itself charge funds or reserve a real property.`,
  'zh-CN': listing => `${listing.title} 的 ${listing.deposit_currency} ${(listing.deposit_cents / 100).toFixed(2)} 意向金结账已准备好。

请打开下方结账页面，阅读条款，并使用 PayPal Sandbox 测试资金批准付款。

创建结账本身不会扣款，也不代表真实房源已预订。`,
  'zh-TW': listing => `${listing.title} 的 ${listing.deposit_currency} ${(listing.deposit_cents / 100).toFixed(2)} 意向金結帳已準備好。

請開啟下方結帳頁面，閱讀條款，並使用 PayPal Sandbox 測試資金核准付款。

建立結帳本身不會扣款，也不代表真實房源已預訂。`,
  fr: listing => `Le paiement de l’acompte de ${listing.deposit_currency} ${(listing.deposit_cents / 100).toFixed(2)} pour ${listing.title} est prêt.

Ouvrez le lien ci-dessous pour lire les conditions et approuver avec des fonds de test PayPal Sandbox.

Créer ce paiement ne débite aucun fonds et ne réserve aucun bien réel.`,
  de: listing => `Der Checkout für die Anzahlung von ${listing.deposit_currency} ${(listing.deposit_cents / 100).toFixed(2)} für ${listing.title} ist bereit.

Öffnen Sie ihn unten, prüfen Sie die Bedingungen und bestätigen Sie mit PayPal-Sandbox-Testgeld.

Das Erstellen des Checkouts belastet kein Guthaben und reserviert keine reale Immobilie.`,
  ar: listing => `صفحة دفع عربون ${listing.title} بقيمة ${listing.deposit_currency} ${(listing.deposit_cents / 100).toFixed(2)} جاهزة.

افتح صفحة الدفع أدناه لمراجعة الشروط والموافقة باستخدام أموال اختبار PayPal Sandbox.

إنشاء صفحة الدفع وحده لا يخصم أموالاً ولا يحجز عقاراً حقيقياً.`
};

function findListing(text: string, listings: Listing[], selected: Listing | null): Listing | null {
  const normalized = text.toLocaleLowerCase();
  return listings.find(listing =>
    normalized.includes(listing.id.toLocaleLowerCase()) ||
    normalized.includes(listing.title.toLocaleLowerCase()) ||
    normalized.includes(listing.area.toLocaleLowerCase())
  ) ?? selected;
}

function getBaseUrl(env: ConversationEnvironment): string {
  if (!env.APP_BASE_URL?.trim()) throw new Error('APP_BASE_URL is required for real checkout');
  let url: URL;
  try {
    url = new URL(env.APP_BASE_URL.trim());
  } catch {
    throw new Error('APP_BASE_URL must be an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('APP_BASE_URL must be an absolute HTTP(S) URL without credentials');
  }
  return url.href.replace(/\/$/, '');
}

async function getMessages(db: D1Database, conversationId: string): Promise<Message[]> {
  return (await db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC').bind(conversationId).all<Message>()).results;
}

async function getSnapshot(db: D1Database, conversationId: string, order: Order | null, checkoutUrl: string | null) {
  const [conversation, messages, listings] = await Promise.all([getConversation(db, conversationId), getMessages(db, conversationId), getListings(db, true)]);
  if (!conversation) throw new Error('Conversation not found');
  return { conversation, messages, order, checkoutUrl, listings };
}

function transportOf(conversation: { wa_id: string; channel?: string | null; transport?: string | null }): 'demo' | 'web' | 'telegram' | 'whatsapp' {
  const value = conversation.transport ?? conversation.channel;
  if (value === 'web' || conversation.wa_id.startsWith('web:')) return 'web';
  if (value === 'telegram') return 'telegram';
  if (value === 'demo' || conversation.wa_id.startsWith('demo-')) return 'demo';
  return 'whatsapp';
}

async function addOutbound(
  db: D1Database,
  input: { conversationId: string; recipient: string; body: string; messageType?: string; metadata?: Record<string, unknown>; delivery: 'simulated' | 'web' | 'external'; sourceId?: string }
): Promise<string> {
  const messageId = input.sourceId ? `reply_${input.sourceId}_${input.messageType ?? 'text'}` : id('msg');
  const timestamp = now();
  const deliveryStatus = input.delivery === 'simulated' ? 'simulated' : input.delivery === 'web' ? 'delivered' : 'pending';
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO messages (id, conversation_id, direction, sender_type, body, message_type, delivery_status, metadata_json, created_at) VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?)")
      .bind(messageId, input.conversationId, input.messageType === 'checkout_link' ? 'system' : 'ai', input.body, input.messageType ?? 'text', deliveryStatus, input.metadata ? JSON.stringify(input.metadata) : null, timestamp),
    ...(input.delivery === 'external' ? [db.prepare("INSERT OR IGNORE INTO outbound_deliveries (id, conversation_id, message_id, recipient, body, status, attempts, max_attempts, next_attempt_at, last_error, external_message_id, created_at, updated_at) SELECT ?, conversation_id, id, ?, body, 'pending', 0, 5, ?, NULL, NULL, ?, ? FROM messages WHERE id = ?")
      .bind(`delivery_${messageId}`, input.recipient, timestamp, timestamp, timestamp, messageId)] : [])
  ]);
  return messageId;
}

export async function processConversationMessage(db: D1Database, env: ConversationEnvironment, input: ConversationMessageInput) {
  const conversationId = input.conversationId?.trim();
  const text = input.text?.trim();
  const externalMessageId = input.externalMessageId?.trim() || null;
  if (!conversationId) throw new Error('Conversation ID is required');
  if (!text) throw new Error('Message cannot be empty');
  if (text.length > 2000) throw new Error('Message is too long');
  if (externalMessageId && externalMessageId.length > 255) throw new Error('External message ID is too long');

  const conversation = await getConversation(db, conversationId);
  if (!conversation) throw new Error('Conversation not found');
  const transport = transportOf(conversation);
  const demo = transport === 'demo';
  const delivery = demo ? 'simulated' : transport === 'web' ? 'web' : 'external';
  if (externalMessageId) {
    const duplicate = await db.prepare("SELECT id FROM messages WHERE external_message_id = ? AND direction = 'inbound'").bind(externalMessageId).first();
    if (duplicate && !input.alreadyPersisted) {
      if (demo) {
        const snapshot = await getDemoSnapshot(db, conversationId);
        if (snapshot) return snapshot;
      }
      return getSnapshot(db, conversationId, await getLatestOrder(db, conversationId), null);
    }
  }
  const timestamp = now();
  const inboundId = id('msg');
  const inserted = input.alreadyPersisted
    ? { meta: { changes: 1 } }
    : externalMessageId
    ? await db.prepare(
      "INSERT INTO messages (id, conversation_id, direction, sender_type, body, message_type, external_message_id, delivery_status, created_at) VALUES (?, ?, 'inbound', 'buyer', ?, 'text', ?, 'received', ?) ON CONFLICT(external_message_id) DO NOTHING"
    ).bind(inboundId, conversationId, text, externalMessageId, timestamp).run()
    : (await addMessage(db, { conversationId, direction: 'inbound', senderType: 'buyer', body: text }), { meta: { changes: 1 } });
  if (externalMessageId && !inserted.meta.changes && !input.alreadyPersisted) {
    if (demo) {
      const snapshot = await getDemoSnapshot(db, conversationId);
      if (snapshot) return snapshot;
    }
    return getSnapshot(db, conversationId, await getLatestOrder(db, conversationId), null);
  }
  await db.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(timestamp, timestamp, conversationId).run();

  if (conversation.status === 'handoff' || conversation.status === 'closed' || !(await db.prepare('SELECT auto_reply_enabled FROM workspace_settings WHERE id = 1').first<{ auto_reply_enabled: number }>())?.auto_reply_enabled) {
    if (demo) {
      const snapshot = await getDemoSnapshot(db, conversationId);
      if (snapshot) return snapshot;
    }
    return getSnapshot(db, conversationId, await getLatestOrder(db, conversationId), null);
  }

  const listings = await getListings(db, true);
  const selected = listings.find(listing => listing.id === conversation.selected_listing_id) ?? null;
  const settings = await db.prepare('SELECT ai_provider, ai_tone FROM workspace_settings WHERE id = 1').first<{ ai_provider: string; ai_tone: string }>();
  const useConfiguredModel = transport === 'telegram' || transport === 'web';
  const effectiveEnv = { ...env, AI_PROVIDER: demo ? 'rules' : useConfiguredModel ? env.AI_PROVIDER : settings?.ai_provider ?? env.AI_PROVIDER, AI_STRICT: useConfiguredModel };
  const history = (await getMessages(db, conversationId)).filter(item => item.message_type === 'text').slice(-12).map(item => ({ role: item.direction === 'inbound' ? 'user' as const : 'assistant' as const, content: item.body.slice(0, 2000) }));
  const reply = text.trim() === '/human'
    ? { ...generateRuleReply('human', conversation.locale, listings, selected), metadata: { provider: 'rules' as const } }
    : await generateAiReply(effectiveEnv, { text, locale: conversation.locale, listings, selected, tone: settings?.ai_tone ?? 'concise', history }, db);
  if ('locale' in reply && reply.locale && reply.locale !== conversation.locale) {
    conversation.locale = reply.locale;
    await db.prepare('UPDATE conversations SET locale = ? WHERE id = ?').bind(reply.locale, conversationId).run();
  }
  if (!demo) {
    const namedListings = listings.filter(listing => text.toLowerCase().includes(listing.title.toLowerCase()) || text.toLowerCase().includes(listing.id.toLowerCase()));
    const sameSelection = selected && !namedListings.some(listing => listing.id !== selected.id);
    const confirmed = hasExplicitDepositConsent(text);
    if (confirmed && sameSelection && reply.action !== 'handoff') {
      reply.action = 'create_deposit';
      reply.selectedListingId = selected.id;
    } else if (reply.action === 'create_deposit') {
      reply.action = null;
      reply.text = consentCopy[conversation.locale];
    }
  }
  const nextListing = reply.selectedListingId ? listings.find(listing => listing.id === reply.selectedListingId) ?? selected : findListing(text, listings, selected);
  const depositListing = reply.action === 'create_deposit' ? nextListing : null;
  let stage = reply.score >= 70 ? 'qualified' : reply.score >= 25 ? 'exploring' : conversation.intent_stage;
  let status = conversation.status;
  let order = await getLatestOrder(db, conversationId);
  let checkoutUrl: string | null = null;
  let checkoutText: string | null = null;

  if (reply.action === 'handoff') {
    status = 'handoff';
    await db.prepare('UPDATE conversations SET status = ?, handoff_requested_at = ?, updated_at = ? WHERE id = ?').bind(status, timestamp, timestamp, conversationId).run();
  }

  if (depositListing) {
    if (order?.status === 'paid') {
      await addOutbound(db, { conversationId, recipient: conversation.wa_id, body: paidCopy[conversation.locale], metadata: { provider: 'rules', action: 'paid_order' }, delivery });
      if (demo) {
        const snapshot = await getDemoSnapshot(db, conversationId);
        if (snapshot) return snapshot;
      }
      return getSnapshot(db, conversationId, order, null);
    }
    const pending = order && order.status === 'pending_payment' && order.listing_id === depositListing.id ? order : null;
    const orderId = pending?.id ?? id('order');
    if (!pending) {
      const provider = demo ? 'mock' : 'paypal';
      const baseUrl = demo ? null : getBaseUrl(env);
      if (!demo && transport !== 'web' && !(transport === 'telegram' ? env.TELEGRAM_BOT_TOKEN : env.CHANNEL_MODE === 'whatsapp')) throw new Error('A real messaging channel must be configured for checkout');
      const payment = demo ? new MockPaymentProvider() : new PayPalPaymentProvider(env);
      const accessToken = demo ? null : crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
      const accessTokenHash = accessToken ? await sha256(accessToken) : null;
      const buyerCheckoutUrl = accessToken ? `${baseUrl}/checkout/${orderId}?access_token=${encodeURIComponent(accessToken)}` : null;
      checkoutUrl = buyerCheckoutUrl;
      const checkout = await payment.createDepositOrder({
        orderId,
        amountCents: depositListing.deposit_cents,
        currency: depositListing.deposit_currency,
        returnUrl: buyerCheckoutUrl ? `${buyerCheckoutUrl}&payment_return=1` : '/demo',
        cancelUrl: buyerCheckoutUrl ? `${buyerCheckoutUrl}&payment_cancelled=1` : '/demo'
      });
      await db.prepare(
        "INSERT INTO deposit_orders (id, conversation_id, wa_id, listing_id, amount_cents, currency, provider, paypal_order_id, approval_url, access_token_hash, status, terms_accepted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', NULL, ?, ?)"
      ).bind(orderId, conversationId, conversation.wa_id, depositListing.id, depositListing.deposit_cents, depositListing.deposit_currency, provider, checkout.providerOrderId, checkout.approvalUrl, accessTokenHash, timestamp, timestamp).run();
      order = await getLatestOrder(db, conversationId);
    }
    if (order) {
      if (demo) checkoutUrl = `/checkout/${order.id}`;
      else if (!checkoutUrl) {
        const previousLink = await db.prepare("SELECT body FROM messages WHERE conversation_id = ? AND message_type = 'checkout_link' AND json_extract(metadata_json, '$.orderId') = ? ORDER BY created_at DESC LIMIT 1").bind(conversationId, order.id).first<{ body: string }>();
        const match = previousLink?.body.match(/https?:\/\/\S+/);
        checkoutUrl = match?.[0] ?? null;
        if (!checkoutUrl) throw new Error('Checkout link is unavailable; contact an authorised agent');
      }
      checkoutText = checkoutUrl ? checkoutCopy[conversation.locale](checkoutUrl) : null;
      if (!demo && checkoutText) reply.text = checkoutReadyCopy[conversation.locale](depositListing);
    }
    stage = 'checkout';
  }

  await db.prepare('UPDATE conversations SET intent_stage = ?, lead_score = ?, selected_listing_id = ?, updated_at = ? WHERE id = ?').bind(stage, Math.max(conversation.lead_score, reply.score), nextListing?.id ?? null, timestamp, conversationId).run();
  const metadata: Record<string, unknown> = { ...reply.metadata, action: reply.action, score: reply.score };
  await addOutbound(db, { conversationId, recipient: conversation.wa_id, body: reply.text, metadata, delivery, sourceId: externalMessageId ?? undefined });
  if (checkoutText && order) {
    await addOutbound(db, { conversationId, recipient: conversation.wa_id, body: checkoutText, messageType: 'checkout_link', metadata: { orderId: order.id }, delivery, sourceId: externalMessageId ?? undefined });
  }
  return getSnapshot(db, conversationId, order, checkoutUrl);
}
