CREATE TABLE solo_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  module_key text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'briefing'
    CHECK (status IN ('briefing', 'active', 'returning', 'success', 'failure', 'abandoned')),
  current_waypoint_index integer NOT NULL DEFAULT 0 CHECK (current_waypoint_index >= 0),
  active_threat_id uuid,
  discovered_clues jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(discovered_clues) = 'array'),
  story_flags jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(story_flags) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX solo_missions_one_current_per_campaign
  ON solo_missions(campaign_id)
  WHERE status IN ('active', 'returning');
CREATE INDEX solo_missions_campaign_created_idx
  ON solo_missions(campaign_id, created_at DESC);
CREATE TRIGGER solo_missions_set_updated_at
  BEFORE UPDATE ON solo_missions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE solo_waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES solo_missions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  kind text NOT NULL CHECK (kind IN ('foreseen', 'unknown', 'diversion', 'return_route')),
  status text NOT NULL DEFAULT 'hidden'
    CHECK (status IN ('hidden', 'revealed', 'active', 'resolved', 'bypassed')),
  title text,
  description text,
  danger_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(danger_ids) = 'array'),
  npc_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(npc_ids) = 'array'),
  encounter_id uuid REFERENCES encounters(id) ON DELETE SET NULL,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(notes) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, position)
);
CREATE INDEX solo_waypoints_mission_position_idx
  ON solo_waypoints(mission_id, position);
CREATE TRIGGER solo_waypoints_set_updated_at
  BEFORE UPDATE ON solo_waypoints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Hidden content is deliberately kept out of the public waypoint row. API reads
-- can select solo_waypoints without any possibility of accidentally serializing
-- unrevealed content.
CREATE TABLE solo_waypoint_secrets (
  waypoint_id uuid PRIMARY KEY REFERENCES solo_waypoints(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  generated_from jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(generated_from) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE solo_threats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES solo_missions(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  counter smallint NOT NULL DEFAULT 1 CHECK (counter BETWEEN 1 AND 6),
  recurring boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'triggered', 'resolved', 'removed')),
  trigger_effect jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(trigger_effect) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solo_threats_mission_status_idx
  ON solo_threats(mission_id, status);
CREATE TRIGGER solo_threats_set_updated_at
  BEFORE UPDATE ON solo_threats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE solo_missions
  ADD CONSTRAINT solo_missions_active_threat_fkey
  FOREIGN KEY (active_threat_id) REFERENCES solo_threats(id) ON DELETE SET NULL;

ALTER TABLE solo_campaign_states
  ADD COLUMN current_mission_id uuid,
  ADD CONSTRAINT solo_campaign_states_current_mission_fkey
    FOREIGN KEY (current_mission_id) REFERENCES solo_missions(id) ON DELETE SET NULL;
