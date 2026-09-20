CREATE INDEX IF NOT EXISTS messages_party_created_at_idx
ON messages (party_id, created_at DESC, id DESC);
