CREATE INDEX IF NOT EXISTS parties_created_by_idx
  ON parties (created_by);

CREATE INDEX IF NOT EXISTS party_members_character_id_idx
  ON party_members (character_id);

CREATE INDEX IF NOT EXISTS notes_user_created_at_idx
  ON notes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notes_party_created_at_idx
  ON notes (party_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notes_character_created_at_idx
  ON notes (character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS party_inventory_party_id_idx
  ON party_inventory (party_id);

CREATE INDEX IF NOT EXISTS party_inventory_log_party_timestamp_idx
  ON party_inventory_log (party_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS party_tasks_party_id_idx
  ON party_tasks (party_id);

CREATE INDEX IF NOT EXISTS random_tables_party_id_idx
  ON random_tables (party_id);

CREATE INDEX IF NOT EXISTS story_ideas_party_id_idx
  ON story_ideas (party_id);

CREATE INDEX IF NOT EXISTS compendium_party_id_idx
  ON compendium (party_id);

CREATE INDEX IF NOT EXISTS compendium_created_by_idx
  ON compendium (created_by);

CREATE INDEX IF NOT EXISTS compendium_templates_created_by_idx
  ON compendium_templates (created_by);

CREATE INDEX IF NOT EXISTS encounters_party_status_updated_idx
  ON encounters (party_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS encounter_combatants_encounter_id_idx
  ON encounter_combatants (encounter_id);

CREATE INDEX IF NOT EXISTS party_maps_party_active_updated_idx
  ON party_maps (party_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS party_map_pins_map_id_idx
  ON party_map_pins (map_id);

CREATE INDEX IF NOT EXISTS party_map_drawings_map_id_idx
  ON party_map_drawings (map_id);

CREATE INDEX IF NOT EXISTS party_display_sessions_party_created_idx
  ON party_display_sessions (party_id, created_at DESC);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS app_change_events_table_id_idx
  ON app_change_events (table_name, id);
