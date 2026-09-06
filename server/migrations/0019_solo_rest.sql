CREATE TABLE IF NOT EXISTS solo_rest_states (
  campaign_id uuid PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  round_rest_taken boolean NOT NULL DEFAULT false,
  stretch_rest_taken boolean NOT NULL DEFAULT false,
  shift_count integer NOT NULL DEFAULT 0 CHECK (shift_count >= 0),
  last_rest_type text CHECK (last_rest_type IS NULL OR last_rest_type IN ('round', 'stretch', 'shift')),
  last_rest_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_solo_rest_states_updated_at ON solo_rest_states;
CREATE TRIGGER set_solo_rest_states_updated_at
BEFORE UPDATE ON solo_rest_states
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
