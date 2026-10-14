-- Prompt caching: how many of a request's input tokens the provider served from its cache (at a discount), so the
-- saving can be seen. And an optional per-campaign glossary of game terms for the language the story is told in.
ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS cached_tokens integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0);

ALTER TABLE solo_narrator_turns
  ADD COLUMN IF NOT EXISTS cached_tokens integer;

-- NULL means "use the built-in glossary for the language". Otherwise one "English term = local term" per line.
ALTER TABLE solo_campaign_states
  ADD COLUMN IF NOT EXISTS narration_glossary text CHECK (narration_glossary IS NULL OR char_length(narration_glossary) <= 2000);
