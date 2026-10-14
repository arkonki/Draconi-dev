-- The language a Solo campaign is narrated in. It belongs to the campaign, not to one client, so the built-in narrator and
-- an AI assistant connected over MCP both tell the story in the same language.
ALTER TABLE solo_campaign_states
  ADD COLUMN IF NOT EXISTS narration_language text NOT NULL DEFAULT 'en'
    CHECK (narration_language IN ('en', 'et'));
