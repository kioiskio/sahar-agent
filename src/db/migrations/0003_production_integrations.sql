ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('demo', 'whatsapp'));

ALTER TABLE webhook_events RENAME TO legacy_webhook_events;

CREATE TABLE webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'message',
  resource_id TEXT,
  payload_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  processing_error TEXT,
  processing_lock_at TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE outbound_deliveries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  message_id TEXT NOT NULL UNIQUE REFERENCES messages(id),
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT,
  last_error TEXT,
  external_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE deposit_orders ADD COLUMN access_token_hash TEXT;
ALTER TABLE deposit_orders ADD COLUMN provider_capture_id TEXT;

CREATE UNIQUE INDEX idx_orders_conversation_active ON deposit_orders(conversation_id) WHERE status IN ('draft', 'pending_payment', 'processing');
CREATE UNIQUE INDEX idx_orders_provider_capture ON deposit_orders(provider_capture_id) WHERE provider_capture_id IS NOT NULL;
CREATE INDEX idx_deliveries_retry ON outbound_deliveries(status, next_attempt_at);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);
CREATE INDEX idx_conversations_channel ON conversations(channel, updated_at);

INSERT INTO workspace_settings (id, default_locale, ai_provider, ai_tone, auto_reply_enabled, whatsapp_mode, paypal_mode, deposit_terms, updated_at)
SELECT 1, 'en', 'rules', 'concise', 1, 'mock', 'mock', 'Demonstration only. Deposit terms, refund conditions, property availability and the receiving business must be confirmed by an authorised agent before payment.', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM workspace_settings WHERE id = 1);
