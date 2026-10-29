-- Services (a meal, a room, a bath) are used when they are paid for, so the shop no longer puts them in an inventory.
-- Ones bought earlier were already paid for and used; they come out of inventories and party stashes.
CREATE TEMP TABLE service_items ON COMMIT DROP AS
SELECT id::text AS id, lower(btrim(name)) AS name
FROM game_items
WHERE party_id IS NULL AND upper(btrim(category)) = 'SERVICES';

UPDATE characters c
SET equipment = jsonb_set(c.equipment, '{inventory}', kept.inventory)
FROM (
  SELECT ch.id, coalesce(jsonb_agg(entry ORDER BY position) FILTER (WHERE NOT is_service), '[]'::jsonb) AS inventory,
         bool_or(is_service) AS had_service
  FROM characters ch
  CROSS JOIN LATERAL jsonb_array_elements(ch.equipment->'inventory') WITH ORDINALITY AS items(entry, position)
  CROSS JOIN LATERAL (SELECT EXISTS (
    SELECT 1 FROM service_items s
    WHERE s.id = entry->>'definitionId' OR s.name = lower(btrim(entry->>'name'))
  ) AS is_service) AS check_service
  WHERE jsonb_typeof(ch.equipment->'inventory') = 'array'
  GROUP BY ch.id
) kept
WHERE kept.id = c.id AND kept.had_service;

DELETE FROM party_inventory p
USING service_items s
WHERE s.name = lower(btrim(p.name));
