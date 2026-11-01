-- Accounts, email OTP sessions, credits and web conversations.
-- Copy every existing conversation before replacing the table. Do not delete rows.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE conversations_accounts (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'zh-CN', 'zh-TW', 'fr', 'de', 'ar')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'handoff', 'closed')),
  intent_stage TEXT NOT NULL DEFAULT 'new' CHECK (intent_stage IN ('new', 'exploring', 'qualified', 'checkout', 'paid')),
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  selected_listing_id TEXT REFERENCES listings(id),
  handoff_requested_at TEXT,
  last_message_at TEXT,
  channel TEXT NOT NULL DEFAULT 'demo' CHECK (channel IN ('demo', 'whatsapp')),
  transport TEXT CHECK (transport IN ('demo', 'whatsapp', 'telegram', 'web')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  user_id TEXT
);

INSERT INTO conversations_accounts (
  id, wa_id, locale, status, intent_stage, lead_score, selected_listing_id,
  handoff_requested_at, last_message_at, channel, transport, created_at, updated_at, user_id
)
SELECT id, wa_id, locale, status, intent_stage, lead_score, selected_listing_id,
       handoff_requested_at, last_message_at, channel, transport, created_at, updated_at, NULL
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_accounts RENAME TO conversations;
CREATE INDEX idx_conversations_status ON conversations(status, intent_stage);
CREATE INDEX idx_conversations_channel ON conversations(channel, updated_at);
CREATE INDEX idx_conversations_transport ON conversations(transport, updated_at);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at);
PRAGMA defer_foreign_keys = OFF;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'))
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id, created_at);
CREATE TABLE email_otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5
);
CREATE INDEX idx_email_otps_email ON email_otps(email, created_at);
CREATE TABLE login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('otp_sent', 'otp_failed', 'login', 'logout')),
  created_at TEXT NOT NULL,
  ip_hash TEXT
);
CREATE INDEX idx_login_events_user ON login_events(user_id, created_at);
CREATE TABLE credit_accounts (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL CHECK (balance >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  lifetime_granted INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE credit_ledger (
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
CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id, created_at);
CREATE TABLE credit_reservations (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE ai_requests (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  conversation_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed')),
  snapshot_json TEXT,
  error_kind TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  idempotency_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (actor_user_id, idempotency_key)
);
CREATE TABLE rate_buckets (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
CREATE TABLE ai_budget_windows (
  window_start TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
);
