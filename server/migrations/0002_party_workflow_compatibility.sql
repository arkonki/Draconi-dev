ALTER TABLE party_inventory_log
  ALTER COLUMN from_id TYPE text USING from_id::text,
  ALTER COLUMN to_id TYPE text USING to_id::text;

CREATE OR REPLACE FUNCTION sync_character_party_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.character_id <> NEW.character_id) THEN
    UPDATE characters
    SET party_id = (
      SELECT pm.party_id
      FROM party_members pm
      WHERE pm.character_id = OLD.character_id
      ORDER BY pm.created_at DESC
      LIMIT 1
    )
    WHERE id = OLD.character_id AND party_id = OLD.party_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    UPDATE characters SET party_id = NEW.party_id WHERE id = NEW.character_id;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER party_members_sync_character_party
AFTER INSERT OR UPDATE OR DELETE ON party_members
FOR EACH ROW EXECUTE FUNCTION sync_character_party_membership();
