-- Bind web request retries to their original conversation and message.
ALTER TABLE ai_requests ADD COLUMN request_hash TEXT;

-- A unique, random operation marker avoids timestamp-based double refunds.
ALTER TABLE credit_reservations ADD COLUMN operation_id TEXT;
