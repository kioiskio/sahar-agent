ALTER TABLE conversations RENAME TO legacy_conversations;
ALTER TABLE deposit_orders RENAME TO legacy_deposit_orders;
ALTER TABLE listings RENAME TO legacy_listings;

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  layout TEXT NOT NULL,
  bedrooms INTEGER NOT NULL CHECK (bedrooms >= 0),
  bathrooms INTEGER NOT NULL CHECK (bathrooms >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL,
  deposit_cents INTEGER NOT NULL CHECK (deposit_cents > 0),
  deposit_currency TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'zh-CN', 'zh-TW', 'fr', 'de')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'handoff', 'closed')),
  intent_stage TEXT NOT NULL DEFAULT 'new' CHECK (intent_stage IN ('new', 'exploring', 'qualified', 'checkout', 'paid')),
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  selected_listing_id TEXT REFERENCES listings(id),
  handoff_requested_at TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO conversations (id, wa_id, created_at, updated_at) SELECT wa_id, wa_id, created_at, created_at FROM legacy_conversations;

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('buyer', 'ai', 'agent', 'system')),
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  external_message_id TEXT UNIQUE,
  delivery_status TEXT NOT NULL DEFAULT 'received',
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE deposit_orders (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  wa_id TEXT NOT NULL,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mock',
  paypal_order_id TEXT UNIQUE,
  approval_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'processing', 'paid', 'failed', 'cancelled', 'refunded')),
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE workspace_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_locale TEXT NOT NULL DEFAULT 'en',
  ai_provider TEXT NOT NULL DEFAULT 'rules',
  ai_tone TEXT NOT NULL DEFAULT 'concise',
  auto_reply_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_reply_enabled IN (0, 1)),
  whatsapp_mode TEXT NOT NULL DEFAULT 'mock',
  paypal_mode TEXT NOT NULL DEFAULT 'mock',
  deposit_terms TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_status ON conversations(status, intent_stage);
CREATE INDEX idx_orders_conversation ON deposit_orders(conversation_id, created_at);
CREATE INDEX idx_orders_status ON deposit_orders(status, created_at);
CREATE INDEX idx_webhook_events_received ON webhook_events(received_at);

INSERT INTO listings
  (id, title, area, layout, bedrooms, bathrooms, price_cents, currency, deposit_cents, deposit_currency, description, status, created_at, updated_at)
VALUES
  ('marina-sky', 'Marina Sky Residence', 'Dubai Marina', '1 bed · Marina view', 1, 2, 185000000, 'AED', 10000, 'USD', 'A waterfront one-bedroom residence with a marina-facing balcony and concierge service.', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('downtown-crest', 'Downtown Crest', 'Downtown Dubai', '2 beds · Burj view', 2, 3, 320000000, 'AED', 10000, 'USD', 'A two-bedroom city residence near Dubai Mall, with skyline views and resident amenities.', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('palm-lagoon', 'Palm Lagoon Villa', 'Palm Jumeirah', '4 beds · Private garden', 4, 5, 890000000, 'AED', 25000, 'USD', 'A four-bedroom villa with a private garden, generous living space and beach access.', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO workspace_settings (id, deposit_terms, updated_at)
VALUES (1, 'Demonstration only. Deposit terms, refund conditions, property availability and the receiving business must be confirmed by an authorised agent before payment.', '2026-01-01T00:00:00.000Z');
