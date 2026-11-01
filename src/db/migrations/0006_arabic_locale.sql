-- Rebuild only the locale-constrained table; retain IDs and all related records.
-- Defer foreign-key checks until the table has been recreated and renamed.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE conversations_arabic (
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
  transport TEXT CHECK (transport IN ('demo','whatsapp','telegram')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO conversations_arabic
SELECT id, wa_id, locale, status, intent_stage, lead_score, selected_listing_id,
       handoff_requested_at, last_message_at, channel, transport, created_at, updated_at
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_arabic RENAME TO conversations;
CREATE INDEX idx_conversations_status ON conversations(status, intent_stage);
CREATE INDEX idx_conversations_channel ON conversations(channel, updated_at);
CREATE INDEX idx_conversations_transport ON conversations(transport, updated_at);
PRAGMA defer_foreign_keys = OFF;
