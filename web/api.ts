import type { Locale } from '../src/i18n/locales';

export type Listing = {
  id: string; title: string; area: string; layout: string; bedrooms: number; bathrooms: number;
  price_cents: number; currency: string; deposit_cents: number; deposit_currency: string;
  description: string; status: string;
};
export type ListingInput = Omit<Listing, 'id'>;
export type Conversation = {
  channel?: 'demo' | 'whatsapp' | 'telegram';
  transport?: 'whatsapp' | 'telegram';
  id: string; wa_id: string; locale: Locale; status: string; intent_stage: string; lead_score: number;
  selected_listing_id: string | null; last_message_at: string | null; title?: string; area?: string;
};
export type Message = {
  id: string; conversation_id: string; direction: string; sender_type: string; body: string;
  message_type: string; delivery_status: string; created_at: string; metadata_json?: string;
};
export type Order = {
  id: string; conversation_id: string; wa_id: string; listing_id: string; amount_cents: number;
  currency: string; provider: string; paypal_order_id: string | null; approval_url?: string | null;
  status: string; terms_accepted_at?: string | null; created_at: string; updated_at?: string;
  paid_at: string | null; title?: string; area?: string; checkout_url?: string | null;
};
export type ConversationDetail = { conversation: Conversation; messages: Message[]; orders: Order[] };
export type Settings = {
  id: number; default_locale: Locale; ai_provider: string; ai_tone: string; auto_reply_enabled: number;
  whatsapp_mode: string; paypal_mode: string; deposit_terms: string;
  channel_mode?: string; ai_model?: string | null; connections: { whatsapp: boolean; paypal: boolean; ai: boolean; telegram?: boolean };
};
export type SettingsInput = Partial<Pick<Settings, 'default_locale' | 'ai_provider' | 'ai_tone' | 'deposit_terms'>> & { auto_reply_enabled?: boolean };
export type Stats = { conversations: number; highIntent: number; paidOrders: number; paidCents: number; currency: string; pendingHandoffs: number };
export type Bootstrap = { stats: Stats; listings: Listing[]; conversations: Conversation[]; orders: Order[]; settings: Settings };
export type DemoSnapshot = { conversation: Conversation; messages: Message[]; order: Order | null; checkoutUrl: string | null; listings: Listing[] };
export type CheckoutOrder = Order & { title: string; area: string; terms: string };
export type SessionUser = { id: string; email: string; admin: boolean };
export type Credits = { balance: number; reserved: number; spent: number };
export type WebMessage = { id: string; direction: string; sender_type: string; body: string; message_type: string; created_at: string };
export type WebConversationSummary = {
  id: string; title: string | null; status: string; updated_at: string; created_at: string; preview: string | null;
};
export type WebSnapshot = {
  conversation: { id: string; title: string | null; locale: string; status: string; intent_stage: string; lead_score: number; selected_listing_id: string | null; last_message_at: string | null };
  messages: WebMessage[];
  order: { id: string; status: string; amount_cents: number; currency: string; listing_id: string } | null;
  checkoutUrl: string | null;
  credits: Credits;
};
export type AdminUser = {
  id: string; email: string; email_verified_at: string; created_at: string; last_login_at: string | null;
  status: string; balance: number; spent: number; granted: number;
};
export type AdminUserEvent = { id: string; event_type: string; created_at: string };
export type AdminLedgerEntry = {
  id: string; delta: number; balance_after: number; reason: string; note: string | null;
  actor_user_id: string | null; created_at: string;
};
export type AdminUserDetail = { user: AdminUser; events: AdminUserEvent[]; ledger: AdminLedgerEntry[] };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (response.status === 401 && (path.startsWith('/api/bootstrap') || path.startsWith('/api/conversations') || path.startsWith('/api/listings') || path.startsWith('/api/settings') || path === '/api/payments/sandbox/orders')) {
    window.dispatchEvent(new Event('sahar:workspace-unauthorized'));
  }
  if (!response.ok) throw new ApiError(payload.error || 'Request failed', response.status);
  return payload;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  getConversation: (id: string) => request<ConversationDetail>('/api/conversations/' + encodeURIComponent(id)),
  conversationAction: (id: string, action: 'handoff' | 'resume' | 'close') => request<{ conversation: Conversation }>('/api/conversations/' + encodeURIComponent(id) + '/handoff', { method: 'POST', body: JSON.stringify({ action }) }),
  replyToConversation: (id: string, text: string) => request<{ message: Message }>('/api/conversations/' + encodeURIComponent(id) + '/messages', { method: 'POST', body: JSON.stringify({ text }) }),
  createListing: (listing: ListingInput) => request<{ listing: Listing }>('/api/listings', { method: 'POST', body: JSON.stringify(listing) }),
  updateListing: (id: string, listing: Partial<ListingInput>) => request<{ listing: Listing }>('/api/listings/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(listing) }),
  getPaymentOrder: (id: string, token: string) => request<{ order: CheckoutOrder }>('/api/payments/orders/' + encodeURIComponent(id) + '?token=' + encodeURIComponent(token)),
  acceptPaymentTerms: (id: string, token: string) => request<{ order: CheckoutOrder }>('/api/payments/orders/' + encodeURIComponent(id) + '/terms', { method: 'POST', body: JSON.stringify({ token, accepted: true }) }),
  capturePaymentOrder: (id: string, token: string) => request<{ order: CheckoutOrder }>('/api/payments/orders/' + encodeURIComponent(id) + '/capture', { method: 'POST', body: JSON.stringify({ token, accepted: true }) }),
  createSandboxOrder: (listingId: string, locale: Locale, requestId: string) => request<{ orderId: string; checkoutUrl: string }>('/api/payments/sandbox/orders', { method: 'POST', body: JSON.stringify({ listingId, locale, requestId }) }),
  createDemo: (locale: Locale) => request<DemoSnapshot>('/api/demo/session', { method: 'POST', body: JSON.stringify({ locale }) }),
  getDemo: (id: string) => request<DemoSnapshot>('/api/demo/session/' + encodeURIComponent(id)),
  sendDemo: (conversationId: string, text: string) => request<DemoSnapshot>('/api/demo/messages', { method: 'POST', body: JSON.stringify({ conversationId, text }) }),
  getDemoCheckout: (id: string) => request<{ order: CheckoutOrder }>('/api/demo/checkout/' + encodeURIComponent(id)),
  completeDemoOrder: (orderId: string) => request<{ order: Order }>('/api/demo/orders/' + encodeURIComponent(orderId) + '/complete', { method: 'POST', body: JSON.stringify({ accepted: true }) }),
  updateSettings: (settings: SettingsInput) => request<{ settings: Settings }>('/api/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  authConfig: () => request<{ turnstileSiteKey: string | null; contactEmail: string }>('/api/auth/config'),
  session: () => request<{ user: SessionUser | null; credits?: Credits }>('/api/auth/session'),
  sendCode: (email: string, turnstileToken: string) => request<{ ok: boolean }>('/api/auth/email-code', { method: 'POST', body: JSON.stringify({ email, turnstileToken }) }),
  verifyCode: (email: string, code: string) => request<{ user: SessionUser; credits: Credits }>('/api/auth/email-code/verify', { method: 'POST', body: JSON.stringify({ email, code }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }),
  myConversations: () => request<{ conversations: WebConversationSummary[]; credits: Credits }>('/api/me/conversations'),
  createConversation: (locale: string, title?: string) => request<WebSnapshot>('/api/me/conversations', { method: 'POST', body: JSON.stringify({ locale, title }) }),
  renameConversation: (id: string, title: string) => request<{ title: string }>('/api/me/conversations/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteConversation: (id: string) => request<{ ok: boolean }>('/api/me/conversations/' + encodeURIComponent(id), { method: 'DELETE' }),
  getMyConversation: (id: string) => request<WebSnapshot>('/api/me/conversations/' + encodeURIComponent(id)),
  sendMyMessage: (id: string, text: string, requestId: string) => request<WebSnapshot>('/api/me/conversations/' + encodeURIComponent(id) + '/messages', { method: 'POST', body: JSON.stringify({ text, requestId }) }),
  adminUsers: () => request<{ users: AdminUser[] }>('/api/admin/users'),
  adminUser: (id: string) => request<AdminUserDetail>('/api/admin/users/' + encodeURIComponent(id)),
  grantCredits: (input: { userId: string; amount: number; note: string; requestId: string }) => request<{ balance: number; applied: boolean }>('/api/admin/credits', { method: 'POST', body: JSON.stringify(input) })
};
