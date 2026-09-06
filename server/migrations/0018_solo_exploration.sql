CREATE TABLE solo_waypoint_exploration (
  waypoint_id uuid PRIMARY KEY REFERENCES solo_waypoints(id) ON DELETE CASCADE,
  search_count integer NOT NULL DEFAULT 0 CHECK (search_count >= 0),
  scavenge_count integer NOT NULL DEFAULT 0 CHECK (scavenge_count >= 0),
  stretches_spent integer NOT NULL DEFAULT 0 CHECK (stretches_spent >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER solo_waypoint_exploration_set_updated_at
  BEFORE UPDATE ON solo_waypoint_exploration
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'exploration_find', 'draconi-generic-v1', 'en', 10, 'generic', 'Generic exploration findings',
  '[
    {"min":1,"max":1,"key":"danger","label":"A danger is revealed","kind":"danger"},
    {"min":2,"max":3,"key":"nothing","label":"Nothing useful","kind":"nothing"},
    {"min":4,"max":6,"key":"supplies","label":"Useful supplies","kind":"supplies"},
    {"min":7,"max":9,"key":"interesting_item","label":"An interesting item","kind":"item"},
    {"min":10,"max":10,"key":"treasure_opportunity","label":"A treasure opportunity","kind":"treasure","reroll":true}
  ]'::jsonb
)
ON CONFLICT (table_key, version, locale) DO NOTHING;
