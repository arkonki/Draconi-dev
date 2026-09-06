CREATE TABLE solo_dangers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES solo_missions(id) ON DELETE CASCADE,
  waypoint_id uuid REFERENCES solo_waypoints(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'avoided')),
  source_roll_id uuid REFERENCES recorded_rolls(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solo_dangers_campaign_status_idx
  ON solo_dangers(campaign_id, status, created_at DESC);
CREATE INDEX solo_dangers_waypoint_idx
  ON solo_dangers(waypoint_id, created_at DESC);
CREATE TRIGGER solo_dangers_set_updated_at
  BEFORE UPDATE ON solo_dangers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE solo_check_consequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  source_roll_id uuid NOT NULL REFERENCES recorded_rolls(id) ON DELETE RESTRICT,
  resolution_mode text NOT NULL CHECK (resolution_mode IN ('manual', 'roll_choice')),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  selected_index smallint CHECK (selected_index IS NULL OR selected_index BETWEEN 0 AND 1),
  selected_description text NOT NULL CHECK (char_length(selected_description) BETWEEN 1 AND 2000),
  selected_effect jsonb NOT NULL CHECK (jsonb_typeof(selected_effect) = 'object'),
  choice_roll_id uuid REFERENCES recorded_rolls(id) ON DELETE SET NULL,
  applied_summary text NOT NULL CHECK (char_length(applied_summary) BETWEEN 1 AND 4000),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, source_roll_id)
);

CREATE INDEX solo_check_consequences_campaign_created_idx
  ON solo_check_consequences(campaign_id, created_at DESC);
