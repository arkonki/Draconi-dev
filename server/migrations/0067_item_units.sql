-- One rule for items that come several to a purchase (listingUnits in shared/encumbrance.js): game_items.quantity is
-- how many units one purchase gives, weight is the slots for the whole purchase, and the name never carries the count.
-- Before this, "Bandages (10)" put the count in the name, while rope and lamp oil kept it in quantity with the weight
-- of one unit, and a 10 meter rope counted its meters as ten ropes.

CREATE TEMP TABLE item_unit_changes (
  id uuid PRIMARY KEY,
  kind text NOT NULL,          -- 'named': count was in the name; 'measured': quantity counted meters, not units
  old_name text NOT NULL,
  new_name text NOT NULL,
  units integer NOT NULL,      -- 'named': units in the pack; 'measured': the old quantity
  old_unit_weight numeric
) ON COMMIT DROP;

-- 1. "Bandages (10)" becomes "Bandages" with 10 units. Its weight already covers the whole pack. A name that would
--    clash with another item in the same list is left alone.
INSERT INTO item_unit_changes (id, kind, old_name, new_name, units)
SELECT g.id, 'named', g.name, m[1], m[2]::integer
FROM game_items g
CROSS JOIN LATERAL regexp_match(btrim(g.name), '^(.*\S)\s*\((\d+)\)$') AS m
WHERE m IS NOT NULL AND m[2]::integer > 1 AND m[2]::integer < 10000
  AND NOT EXISTS (
    SELECT 1 FROM game_items other
    WHERE other.id <> g.id AND other.party_id IS NOT DISTINCT FROM g.party_id AND lower(other.name) = lower(m[1])
  );

-- Two packs in one list could still both become the same name; keep only the first of those.
DELETE FROM item_unit_changes c
USING item_unit_changes earlier, game_items g, game_items g_earlier
WHERE c.kind = 'named' AND earlier.kind = 'named' AND c.id <> earlier.id
  AND g.id = c.id AND g_earlier.id = earlier.id
  AND g.party_id IS NOT DISTINCT FROM g_earlier.party_id
  AND lower(c.new_name) = lower(earlier.new_name) AND earlier.id < c.id;

-- 2. A 10 meter rope with quantity 10 is one rope, not ten.
INSERT INTO item_unit_changes (id, kind, old_name, new_name, units, old_unit_weight)
SELECT g.id, 'measured', g.name, g.name, g.quantity, g.weight
FROM game_items g
WHERE g.quantity > 1
  AND g.id NOT IN (SELECT id FROM item_unit_changes)
  AND g.name ~* ('(^|\D)' || g.quantity || '\s*(m|meters?|metres?)\M');

UPDATE game_items g SET name = c.new_name, quantity = c.units
FROM item_unit_changes c WHERE c.id = g.id AND c.kind = 'named';

-- Quantity listings held the weight of one unit; it becomes the weight of the whole purchase.
UPDATE game_items SET weight = trim_scale(weight * quantity)
WHERE quantity > 1 AND weight IS NOT NULL
  AND id NOT IN (SELECT id FROM item_unit_changes WHERE kind = 'named');

UPDATE game_items g SET quantity = 1, is_consumable = false
FROM item_unit_changes c WHERE c.id = g.id AND c.kind = 'measured';

-- 3. Inventories. A stored pack "Bandages (10)" becomes ten "Bandages"; a rope stored as ten meters becomes one rope.
CREATE FUNCTION pg_temp.item_in_units(entry jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  change item_unit_changes%ROWTYPE;
  quantity numeric;
  weight numeric;
  result jsonb := entry;
BEGIN
  IF jsonb_typeof(entry) <> 'object' THEN RETURN entry; END IF;
  quantity := CASE WHEN entry->>'quantity' ~ '^\d+(\.\d+)?$' THEN (entry->>'quantity')::numeric ELSE 1 END;
  weight := CASE WHEN entry->>'weight' ~ '^\d+(\.\d+)?$' THEN (entry->>'weight')::numeric END;

  SELECT c.* INTO change FROM item_unit_changes c JOIN game_items g ON g.id = c.id
  WHERE c.kind = 'named' AND lower(c.old_name) = lower(btrim(entry->>'name'))
  ORDER BY g.party_id NULLS FIRST LIMIT 1;
  -- A looted "Bandages (10)" x1 is one pack; old shop purchases kept that name on single units ("Arrows (20)" x20),
  -- so a whole number of packs is already counted in units (isStoredPack in shared/encumbrance.js).
  IF FOUND AND quantity >= change.units AND mod(quantity, change.units) = 0 THEN
    result := result || jsonb_build_object('name', change.new_name);
    IF NOT result ? 'definitionId' THEN result := result || jsonb_build_object('definitionId', change.id::text); END IF;
    RETURN result;
  ELSIF FOUND THEN
    result := result || jsonb_build_object('name', change.new_name, 'quantity', trim_scale(quantity * change.units));
    IF NOT result ? 'definitionId' THEN result := result || jsonb_build_object('definitionId', change.id::text); END IF;
    IF weight IS NOT NULL AND coalesce(entry->>'weightBasis', '') <> 'unit' THEN
      result := result || jsonb_build_object('weight', trim_scale(weight / change.units), 'weightBasis', 'unit');
    END IF;
    RETURN result;
  END IF;

  SELECT c.* INTO change FROM item_unit_changes c JOIN game_items g ON g.id = c.id
  WHERE c.kind = 'measured'
    AND (entry->>'definitionId' = c.id::text
      OR lower(btrim(entry->>'name')) = lower(btrim(c.old_name))
      OR lower(btrim(entry->>'originalName')) = lower(btrim(c.old_name)))
  ORDER BY g.party_id NULLS FIRST LIMIT 1;
  IF FOUND AND quantity >= change.units AND mod(quantity, change.units) = 0
     AND (weight IS NULL OR weight = change.old_unit_weight) THEN
    result := (result - 'weight' - 'weightBasis') || jsonb_build_object('quantity', trim_scale(quantity / change.units));
    IF NOT result ? 'definitionId' THEN result := result || jsonb_build_object('definitionId', change.id::text); END IF;
  END IF;
  RETURN result;
END;
$$;

UPDATE characters c
SET equipment = jsonb_set(c.equipment, '{inventory}', converted.inventory)
FROM (
  SELECT ch.id, jsonb_agg(pg_temp.item_in_units(entry) ORDER BY position) AS inventory
  FROM characters ch
  CROSS JOIN LATERAL jsonb_array_elements(ch.equipment->'inventory') WITH ORDINALITY AS items(entry, position)
  WHERE jsonb_typeof(ch.equipment->'inventory') = 'array'
  GROUP BY ch.id
) converted
WHERE converted.id = c.id AND c.equipment->'inventory' IS DISTINCT FROM converted.inventory;

-- 4. Party stashes count what they hold, so a stashed "Bandages (10)" x2 is twenty bandages. Stashed rope already
--    counts ropes.
UPDATE party_inventory p
SET name = c.new_name, quantity = p.quantity * c.units
FROM item_unit_changes c
WHERE c.kind = 'named' AND lower(btrim(p.name)) = lower(c.old_name);
