-- Storage as the rulebook has it. A worn backpack or saddle bag only adds carrying slots; chests, baskets and barrels
-- hold things; vehicles carry cargo for the whole party, so they live in the party stash.

-- 1. Vehicles carry the weight units the rulebook gives them (page 81).
UPDATE game_items g
SET is_container = true, container_capacity = v.capacity
FROM (VALUES ('canoe', 10), ('cart', 50), ('rowing boat', 50), ('sailing boat', 100), ('wagon', 100)) AS v(name, capacity)
WHERE g.party_id IS NULL AND lower(btrim(g.name)) = v.name;

-- 2. Stash items can be loaded onto a vehicle in the same stash. Removing the vehicle leaves its cargo in the stash.
ALTER TABLE party_inventory ADD COLUMN IF NOT EXISTS stored_in uuid;
CREATE UNIQUE INDEX IF NOT EXISTS party_inventory_party_id_id_key ON party_inventory (party_id, id);
ALTER TABLE party_inventory
  ADD CONSTRAINT party_inventory_stored_in_fkey
  FOREIGN KEY (party_id, stored_in) REFERENCES party_inventory (party_id, id) ON DELETE SET NULL (stored_in);
CREATE INDEX IF NOT EXISTS party_inventory_stored_in_idx ON party_inventory (stored_in) WHERE stored_in IS NOT NULL;

-- 3. Items once put "in" a backpack are simply carried, and items in a saddle bag ride on the bag's mount.
CREATE FUNCTION pg_temp.storage_after_packs(equipment jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  packs jsonb := '{}'::jsonb;  -- pack id -> the mount it hangs on, or null when worn
  container jsonb;
  holds_things boolean;
  entry jsonb;
  result jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(equipment->'equipped'->'containers') <> 'array' OR jsonb_typeof(equipment->'inventory') <> 'array' THEN
    RETURN equipment;
  END IF;
  FOR container IN SELECT * FROM jsonb_array_elements(equipment->'equipped'->'containers') LOOP
    holds_things := false;
    SELECT coalesce(g.is_container, false) INTO holds_things FROM game_items g
    WHERE g.id::text = container->>'definitionId' OR lower(btrim(g.name)) = lower(btrim(container->>'name'))
    ORDER BY g.party_id NULLS FIRST LIMIT 1;
    IF container->>'id' IS NOT NULL AND NOT coalesce(holds_things, false) THEN
      packs := packs || jsonb_build_object(container->>'id', container->'equippedOn');
    END IF;
  END LOOP;
  IF packs = '{}'::jsonb THEN RETURN equipment; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(equipment->'inventory') LOOP
    IF entry->>'containerId' IS NOT NULL AND packs ? (entry->>'containerId') THEN
      entry := CASE WHEN jsonb_typeof(packs->(entry->>'containerId')) = 'string'
        THEN entry || jsonb_build_object('containerId', packs->(entry->>'containerId'))
        ELSE entry - 'containerId' END;
    END IF;
    result := result || jsonb_build_array(entry);
  END LOOP;
  RETURN jsonb_set(equipment, '{inventory}', result);
END;
$$;

UPDATE characters
SET equipment = pg_temp.storage_after_packs(equipment)
WHERE jsonb_typeof(equipment) = 'object'
  AND equipment IS DISTINCT FROM pg_temp.storage_after_packs(equipment);
