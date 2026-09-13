CREATE TABLE solo_npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES solo_missions(id) ON DELETE SET NULL,
  waypoint_id uuid REFERENCES solo_waypoints(id) ON DELETE SET NULL,
  monster_id uuid NOT NULL UNIQUE REFERENCES monsters(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  template text NOT NULL CHECK (template IN ('minion', 'boss')),
  roles text[] NOT NULL CHECK (
    cardinality(roles) BETWEEN 1 AND 2
    AND roles <@ ARRAY['melee', 'ranged', 'sneaky', 'magic']::text[]
  ),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fled', 'surrendered', 'defeated')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solo_npcs_campaign_status_idx ON solo_npcs(campaign_id, status, created_at DESC);
CREATE INDEX solo_npcs_mission_idx ON solo_npcs(mission_id, created_at DESC);

CREATE TRIGGER solo_npcs_set_updated_at
  BEFORE UPDATE ON solo_npcs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'solo_npc_attack_melee', 'db-solo-v1.2', 'en', 6, 'rules', 'Solo NPC melee attacker',
  '[
    {"min":1,"max":3,"key":"deal_a_blow","label":"Deal a Blow!","summary":"The NPC makes a melee attack.","attack":true,"skill_roll":true,"modifier":"normal"},
    {"min":4,"max":4,"key":"defensive_stance","label":"Defensive Stance!","summary":"If the hero has not acted, swap initiative cards and the NPC parries or dodges with a boon. Otherwise the NPC attacks with a bane.","conditional":true,"initiative_swap":true,"defense_modifier":"boon","fallback_attack":true,"fallback_modifier":"bane"},
    {"min":5,"max":5,"key":"wild_attack","label":"Wild Attack!","summary":"Attack with a boon. On a hit, inflict an extra D6 damage and knock the target down; attacks against the NPC before its next turn also gain a boon.","attack":true,"skill_roll":true,"modifier":"boon","extra_damage":"1d6","knock_down":true,"incoming_attack_modifier":"boon"},
    {"min":6,"max":6,"key":"intimidating_rage","label":"Intimidating Rage!","summary":"The NPC roars or rampages. The hero rolls against WIL to resist fear.","target_check":"WIL","effect":"fear"}
  ]'::jsonb
),
(
  'solo_npc_attack_ranged', 'db-solo-v1.2', 'en', 6, 'rules', 'Solo NPC ranged attacker',
  '[
    {"min":1,"max":3,"key":"take_a_shot","label":"Take a Shot!","summary":"The NPC makes a ranged attack.","attack":true,"skill_roll":true,"modifier":"normal"},
    {"min":4,"max":4,"key":"hold","label":"Hold!","summary":"The NPC moves to a better position or readies a shot. On its next turn the shot hits automatically unless successfully dodged or parried.","setup":true,"delayed_attack":true,"next_attack_automatic":true,"defendable":true},
    {"min":5,"max":5,"key":"volley","label":"Volley!","summary":"The NPC attacks twice this turn. Both attacks have a bane.","attack":true,"skill_roll":true,"modifier":"bane","attack_count":2},
    {"min":6,"max":6,"key":"deadly_shot","label":"Deadly Shot!","summary":"The NPC attacks with a bane and inflicts an extra 2D6 damage on a hit.","attack":true,"skill_roll":true,"modifier":"bane","extra_damage":"2d6"}
  ]'::jsonb
),
(
  'solo_npc_attack_sneaky', 'db-solo-v1.2', 'en', 6, 'rules', 'Solo NPC sneaky attacker',
  '[
    {"min":1,"max":3,"key":"cunning_strike","label":"Cunning Strike!","summary":"The NPC attacks with its current weapon.","attack":true,"skill_roll":true,"modifier":"normal"},
    {"min":4,"max":4,"key":"on_the_move","label":"On the Move!","summary":"The NPC changes approach or weapon between melee and ranged, then attacks on its next turn with a boon.","setup":true,"switch_approach":true,"next_attack_modifier":"boon"},
    {"min":5,"max":5,"key":"devious_feint","label":"Devious Feint!","summary":"The hero makes an INT roll. Success permits dodge or parry with a boon; failure means the NPC automatically hits for an extra D6 damage and cannot be dodged or parried.","target_check":"INT","success_defense_modifier":"boon","failure_automatic_hit":true,"failure_extra_damage":"1d6","failure_defendable":false},
    {"min":6,"max":6,"key":"sneak_attack","label":"Sneak Attack!","summary":"The NPC hides. The hero makes an AWARENESS roll; failure means the NPC automatically hits next turn for an extra 2D6 damage and cannot be dodged or parried.","setup":true,"target_check":"AWARENESS","delayed_attack":true,"failure_automatic_hit":true,"failure_extra_damage":"2d6","failure_defendable":false}
  ]'::jsonb
),
(
  'solo_npc_attack_magic', 'db-solo-v1.2', 'en', 6, 'rules', 'Solo NPC magic attacker',
  '[
    {"min":1,"max":3,"key":"magic_bolt","label":"Magic Bolt!","summary":"The NPC casts an attack spell that inflicts 2D6 damage against one target.","automatic":true,"damage":"2d6","area":"single_target","uses_wp":false},
    {"min":4,"max":4,"key":"magic_blast","label":"Magic Blast!","summary":"The NPC casts an attack spell that inflicts 3D6 damage against any targets within 10 meters.","automatic":true,"damage":"3d6","area":"10_meters","uses_wp":false},
    {"min":5,"max":5,"key":"arcane_shield","label":"Arcane Shield!","summary":"The NPC automatically gains a 2D6 damage shield. Maintaining it requires a free skill roll each later round; further uses add D6 protection.","automatic":true,"shield":"2d6","maintenance_skill_roll":true,"additional_shield":"1d6","uses_wp":false},
    {"min":6,"max":6,"key":"mystic_mysteries","label":"Mystic Mysteries!","summary":"Roll Action and Thing on the Inspiration table and interpret the spell effect.","inspiration_columns":["action","thing"],"uses_wp":false}
  ]'::jsonb
)
ON CONFLICT (table_key, version, locale) DO UPDATE SET
  die_sides = EXCLUDED.die_sides,
  source_kind = EXCLUDED.source_kind,
  display_name = EXCLUDED.display_name,
  entries = EXCLUDED.entries;
