CREATE OR REPLACE FUNCTION log_app_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_json jsonb;
  new_json jsonb;
  changed_id uuid;
  change_event_id bigint;
BEGIN
  old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  changed_id := COALESCE((new_json->>'id')::uuid, (old_json->>'id')::uuid);

  INSERT INTO app_change_events(table_name, event_type, record_id, old_record, new_record)
  VALUES (TG_TABLE_NAME, TG_OP, changed_id, old_json, new_json)
  RETURNING id INTO change_event_id;

  PERFORM pg_notify('app_change_events', change_event_id::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;
