-- Expand channel support without rebuilding a table referenced by orders and messages.
ALTER TABLE conversations ADD COLUMN transport TEXT CHECK (transport IN ('demo','whatsapp','telegram'));
CREATE INDEX idx_conversations_transport ON conversations(transport,updated_at);
