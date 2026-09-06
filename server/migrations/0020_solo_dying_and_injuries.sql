CREATE TABLE IF NOT EXISTS character_injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source_roll_id uuid REFERENCES recorded_rolls(id) ON DELETE SET NULL,
  injury_key text NOT NULL,
  name text NOT NULL,
  effect text NOT NULL,
  healing_days integer CHECK (healing_days IS NULL OR healing_days >= 1),
  permanent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'healed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_injuries_character_status_idx
  ON character_injuries(character_id, status, created_at DESC);

DROP TRIGGER IF EXISTS set_character_injuries_updated_at ON character_injuries;
CREATE TRIGGER set_character_injuries_updated_at
BEFORE UPDATE ON character_injuries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'narrative_damage_severity', 'db-solo-v1.2', 'en', 6, 'rules', 'Narrative damage severity',
  '[
    {"min":1,"max":2,"key":"slight","label":"Slight","damage_dice":{"count":1,"sides":6}},
    {"min":3,"max":5,"key":"moderate","label":"Moderate","damage_dice":{"count":2,"sides":6}},
    {"min":6,"max":6,"key":"severe","label":"Severe","damage_dice":{"count":2,"sides":10}}
  ]'::jsonb
),
(
  'severe_injury', 'dragonbane-core-existing-v1', 'en', 20, 'rules', 'Severe injuries',
  '[
    {"min":1,"max":2,"key":"broken_nose","name":"Broken nose","effect":"Bane on Awareness.","healing_dice":{"count":1,"sides":6}},
    {"min":3,"max":4,"key":"scarred_face","name":"Scarred face","effect":"Bane on Performance and Persuasion.","healing_dice":{"count":2,"sides":6}},
    {"min":5,"max":6,"key":"teeth_knocked_out","name":"Teeth knocked out","effect":"Performance and Persuasion are reduced by 2.","permanent":true},
    {"min":7,"max":8,"key":"broken_ribs","name":"Broken ribs","effect":"Bane on STR- and AGL-based skills.","healing_dice":{"count":1,"sides":6}},
    {"min":9,"max":10,"key":"concussion","name":"Concussion","effect":"Bane on INT-based skills.","healing_dice":{"count":1,"sides":6}},
    {"min":11,"max":12,"key":"deep_wounds","name":"Deep wounds","effect":"Bane on STR- and AGL-based skills; a failed exertion roll causes D6 damage.","healing_dice":{"count":2,"sides":6}},
    {"min":13,"max":13,"key":"broken_leg","name":"Broken leg","effect":"Movement is halved.","healing_dice":{"count":3,"sides":6}},
    {"min":14,"max":14,"key":"broken_arm","name":"Broken arm","effect":"No two-handed weapons or dual wielding; bane on climbing.","healing_dice":{"count":3,"sides":6}},
    {"min":15,"max":15,"key":"severed_toe","name":"Severed toe","effect":"Movement is reduced by 2.","permanent":true},
    {"min":16,"max":16,"key":"severed_finger","name":"Severed finger","effect":"Weapon skills are reduced by 1, to a minimum of 3.","permanent":true},
    {"min":17,"max":17,"key":"gouged_eye","name":"Gouged eye","effect":"Spot Hidden is reduced by 2, to a minimum of 3.","permanent":true},
    {"min":18,"max":18,"key":"nightmares","name":"Nightmares","effect":"A Fear test is required to sleep.","healing_dice":{"count":2,"sides":6}},
    {"min":19,"max":19,"key":"changed_personality","name":"Changed personality","effect":"Gain a new random weakness.","permanent":true},
    {"min":20,"max":20,"key":"amnesia","name":"Amnesia","effect":"The character forgets their identity.","healing_dice":{"count":1,"sides":6}}
  ]'::jsonb
)
ON CONFLICT (table_key, version, locale) DO NOTHING;
