CREATE TABLE game_session_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 10000),
  scene jsonb NOT NULL CHECK (jsonb_typeof(scene) = 'object'),
  unresolved_threads jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(unresolved_threads) = 'array'),
  campaign_revision bigint NOT NULL CHECK (campaign_revision >= 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX game_session_checkpoints_campaign_created_idx
  ON game_session_checkpoints(campaign_id, created_at DESC);

CREATE INDEX game_session_checkpoints_session_created_idx
  ON game_session_checkpoints(session_id, created_at DESC);
