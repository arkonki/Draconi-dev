-- The Solo narrator can use the same tools as an AI assistant connected over MCP. What it did in a turn is kept with
-- the reply (`tool_calls`), including calls that are waiting for the player to approve them, and each campaign chooses
-- how much the narrator may do on its own.
ALTER TABLE solo_narrator_turns
  ADD COLUMN IF NOT EXISTS tool_calls jsonb;

ALTER TABLE solo_campaign_states
  ADD COLUMN IF NOT EXISTS narrator_mode text NOT NULL DEFAULT 'ask'
  CHECK (narrator_mode IN ('suggest', 'ask', 'trust'));
