CREATE TABLE IF NOT EXISTS character_recovery_states (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  shift_count integer NOT NULL DEFAULT 0 CHECK (shift_count >= 0),
  last_shift_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_recovery_states_campaign_idx
  ON character_recovery_states(campaign_id, character_id);

DROP TRIGGER IF EXISTS set_character_recovery_states_updated_at ON character_recovery_states;
CREATE TRIGGER set_character_recovery_states_updated_at
BEFORE UPDATE ON character_recovery_states
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO character_recovery_states (character_id, campaign_id, shift_count)
SELECT DISTINCT ON (injury.character_id)
  injury.character_id,
  injury.campaign_id,
  COALESCE(rest.shift_count, 0)
FROM character_injuries injury
LEFT JOIN solo_rest_states rest ON rest.campaign_id = injury.campaign_id
ORDER BY injury.character_id, injury.created_at
ON CONFLICT (character_id) DO NOTHING;
