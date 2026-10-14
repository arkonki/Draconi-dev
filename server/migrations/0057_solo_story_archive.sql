-- The story library: when a story ends, the narrative the narrator had built up is kept next to its mission, so finished
-- stories can be read again and continued from later. Missions themselves are already on record; this adds the telling.
CREATE TABLE IF NOT EXISTS solo_story_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES solo_missions(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  outcome text NOT NULL DEFAULT 'unfinished' CHECK (outcome IN ('success', 'failure', 'abandoned', 'unfinished')),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 10000),
  narrative text NOT NULL DEFAULT '' CHECK (char_length(narrative) <= 6000),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS solo_story_archive_party_idx ON solo_story_archive (party_id, created_at DESC);
