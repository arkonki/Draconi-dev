-- The change log used to keep two full copies of a row for every update: the row before and the row after.
-- A character sheet is large, and each hit point lost in a fight wrote the whole sheet twice. An update now
-- keeps the row after it plus only the columns that changed, with the values they had before. The row before
-- is still exact: it is the row after with those columns put back (the server does this when it reads the log).
--
-- The notification also says whether the change can affect who may see what. Inserts and deletes can; an
-- update can only when one of the columns that decide ownership or membership changed. The server uses this
-- to keep its permission cache through ordinary edits instead of emptying it on every change.
CREATE OR REPLACE FUNCTION log_app_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_json jsonb;
  new_json jsonb;
  changed_id uuid;
  change_event_id bigint;
  changed_columns text[];
  affects_access boolean := true;
BEGIN
  old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  changed_id := COALESCE((new_json->>'id')::uuid, (old_json->>'id')::uuid);

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(jsonb_object_agg(before.key, before.value), '{}'::jsonb),
           COALESCE(array_agg(before.key), '{}'::text[])
      INTO old_json, changed_columns
      FROM jsonb_each(old_json) AS before
     WHERE before.value IS DISTINCT FROM new_json->before.key;
    affects_access := changed_columns && ARRAY['user_id', 'party_id', 'created_by', 'role', 'character_id'];
  END IF;

  INSERT INTO app_change_events(table_name, event_type, record_id, old_record, new_record)
  VALUES (TG_TABLE_NAME, TG_OP, changed_id, old_json, new_json)
  RETURNING id INTO change_event_id;

  PERFORM pg_notify(
    'app_change_events',
    json_build_object('id', change_event_id, 'table', TG_TABLE_NAME, 'access', affects_access)::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
