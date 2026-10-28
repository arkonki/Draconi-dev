-- Custom items a GM makes for one campaign belong to that campaign. Items without a party are the shared item list.
ALTER TABLE game_items
  ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES parties(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS game_items_party_id_idx ON game_items (party_id) WHERE party_id IS NOT NULL;

-- Names were unique across the whole table, so one campaign's "Old Key" would block every other campaign's.
-- Shared items keep unique names; each campaign's items are unique within that campaign.
DO $$
DECLARE
  name_constraint text;
BEGIN
  FOR name_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.game_items'::regclass
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'name'
  LOOP
    EXECUTE format('ALTER TABLE game_items DROP CONSTRAINT %I', name_constraint);
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS game_items_shared_name_key ON game_items (name) WHERE party_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS game_items_party_name_key ON game_items (party_id, name) WHERE party_id IS NOT NULL;
