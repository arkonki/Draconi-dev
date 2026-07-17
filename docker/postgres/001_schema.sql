CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'dm', 'admin')),
  first_name text,
  last_name text,
  avatar_url text,
  bio text,
  is_active boolean NOT NULL DEFAULT true,
  is_email_verified boolean NOT NULL DEFAULT true,
  account_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE app_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_sessions_user_id_idx ON app_sessions(user_id);
CREATE INDEX app_sessions_expires_at_idx ON app_sessions(expires_at);

CREATE TABLE magic_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE heroic_abilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  willpower_cost integer,
  requirement text,
  profession text,
  kin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_heroic_abilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  willpower_cost integer,
  requirement text,
  profession text,
  kin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  heroic_ability text,
  abilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  kin_abilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_attribute text,
  typical_profession text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  key_attribute text,
  skills text[] NOT NULL DEFAULT '{}',
  heroic_ability text,
  magic_school_id uuid REFERENCES magic_schools(id) ON DELETE SET NULL,
  is_magic boolean NOT NULL DEFAULT false,
  associated_skill text,
  starting_equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment_description jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  base_attribute text,
  attribute text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_spells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rank integer NOT NULL DEFAULT 0,
  school text,
  school_id uuid REFERENCES magic_schools(id) ON DELETE SET NULL,
  prerequisite text,
  requirement text,
  casting_requirement text,
  casting_time text,
  range text,
  duration text,
  description text,
  willpower_cost integer NOT NULL DEFAULT 0,
  dice text,
  power_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, school_id)
);

CREATE TABLE game_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'General',
  cost text,
  weight numeric,
  description text,
  effect text,
  requirement text,
  damage text,
  armor_rating text,
  range text,
  grip text,
  durability text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  skill text,
  strength_requirement text,
  supply text,
  quantity integer NOT NULL DEFAULT 1,
  equippable boolean NOT NULL DEFAULT false,
  encumbrance_modifier numeric NOT NULL DEFAULT 1,
  is_container boolean NOT NULL DEFAULT false,
  container_capacity integer,
  is_consumable boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  idx integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE monsters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  category text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  attacks jsonb NOT NULL DEFAULT '[]'::jsonb,
  effects_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bio_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  appearance jsonb NOT NULL DEFAULT '[]'::jsonb,
  mementos jsonb NOT NULL DEFAULT '[]'::jsonb,
  flaws jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE DEFAULT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kin text,
  profession text,
  key_attribute text,
  magic_school uuid REFERENCES magic_schools(id) ON DELETE SET NULL,
  age text,
  appearance text,
  background text,
  notes text,
  portrait_url text,
  memento text,
  weak_spot text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_hp integer NOT NULL DEFAULT 10,
  current_hp integer NOT NULL DEFAULT 10,
  max_wp integer NOT NULL DEFAULT 10,
  current_wp integer NOT NULL DEFAULT 10,
  skill_levels jsonb NOT NULL DEFAULT '{}'::jsonb,
  trained_skills text[] NOT NULL DEFAULT '{}',
  marked_skills text[] NOT NULL DEFAULT '{}',
  spells jsonb NOT NULL DEFAULT '[]'::jsonb,
  prepared_spells text[] NOT NULL DEFAULT '{}',
  heroic_ability text[] NOT NULL DEFAULT '{}',
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  starting_equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  experience jsonb NOT NULL DEFAULT '{}'::jsonb,
  teacher jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_rallied boolean NOT NULL DEFAULT false,
  death_rolls_passed integer NOT NULL DEFAULT 0,
  death_rolls_failed integer NOT NULL DEFAULT 0,
  reputation integer NOT NULL DEFAULT 0,
  corruption integer NOT NULL DEFAULT 0,
  party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX characters_user_id_idx ON characters(user_id);
CREATE INDEX characters_party_id_idx ON characters(party_id);

CREATE TABLE party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, character_id)
);
CREATE INDEX party_members_user_id_idx ON party_members(user_id);

CREATE OR REPLACE FUNCTION sync_party_member_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id FROM characters WHERE id = NEW.character_id;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Character does not exist';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER party_members_sync_user BEFORE INSERT OR UPDATE OF character_id
ON party_members FOR EACH ROW EXECUTE FUNCTION sync_party_member_user();

CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  party_id uuid REFERENCES parties(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  description text,
  category text NOT NULL DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_inventory_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  from_type text,
  from_id uuid,
  to_type text,
  to_id uuid,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE time_trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  current_day integer NOT NULL DEFAULT 1,
  current_shift integer NOT NULL DEFAULT 1,
  grid_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE random_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  die_type text NOT NULL DEFAULT 'd20',
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE story_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  response text NOT NULL DEFAULT '',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compendium (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  folder text,
  tags text[] NOT NULL DEFAULT '{}',
  image_urls text[] NOT NULL DEFAULT '{}',
  party_id uuid REFERENCES parties(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compendium_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed')),
  current_round integer NOT NULL DEFAULT 0,
  active_combatant_id uuid,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE encounter_combatants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  monster_id uuid REFERENCES monsters(id) ON DELETE SET NULL,
  is_player_character boolean NOT NULL,
  display_name text NOT NULL,
  initiative_roll integer,
  current_hp integer NOT NULL DEFAULT 0,
  max_hp integer NOT NULL DEFAULT 0,
  current_wp integer,
  max_wp integer,
  status_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active_turn boolean NOT NULL DEFAULT false,
  has_acted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE encounters
  ADD CONSTRAINT encounters_active_combatant_fk
  FOREIGN KEY (active_combatant_id) REFERENCES encounter_combatants(id) ON DELETE SET NULL;

CREATE TABLE party_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  grid_type text NOT NULL DEFAULT 'none' CHECK (grid_type IN ('none', 'square', 'hex')),
  grid_enabled boolean NOT NULL DEFAULT false,
  grid_size integer NOT NULL DEFAULT 50,
  grid_opacity numeric NOT NULL DEFAULT 0.35,
  grid_offset_x numeric NOT NULL DEFAULT 0,
  grid_offset_y numeric NOT NULL DEFAULT 0,
  grid_color text NOT NULL DEFAULT '#ffffff',
  grid_rotation numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_map_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES party_maps(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  x numeric NOT NULL,
  y numeric NOT NULL,
  label text,
  description text,
  color text NOT NULL DEFAULT '#ef4444',
  icon text,
  type text NOT NULL DEFAULT 'location' CHECK (type IN ('location', 'character', 'note', 'player_start')),
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_map_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES party_maps(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text NOT NULL DEFAULT '#ef4444',
  thickness numeric NOT NULL DEFAULT 3,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_display_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_map_id uuid REFERENCES party_maps(id) ON DELETE SET NULL,
  display_image_url text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_display_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES party_display_sessions(id) ON DELETE CASCADE,
  corner text NOT NULL CHECK (corner IN ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  rotation_deg integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, corner),
  UNIQUE (session_id, sort_order)
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text,
  auth text,
  expiration_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_new_message boolean NOT NULL DEFAULT false,
  email_party_invite boolean NOT NULL DEFAULT false,
  email_session_scheduled boolean NOT NULL DEFAULT false,
  email_system_updates boolean NOT NULL DEFAULT false,
  desktop_new_message boolean NOT NULL DEFAULT true,
  desktop_party_invite boolean NOT NULL DEFAULT true,
  desktop_session_scheduled boolean NOT NULL DEFAULT true,
  desktop_dice_rolls boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  sound_volume numeric NOT NULL DEFAULT 0.7,
  sound_dice_rolls boolean NOT NULL DEFAULT true,
  sound_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_change_events (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  event_type text NOT NULL,
  record_id uuid,
  old_record jsonb,
  new_record jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_change_events_created_at_idx ON app_change_events(created_at);

CREATE OR REPLACE FUNCTION log_app_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_json jsonb;
  new_json jsonb;
  changed_id uuid;
BEGIN
  old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  changed_id := COALESCE((new_json->>'id')::uuid, (old_json->>'id')::uuid);
  INSERT INTO app_change_events(table_name, event_type, record_id, old_record, new_record)
  VALUES (TG_TABLE_NAME, TG_OP, changed_id, old_json, new_json);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_to_touch text;
BEGIN
  FOREACH table_to_touch IN ARRAY ARRAY[
    'users', 'app_credentials', 'magic_schools', 'heroic_abilities',
    'game_heroic_abilities', 'kin', 'professions', 'game_skills',
    'game_spells', 'game_items', 'monsters', 'bio_data', 'parties',
    'characters', 'notes', 'party_inventory', 'party_tasks', 'time_trackers',
    'random_tables', 'story_ideas', 'compendium', 'compendium_templates',
    'encounters', 'encounter_combatants', 'party_maps', 'party_map_pins',
    'party_display_sessions', 'party_display_slots', 'push_subscriptions',
    'user_notification_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_to_touch, table_to_touch
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_to_watch text;
BEGIN
  FOREACH table_to_watch IN ARRAY ARRAY[
    'messages', 'party_inventory', 'party_inventory_log', 'party_members',
    'characters', 'party_map_pins', 'party_map_drawings', 'encounters',
    'encounter_combatants', 'party_display_slots'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_app_change()',
      table_to_watch, table_to_watch
    );
  END LOOP;
END;
$$;
