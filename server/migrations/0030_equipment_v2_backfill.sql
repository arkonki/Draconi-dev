CREATE OR REPLACE FUNCTION draconi_equipment_instance_uuid(actor_id uuid, identity_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  WITH hashed AS (
    SELECT md5('draconi-equipment-v2' || chr(31) || actor_id::text || chr(31) || identity_key) AS value
  ), versioned AS (
    SELECT substring(value, 1, 12) || '5' || substring(value, 14, 3)
      || '8' || substring(value, 18, 15) AS value
    FROM hashed
  )
  SELECT (
    substring(value, 1, 8) || '-' || substring(value, 9, 4) || '-'
      || substring(value, 13, 4) || '-' || substring(value, 17, 4) || '-'
      || substring(value, 21, 12)
  )::uuid
  FROM versioned;
$$;

SELECT set_config('draconi.skip_campaign_revision', 'on', true);

WITH equipment_entries AS (
  SELECT character.id AS character_id,
    source.slot || ':' || lower(btrim(source.name)) || ':' || source.item_index AS identity_key
  FROM characters character
  CROSS JOIN LATERAL (
    SELECT 'inventory' AS slot, (entry.ordinality - 1)::text AS item_index,
      COALESCE(entry.item->>'name', entry.item->>'originalName', entry.item #>> '{}') AS name
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(character.equipment) = 'array' THEN character.equipment
        WHEN jsonb_typeof(character.equipment->'inventory') = 'array'
          THEN character.equipment->'inventory'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS entry(item, ordinality)
    UNION ALL
    SELECT 'weapon', (entry.ordinality - 1)::text,
      COALESCE(entry.item->>'name', entry.item->>'originalName', entry.item #>> '{}')
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(character.equipment#>'{equipped,weapons}') = 'array'
        THEN character.equipment#>'{equipped,weapons}' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(item, ordinality)
    UNION ALL
    SELECT slot.slot, '0',
      COALESCE(slot.item->>'name', slot.item->>'originalName', slot.item #>> '{}')
    FROM (VALUES
      ('armor', character.equipment#>'{equipped,armor}'),
      ('helmet', character.equipment#>'{equipped,helmet}'),
      ('shield', character.equipment#>'{equipped,shield}')
    ) AS slot(slot, item)
    WHERE slot.item IS NOT NULL AND slot.item <> 'null'::jsonb AND slot.item <> '""'::jsonb
    UNION ALL
    SELECT list.slot, (entry.ordinality - 1)::text,
      COALESCE(entry.item->>'name', entry.item->>'originalName', entry.item #>> '{}')
    FROM (VALUES
      ('worn-clothes', character.equipment#>'{equipped,wornClothes}'),
      ('container', character.equipment#>'{equipped,containers}'),
      ('animal', character.equipment#>'{equipped,animals}')
    ) AS list(slot, items)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(list.items) = 'array' THEN list.items ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(item, ordinality)
  ) AS source
  WHERE source.name IS NOT NULL AND btrim(source.name) <> ''
), instance_maps AS (
  SELECT character_id,
    jsonb_object_agg(identity_key, draconi_equipment_instance_uuid(character_id, identity_key)) AS instance_ids
  FROM equipment_entries
  GROUP BY character_id
)
UPDATE characters character
SET equipment = jsonb_set(
  jsonb_set(
    CASE
      WHEN jsonb_typeof(character.equipment) = 'object' THEN character.equipment
      WHEN jsonb_typeof(character.equipment) = 'array' THEN jsonb_build_object(
        'inventory', character.equipment,
        'equipped', jsonb_build_object('weapons', '[]'::jsonb),
        'money', '{}'::jsonb
      )
      ELSE '{}'::jsonb
    END,
    '{schemaVersion}', '"equipment-v2"'::jsonb, true
  ),
  '{instanceIds}',
  COALESCE(instance_maps.instance_ids, '{}'::jsonb)
    || CASE WHEN jsonb_typeof(character.equipment->'instanceIds') = 'object'
      THEN character.equipment->'instanceIds' ELSE '{}'::jsonb END,
  true
)
FROM instance_maps
WHERE character.id = instance_maps.character_id
  AND (
    character.equipment->>'schemaVersion' IS DISTINCT FROM 'equipment-v2'
    OR jsonb_typeof(character.equipment->'instanceIds') IS DISTINCT FROM 'object'
  );

UPDATE characters
SET equipment = jsonb_set(
  jsonb_set(
    CASE
      WHEN jsonb_typeof(equipment) = 'object' THEN equipment
      WHEN jsonb_typeof(equipment) = 'array' THEN jsonb_build_object(
        'inventory', equipment,
        'equipped', jsonb_build_object('weapons', '[]'::jsonb),
        'money', '{}'::jsonb
      )
      ELSE '{}'::jsonb
    END,
    '{schemaVersion}', '"equipment-v2"'::jsonb, true
  ),
  '{instanceIds}',
  CASE WHEN jsonb_typeof(equipment->'instanceIds') = 'object'
    THEN equipment->'instanceIds' ELSE '{}'::jsonb END,
  true
)
WHERE equipment->>'schemaVersion' IS DISTINCT FROM 'equipment-v2'
   OR jsonb_typeof(equipment->'instanceIds') IS DISTINCT FROM 'object';

CREATE OR REPLACE FUNCTION normalize_character_equipment_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document jsonb;
BEGIN
  document := CASE
    WHEN jsonb_typeof(NEW.equipment) = 'object' THEN NEW.equipment
    WHEN jsonb_typeof(NEW.equipment) = 'array' THEN jsonb_build_object(
      'inventory', NEW.equipment,
      'equipped', jsonb_build_object('weapons', '[]'::jsonb),
      'money', '{}'::jsonb
    )
    ELSE '{}'::jsonb
  END;
  NEW.equipment := jsonb_set(
    jsonb_set(document, '{schemaVersion}', '"equipment-v2"'::jsonb, true),
    '{instanceIds}',
    CASE WHEN jsonb_typeof(document->'instanceIds') = 'object'
      THEN document->'instanceIds' ELSE '{}'::jsonb END,
    true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS characters_normalize_equipment_document ON characters;
CREATE TRIGGER characters_normalize_equipment_document
BEFORE INSERT OR UPDATE OF equipment ON characters
FOR EACH ROW
EXECUTE FUNCTION normalize_character_equipment_document();
