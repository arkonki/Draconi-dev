-- The Solo narrator remembers the story. Each exchange is kept per campaign, and when the conversation grows long the
-- oldest part is folded into a short running summary ("the story so far") that the narrator is always given, so it
-- stays consistent across sessions and devices without sending the whole history every time.
CREATE TABLE IF NOT EXISTS solo_narrator_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) <= 8000),
  -- Rule actions the narrator proposed with this reply (buttons the player may use), already checked by the server.
  actions jsonb,
  -- True once this turn has been folded into the running summary.
  summarized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS solo_narrator_turns_party_idx ON solo_narrator_turns (party_id, created_at);

CREATE TABLE IF NOT EXISTS solo_narrator_memory (
  party_id uuid PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
