ALTER TABLE solo_missions
  ADD COLUMN IF NOT EXISTS objective_waypoint_id uuid REFERENCES solo_waypoints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_mode text
    CHECK (return_mode IS NULL OR return_mode IN ('cleared', 'dangerous', 'alternative'));

UPDATE solo_missions mission
SET objective_waypoint_id = (
  SELECT waypoint.id
  FROM solo_waypoints waypoint
  WHERE waypoint.mission_id = mission.id
    AND waypoint.kind = 'foreseen'
  ORDER BY waypoint.position DESC
  LIMIT 1
)
WHERE mission.objective_waypoint_id IS NULL;

CREATE TABLE solo_mission_advancements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL UNIQUE REFERENCES solo_missions(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  marks_required smallint NOT NULL DEFAULT 5 CHECK (marks_required = 5),
  selected_skills text[] NOT NULL DEFAULT '{}',
  roll_results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(roll_results) = 'array'),
  pending_heroic_abilities smallint NOT NULL DEFAULT 0 CHECK (pending_heroic_abilities >= 0),
  claimed_heroic_ability_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'selecting_marks'
    CHECK (status IN ('selecting_marks', 'ready_to_roll', 'claiming_abilities', 'complete')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solo_mission_advancements_campaign_status_idx
  ON solo_mission_advancements(campaign_id, status, created_at DESC);

CREATE TRIGGER solo_mission_advancements_set_updated_at
  BEFORE UPDATE ON solo_mission_advancements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
