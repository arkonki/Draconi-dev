CREATE OR REPLACE FUNCTION touch_helper_campaign_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed_campaign_id uuid;
  changed_encounter_id uuid;
  changed_record_id text;
  new_json jsonb;
  old_json jsonb;
  changed_fields jsonb;
  source_user_setting text;
  event_source_user_id uuid;
  event_source_client text;
  previous_revision bigint;
  resulting_revision bigint;
  active_session uuid;
  event_sequence bigint;
BEGIN
  IF current_setting('draconi.skip_campaign_revision', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  changed_record_id := COALESCE(new_json->>'id', old_json->>'id');

  IF TG_TABLE_NAME = 'characters' THEN
    changed_campaign_id := COALESCE(
      (new_json->>'party_id')::uuid,
      (old_json->>'party_id')::uuid
    );
  ELSIF TG_TABLE_NAME = 'encounters' THEN
    changed_campaign_id := COALESCE(
      (new_json->>'party_id')::uuid,
      (old_json->>'party_id')::uuid
    );
  ELSIF TG_TABLE_NAME = 'encounter_combatants' THEN
    changed_encounter_id := COALESCE(
      (new_json->>'encounter_id')::uuid,
      (old_json->>'encounter_id')::uuid
    );
    SELECT party_id INTO changed_campaign_id
    FROM encounters
    WHERE id = changed_encounter_id;
  ELSE
    changed_campaign_id := COALESCE(
      (new_json->>'party_id')::uuid,
      (old_json->>'party_id')::uuid
    );
  END IF;

  IF changed_campaign_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE parties
  SET helper_revision = helper_revision + 1
  WHERE id = changed_campaign_id
  RETURNING helper_revision - 1, helper_revision, active_session_id
  INTO previous_revision, resulting_revision, active_session;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(jsonb_agg(field_name ORDER BY field_name), '[]'::jsonb)
  INTO changed_fields
  FROM (
    SELECT key AS field_name FROM jsonb_each(COALESCE(new_json, '{}'::jsonb))
    UNION
    SELECT key AS field_name FROM jsonb_each(COALESCE(old_json, '{}'::jsonb))
  ) fields
  WHERE new_json->field_name IS DISTINCT FROM old_json->field_name;

  source_user_setting := current_setting('draconi.source_user_id', true);
  IF source_user_setting ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    event_source_user_id := source_user_setting::uuid;
  END IF;
  event_source_client := COALESCE(
    NULLIF(current_setting('draconi.source_client', true), ''),
    'database-trigger'
  );

  SELECT COALESCE(MAX(sequence), 0) + 1
  INTO event_sequence
  FROM campaign_events
  WHERE campaign_id = changed_campaign_id;

  INSERT INTO campaign_events (
    campaign_id, session_id, sequence, type, actor_id, payload, visibility,
    source_type, source_user_id, source_client, previous_revision,
    resulting_revision
  ) VALUES (
    changed_campaign_id,
    active_session,
    event_sequence,
    format('app.%s.%s', TG_TABLE_NAME, lower(TG_OP)),
    CASE WHEN TG_TABLE_NAME = 'characters' THEN changed_record_id::uuid ELSE NULL END,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', lower(TG_OP),
      'recordId', changed_record_id,
      'changedFields', changed_fields,
      'reason', format('The application performed a %s on %s.', lower(TG_OP), TG_TABLE_NAME)
    ),
    'gm',
    CASE WHEN event_source_user_id IS NULL THEN 'system' ELSE 'user' END,
    event_source_user_id,
    event_source_client,
    previous_revision,
    resulting_revision
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
