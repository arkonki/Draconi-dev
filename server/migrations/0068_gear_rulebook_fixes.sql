-- The shared item list checked against the rulebook's gear chapter (pages 73-79). Unarmed attacks and improvised blunt
-- objects are not gear: every hero has them, so they are never sold or handed out as loot, and the character sheet
-- always offers them as attacks.
ALTER TABLE game_items ADD COLUMN IF NOT EXISTS always_available boolean NOT NULL DEFAULT false;

UPDATE game_items
SET always_available = true, cost = NULL, supply = NULL, equippable = false,
    grip = CASE WHEN lower(btrim(name)) = 'unarmed' THEN NULL ELSE grip END,
    weight = CASE WHEN lower(btrim(name)) = 'unarmed' THEN 0 ELSE weight END
WHERE party_id IS NULL
  AND (lower(btrim(name)) = 'unarmed' OR lower(btrim(name)) ~ '^blunt object\W+(light|heavy)\W*$');

-- A sling is a tiny item, so it takes no slot.
UPDATE game_items
SET weight = 0,
    features = (SELECT jsonb_agg(DISTINCT feature) FROM jsonb_array_elements(
      coalesce(features, '[]'::jsonb) || '["BLUDGEONING", "TINY ITEM"]'::jsonb) AS f(feature))
WHERE party_id IS NULL AND lower(btrim(name)) = 'sling';

-- "Two-Handed" lost the end of its name, its skill, and the way to equip it.
UPDATE game_items
SET name = 'Two-Handed Axe', skill = coalesce(nullif(skill, ''), 'Axes(STR)'), equippable = true
WHERE party_id IS NULL AND btrim(name) = 'Two-Handed'
  AND NOT EXISTS (SELECT 1 FROM game_items other WHERE other.party_id IS NULL AND lower(other.name) = 'two-handed axe');

UPDATE characters
SET equipment = replace(equipment::text, '"name": "Two-Handed"', '"name": "Two-Handed Axe"')::jsonb
WHERE equipment::text LIKE '%"name": "Two-Handed"%';

-- Stray spaces and a hidden soft hyphen ("Sledge­ hammer") kept names from matching what people type.
UPDATE game_items g
SET name = cleaned.name
FROM (
  SELECT id, party_id, regexp_replace(btrim(replace(name, E'­', '')), '\s{2,}', ' ', 'g') AS name
  FROM game_items
) cleaned
WHERE cleaned.id = g.id AND cleaned.name <> g.name AND cleaned.name <> ''
  AND NOT EXISTS (
    SELECT 1 FROM game_items other
    WHERE other.id <> g.id AND other.party_id IS NOT DISTINCT FROM g.party_id AND lower(other.name) = lower(cleaned.name)
  );

UPDATE characters SET equipment = replace(equipment::text, E'­', '')::jsonb
WHERE equipment::text LIKE E'%­%';

UPDATE party_inventory SET name = btrim(replace(name, E'­', ''))
WHERE name LIKE E'%­%';
