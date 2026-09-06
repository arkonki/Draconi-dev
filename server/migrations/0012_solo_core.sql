CREATE TABLE solo_campaign_states (
  campaign_id uuid PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  ruleset_version text NOT NULL DEFAULT 'db-solo-v1.2',
  mode text NOT NULL DEFAULT 'custom'
    CHECK (mode IN ('custom', 'deepfall_breach')),
  player_character_id uuid REFERENCES characters(id) ON DELETE RESTRICT,
  advancement_bonus_abilities_granted smallint NOT NULL DEFAULT 0
    CHECK (advancement_bonus_abilities_granted BETWEEN 0 AND 2),
  oracle_default_tilt text NOT NULL DEFAULT 'ask'
    CHECK (oracle_default_tilt IN ('even', 'ask')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER solo_campaign_states_set_updated_at
  BEFORE UPDATE ON solo_campaign_states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE solo_rule_tables (
  table_key text NOT NULL,
  version text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  die_sides smallint NOT NULL CHECK (die_sides BETWEEN 2 AND 100),
  source_kind text NOT NULL CHECK (source_kind IN ('rules', 'generic', 'user_data_pack')),
  display_name text NOT NULL,
  entries jsonb NOT NULL CHECK (jsonb_typeof(entries) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_key, version, locale)
);

INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'fortune', 'db-solo-v1.2', 'en', 6, 'rules', 'Fortune oracle',
  '[
    {"min":1,"max":1,"values":{"yes_no":"extreme no","number":"none/one","scale":"small","power":"weak","quality":"flawed","reaction":"hostile"}},
    {"min":2,"max":3,"values":{"yes_no":"no","number":"few","scale":"moderate","power":"minor","quality":"mundane","reaction":"wary"}},
    {"min":4,"max":5,"values":{"yes_no":"yes","number":"several","scale":"large","power":"formidable","quality":"fine","reaction":"open"}},
    {"min":6,"max":6,"values":{"yes_no":"extreme yes","number":"numerous","scale":"immense","power":"incredible","quality":"precious","reaction":"friendly"}}
  ]'::jsonb
),
(
  'inspiration_action', 'draconi-generic-v1', 'en', 20, 'generic', 'Generic action inspiration',
  '["seek","reveal","protect","confront","escape","restore","betray","discover","bargain","follow","hide","destroy","create","change","delay","warn","unite","separate","recover","sacrifice"]'::jsonb
),
(
  'inspiration_attribute', 'draconi-generic-v1', 'en', 20, 'generic', 'Generic attribute inspiration',
  '["ancient","broken","hidden","dangerous","valuable","cursed","forgotten","unstable","sacred","hostile","lost","deceptive","distant","urgent","living","silent","corrupted","familiar","impossible","unexpected"]'::jsonb
),
(
  'inspiration_thing', 'draconi-generic-v1', 'en', 20, 'generic', 'Generic thing inspiration',
  '["person","creature","place","passage","object","weapon","message","secret","oath","memory","resource","ruin","settlement","storm","trap","rival","ally","spirit","treasure","portal"]'::jsonb
);

CREATE TABLE recorded_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  session_id uuid REFERENCES game_sessions(id) ON DELETE SET NULL,
  encounter_id uuid REFERENCES encounters(id) ON DELETE SET NULL,
  actor_id uuid,
  source_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 200),
  source text NOT NULL CHECK (source IN ('server', 'manual', 'mixed')),
  expression text NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 100),
  dice integer[] NOT NULL CHECK (cardinality(dice) > 0),
  kept_indices integer[] NOT NULL DEFAULT '{}',
  kept_values integer[] NOT NULL DEFAULT '{}',
  table_key text,
  table_version text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_roll_id uuid REFERENCES recorded_rolls(id) ON DELETE SET NULL,
  campaign_revision bigint NOT NULL CHECK (campaign_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recorded_rolls_campaign_created_idx
  ON recorded_rolls(campaign_id, created_at DESC);
CREATE INDEX recorded_rolls_session_idx
  ON recorded_rolls(session_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_recorded_roll_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'recorded_rolls is immutable';
END;
$$;

CREATE TRIGGER recorded_rolls_prevent_update
  BEFORE UPDATE ON recorded_rolls
  FOR EACH ROW EXECUTE FUNCTION prevent_recorded_roll_update();
