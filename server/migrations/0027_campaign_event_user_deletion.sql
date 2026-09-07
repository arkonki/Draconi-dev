CREATE OR REPLACE FUNCTION prevent_campaign_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Preserve the audit event when its source user is deleted. PostgreSQL applies
  -- the foreign key's ON DELETE SET NULL action as an UPDATE, so permit only
  -- that exact metadata change and keep every other event field immutable.
  IF TG_OP = 'UPDATE'
     AND OLD.source_user_id IS NOT NULL
     AND NEW.source_user_id IS NULL
     AND (to_jsonb(NEW) - 'source_user_id') = (to_jsonb(OLD) - 'source_user_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'campaign_events is append-only';
END;
$$;
