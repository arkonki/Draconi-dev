CREATE OR REPLACE FUNCTION draconi_equipment_instance_ids(actor_id uuid, equipment_document jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  WITH entries AS (
    SELECT 'inventory'::text AS slot, (entry.ordinality - 1)::integer AS item_index,
      entry.item,
      COALESCE(entry.item->>'name', entry.item->>'originalName', entry.item #>> '{}') AS name
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(equipment_document->'inventory') = 'array'
        THEN equipment_document->'inventory' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(item, ordinality)
    UNION ALL
    SELECT 'weapon', (entry.ordinality - 1)::integer, entry.item,
      COALESCE(entry.item->>'name', entry.item->>'originalName', entry.item #>> '{}')
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(equipment_document#>'{equipped,weapons}') = 'array'
        THEN equipment_document#>'{equipped,weapons}' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(item, ordinality)
    UNION ALL
    SELECT singleton.slot, 0, singleton.item,
      COALESCE(singleton.item->>'name', singleton.item->>'originalName', singleton.item #>> '{}')
    FROM (VALUES
      ('armor', equipment_document#>'{equipped,armor}'),
      ('helmet', equipment_document#>'{equipped,helmet}'),
      ('shield', equipment_document#>'{equipped,shield}')
    ) AS singleton(slot, item)
    WHERE singleton.item IS NOT NULL
      AND singleton.item <> 'null'::jsonb
      AND singleton.item <> '""'::jsonb
    UNION ALL
    SELECT list.slot, (entry.ordinality - 1)::integer, entry.item,
      COALESCE(entry.item->>'name', entry.item->>'originalName', entry.item #>> '{}')
    FROM (VALUES
      ('worn-clothes', equipment_document#>'{equipped,wornClothes}'),
      ('container', equipment_document#>'{equipped,containers}'),
      ('animal', equipment_document#>'{equipped,animals}')
    ) AS list(slot, items)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(list.items) = 'array' THEN list.items ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(item, ordinality)
  ), numbered AS (
    SELECT *,
      row_number() OVER (
        PARTITION BY slot, lower(btrim(name))
        ORDER BY item_index
      ) - 1 AS name_ordinal
    FROM entries
    WHERE name IS NOT NULL AND btrim(name) <> ''
  ), keys AS (
    SELECT *,
      'instance:' || slot || ':' || lower(btrim(name)) || ':' || name_ordinal AS canonical_key,
      slot || ':' || lower(btrim(name)) || ':' || item_index AS legacy_key
    FROM numbered
  ), resolved AS (
    SELECT canonical_key,
      COALESCE(
        CASE WHEN item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN item->>'id' END,
        CASE WHEN equipment_document->'instanceIds'->>canonical_key
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN equipment_document->'instanceIds'->>canonical_key END,
        CASE WHEN equipment_document->'instanceIds'->>legacy_key
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN equipment_document->'instanceIds'->>legacy_key END,
        draconi_equipment_instance_uuid(actor_id, canonical_key)::text
      ) AS instance_id
    FROM keys
  )
  SELECT COALESCE(
      CASE WHEN jsonb_typeof(equipment_document->'instanceIds') = 'object'
        THEN equipment_document->'instanceIds' ELSE '{}'::jsonb END,
      '{}'::jsonb
    ) || COALESCE(jsonb_object_agg(canonical_key, to_jsonb(instance_id)), '{}'::jsonb)
  FROM resolved;
$$;

SELECT set_config('draconi.skip_campaign_revision', 'on', true);

UPDATE characters
SET equipment = jsonb_set(
  equipment,
  '{instanceIds}',
  draconi_equipment_instance_ids(id, equipment),
  true
)
WHERE jsonb_typeof(equipment) = 'object';

CREATE OR REPLACE FUNCTION normalize_character_equipment_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document jsonb;
  instance_ids jsonb;
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

  instance_ids := CASE WHEN jsonb_typeof(document->'instanceIds') = 'object'
    THEN document->'instanceIds' ELSE '{}'::jsonb END;
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.equipment->'instanceIds') = 'object' THEN
    instance_ids := OLD.equipment->'instanceIds' || instance_ids;
  END IF;
  document := jsonb_set(document, '{instanceIds}', instance_ids, true);

  NEW.equipment := jsonb_set(
    jsonb_set(document, '{schemaVersion}', '"equipment-v2"'::jsonb, true),
    '{instanceIds}',
    draconi_equipment_instance_ids(NEW.id, document),
    true
  );
  RETURN NEW;
END;
$$;
