import type { Locale } from './i18n/locales';

export type Listing = {
  id: string; title: string; area: string; layout: string; bedrooms: number; bathrooms: number;
  price_cents: number; currency: string; deposit_cents: number; deposit_currency: string;
  description: string; status: string;
};

export type Conversation = {
  channel?: 'demo' | 'whatsapp' | 'telegram' | 'web';
  transport?: 'demo' | 'whatsapp' | 'telegram' | 'web' | null;
  user_id?: string | null;
  title?: string | null;
  id: string; wa_id: string; locale: Locale; status: string; intent_stage: string; lead_score: number;
  selected_listing_id: string | null; last_message_at: string | null;
};

export type Message = {
  id: string; conversation_id: string; direction: string; sender_type: string; body: string;
  message_type: string; delivery_status: string; created_at: string; metadata_json?: string;
};

export type Order = {
  id: string; conversation_id: string; wa_id: string; listing_id: string; amount_cents: number;
  currency: string; provider: string; paypal_order_id: string | null; approval_url: string | null;
  status: string; terms_accepted_at: string | null; created_at: string; paid_at: string | null;
  access_token_hash: string | null; provider_capture_id: string | null;
};

export type WorkspaceSettings = {
  id: number; default_locale: Locale; ai_provider: string; ai_tone: string; auto_reply_enabled: number;
  whatsapp_mode: string; paypal_mode: string; deposit_terms: string;
};

export type ConversationContext = { conversation: Conversation; listing: Listing | null; settings: WorkspaceSettings };
