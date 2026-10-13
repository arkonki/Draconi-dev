-- The shared table: one map per campaign that every player sees on their own screen, with tokens the GM
-- can reveal or hide. Positions are stored as fractions of the map's width and height (0 to 1) so they
-- survive a different image size, and they are kept per map, so switching scenes and coming back keeps
-- every token where it was.

CREATE TABLE IF NOT EXISTS party_table_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL UNIQUE REFERENCES parties(id) ON DELETE CASCADE,
  -- The scene players are looking at. NULL means the table is empty.
  map_id uuid REFERENCES party_maps(id) ON DELETE SET NULL,
  -- Raised whenever something players could have been shown is taken away, because a hidden row produces no
  -- change event they are allowed to receive. Players watch this to know when to refresh.
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  map_id uuid NOT NULL REFERENCES party_maps(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'prop' CHECK (kind IN ('character', 'monster', 'npc', 'prop')),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  image_url text,
  character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  monster_id uuid REFERENCES monsters(id) ON DELETE SET NULL,
  x numeric NOT NULL DEFAULT 0.5 CHECK (x >= 0 AND x <= 1),
  y numeric NOT NULL DEFAULT 0.5 CHECK (y >= 0 AND y <= 1),
  -- Diameter in grid squares (or a fraction of the map width when the map has no grid).
  size numeric NOT NULL DEFAULT 1 CHECK (size >= 0.25 AND size <= 12),
  color text NOT NULL DEFAULT '#6366f1',
  -- Only revealed items are ever sent to players.
  visible boolean NOT NULL DEFAULT false,
  -- A locked token cannot be moved by its player.
  locked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS table_items_map_idx ON table_items (map_id);
CREATE INDEX IF NOT EXISTS table_items_party_idx ON table_items (party_id);
-- A character appears once per map.
CREATE UNIQUE INDEX IF NOT EXISTS table_items_map_character_key
  ON table_items (map_id, character_id) WHERE character_id IS NOT NULL;

CREATE OR REPLACE FUNCTION touch_table_state_on_hide()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT OLD.visible THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.visible AND NOT NEW.visible) THEN RETURN NEW; END IF;
  -- When the whole campaign is being deleted its tokens go with it, and there is nothing left to refresh.
  IF NOT EXISTS (SELECT 1 FROM parties WHERE id = COALESCE(NEW.party_id, OLD.party_id)) THEN RETURN COALESCE(NEW, OLD); END IF;
  INSERT INTO party_table_state (party_id, revision)
  VALUES (COALESCE(NEW.party_id, OLD.party_id), 1)
  ON CONFLICT (party_id) DO UPDATE SET revision = party_table_state.revision + 1, updated_at = now();
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER table_items_set_updated_at
  BEFORE UPDATE ON table_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER table_items_log_change
  AFTER INSERT OR UPDATE OR DELETE ON table_items
  FOR EACH ROW EXECUTE FUNCTION log_app_change();
CREATE TRIGGER table_items_touch_state
  AFTER UPDATE OR DELETE ON table_items
  FOR EACH ROW EXECUTE FUNCTION touch_table_state_on_hide();

CREATE TRIGGER party_table_state_set_updated_at
  BEFORE UPDATE ON party_table_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER party_table_state_log_change
  AFTER INSERT OR UPDATE OR DELETE ON party_table_state
  FOR EACH ROW EXECUTE FUNCTION log_app_change();
