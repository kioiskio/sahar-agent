PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, area TEXT NOT NULL, layout TEXT NOT NULL,
  bedrooms INTEGER NOT NULL CHECK (bedrooms >= 0), bathrooms INTEGER NOT NULL CHECK (bathrooms >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0), currency TEXT NOT NULL,
  deposit_cents INTEGER NOT NULL CHECK (deposit_cents > 0), deposit_currency TEXT NOT NULL,
  description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, wa_id TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'zh-CN', 'zh-TW', 'fr', 'de', 'ar')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'handoff', 'closed')),
  intent_stage TEXT NOT NULL DEFAULT 'new' CHECK (intent_stage IN ('new', 'exploring', 'qualified', 'checkout', 'paid')),
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  selected_listing_id TEXT REFERENCES listings(id), handoff_requested_at TEXT, last_message_at TEXT,
  channel TEXT NOT NULL DEFAULT 'demo' CHECK (channel IN ('demo', 'whatsapp')),
  transport TEXT CHECK (transport IN ('demo','whatsapp','telegram','web')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  user_id TEXT,
  title TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('buyer', 'ai', 'agent', 'system')),
  body TEXT NOT NULL, message_type TEXT NOT NULL DEFAULT 'text', external_message_id TEXT UNIQUE,
  delivery_status TEXT NOT NULL DEFAULT 'received', metadata_json TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deposit_orders (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), wa_id TEXT NOT NULL,
  listing_id TEXT NOT NULL REFERENCES listings(id), amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'mock', paypal_order_id TEXT UNIQUE,
  approval_url TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'processing', 'paid', 'failed', 'cancelled', 'refunded')),
  terms_accepted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT,
  access_token_hash TEXT, provider_capture_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL, event_id TEXT NOT NULL, event_type TEXT NOT NULL DEFAULT 'message',
  resource_id TEXT, payload_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  processing_error TEXT, processing_lock_at TEXT, created_at TEXT NOT NULL, processed_at TEXT,
  PRIMARY KEY (provider, event_id)
);
CREATE TABLE IF NOT EXISTS outbound_deliveries (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  message_id TEXT NOT NULL UNIQUE REFERENCES messages(id), recipient TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, next_attempt_at TEXT,
  last_error TEXT, external_message_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_jobs (
  external_message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, next_attempt_at TEXT,
  last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), default_locale TEXT NOT NULL DEFAULT 'en',
  ai_provider TEXT NOT NULL DEFAULT 'rules', ai_tone TEXT NOT NULL DEFAULT 'concise',
  auto_reply_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_reply_enabled IN (0, 1)),
  whatsapp_mode TEXT NOT NULL DEFAULT 'mock', paypal_mode TEXT NOT NULL DEFAULT 'mock',
  deposit_terms TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status, intent_stage);
CREATE INDEX IF NOT EXISTS idx_orders_conversation ON deposit_orders(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON deposit_orders(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_conversation_active ON deposit_orders(conversation_id) WHERE status IN ('draft', 'pending_payment', 'processing');
CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON outbound_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversation_jobs_retry ON conversation_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at);
CREATE TABLE IF NOT EXISTS email_otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email, created_at);
CREATE TABLE IF NOT EXISTS login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('otp_sent', 'otp_failed', 'login', 'logout')),
  created_at TEXT NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at);
CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL CHECK (balance >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  lifetime_granted INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at);
CREATE TABLE IF NOT EXISTS credit_reservations (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released')),
  operation_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE IF NOT EXISTS ai_requests (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  conversation_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed')),
  snapshot_json TEXT,
  error_kind TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  request_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  idempotency_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (actor_user_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS rate_buckets (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_budget_windows (
  window_start TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
);
INSERT OR IGNORE INTO listings
  (id, title, area, layout, bedrooms, bathrooms, price_cents, currency, deposit_cents, deposit_currency, description, status, created_at, updated_at)
VALUES
  ('marina-sky', 'Marina Sky Residence', 'Dubai Marina', '1 bed · Marina view', 1, 2, 185000000, 'AED', 10000, 'USD', 'A waterfront one-bedroom residence with a marina-facing balcony and concierge service.', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('downtown-crest', 'Downtown Crest', 'Downtown Dubai', '2 beds · Burj view', 2, 3, 320000000, 'AED', 10000, 'USD', 'A two-bedroom city residence near Dubai Mall, with skyline views and resident amenities.', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('palm-lagoon', 'Palm Lagoon Villa', 'Palm Jumeirah', '4 beds · Private garden', 4, 5, 890000000, 'AED', 25000, 'USD', 'A four-bedroom villa with a private garden, generous living space and beach access.', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO workspace_settings (id, deposit_terms, updated_at)
VALUES (1, 'Demonstration only. Deposit terms, refund conditions, property availability and the receiving business must be confirmed by an authorised agent before payment.', '2026-01-01T00:00:00.000Z');
