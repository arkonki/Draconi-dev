ALTER TABLE heroic_abilities
  ADD COLUMN IF NOT EXISTS rule_key text,
  ADD COLUMN IF NOT EXISTS activation_type text NOT NULL DEFAULT 'manual';

ALTER TABLE heroic_abilities
  DROP CONSTRAINT IF EXISTS heroic_abilities_activation_type_check,
  ADD CONSTRAINT heroic_abilities_activation_type_check
    CHECK (activation_type IN ('manual', 'passive', 'contextual'));

CREATE UNIQUE INDEX IF NOT EXISTS heroic_abilities_rule_key_unique
  ON heroic_abilities(rule_key) WHERE rule_key IS NOT NULL;

ALTER TABLE game_heroic_abilities
  ADD COLUMN IF NOT EXISTS rule_key text,
  ADD COLUMN IF NOT EXISTS activation_type text NOT NULL DEFAULT 'manual';

ALTER TABLE game_heroic_abilities
  DROP CONSTRAINT IF EXISTS game_heroic_abilities_activation_type_check,
  ADD CONSTRAINT game_heroic_abilities_activation_type_check
    CHECK (activation_type IN ('manual', 'passive', 'contextual'));

CREATE UNIQUE INDEX IF NOT EXISTS game_heroic_abilities_rule_key_unique
  ON game_heroic_abilities(rule_key) WHERE rule_key IS NOT NULL;

INSERT INTO heroic_abilities (
  id, name, description, willpower_cost, requirement, profession, kin,
  rule_key, activation_type
) VALUES
  (
    '30000000-0000-4000-8000-000000000101',
    'Army of One',
    'When fighting alone, draw two initiative cards, keep both, and take two turns each round.',
    NULL,
    'Solo character; applies only while fighting without another player character.',
    NULL,
    NULL,
    'solo.army_of_one',
    'passive'
  ),
  (
    '30000000-0000-4000-8000-000000000102',
    'Sole Survivor',
    'When adventuring alone, spend 3 WP to push a roll without taking a condition.',
    3,
    'Solo character; choose this cost while pushing a failed roll.',
    NULL,
    NULL,
    'solo.sole_survivor',
    'contextual'
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  willpower_cost = EXCLUDED.willpower_cost,
  requirement = EXCLUDED.requirement,
  rule_key = EXCLUDED.rule_key,
  activation_type = EXCLUDED.activation_type,
  updated_at = now();

INSERT INTO game_heroic_abilities (
  id, name, description, willpower_cost, requirement, profession, kin,
  rule_key, activation_type
)
SELECT
  id, name, description, willpower_cost, requirement, profession, kin,
  rule_key, activation_type
FROM heroic_abilities
WHERE rule_key IN ('solo.army_of_one', 'solo.sole_survivor')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  willpower_cost = EXCLUDED.willpower_cost,
  requirement = EXCLUDED.requirement,
  rule_key = EXCLUDED.rule_key,
  activation_type = EXCLUDED.activation_type,
  updated_at = now();

ALTER TABLE solo_campaign_states
  ADD COLUMN IF NOT EXISTS solo_heroic_ability_id uuid REFERENCES heroic_abilities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solo_heroic_ability_granted boolean NOT NULL DEFAULT false;

ALTER TABLE encounter_combatants
  ADD COLUMN IF NOT EXISTS initiative_slots integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS completed_initiative_slots integer[] NOT NULL DEFAULT '{}'::integer[];

UPDATE encounter_combatants
SET initiative_slots = ARRAY[initiative_roll]
WHERE initiative_roll IS NOT NULL AND cardinality(initiative_slots) = 0;

ALTER TABLE encounter_combatants
  DROP CONSTRAINT IF EXISTS encounter_combatants_initiative_slots_check,
  ADD CONSTRAINT encounter_combatants_initiative_slots_check
    CHECK (
      cardinality(initiative_slots) <= 2
      AND initiative_slots <@ ARRAY[1,2,3,4,5,6,7,8,9,10]
      AND (cardinality(initiative_slots) <= 1 OR initiative_slots[1] <> initiative_slots[2])
    ),
  DROP CONSTRAINT IF EXISTS encounter_combatants_completed_initiative_slots_check,
  ADD CONSTRAINT encounter_combatants_completed_initiative_slots_check
    CHECK (completed_initiative_slots <@ initiative_slots);

ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS active_initiative_slot integer
    CHECK (active_initiative_slot BETWEEN 1 AND 10);
