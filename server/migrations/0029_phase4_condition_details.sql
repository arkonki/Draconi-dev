ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS condition_details jsonb NOT NULL DEFAULT '{}'::jsonb;

SELECT set_config('draconi.skip_campaign_revision', 'on', true);

UPDATE characters
SET condition_details = COALESCE((
  SELECT jsonb_object_agg(
    condition.key,
    jsonb_build_object(
      'name', replace(condition.key, '_', ' '),
      'description', NULL,
      'source', NULL,
      'duration', jsonb_build_object('type', 'indefinite', 'remaining', NULL),
      'appliedAt', NULL,
      'expiresAt', NULL,
      'affects', jsonb_build_object('checks', '[]'::jsonb, 'attributes', '[]'::jsonb)
    )
  )
  FROM jsonb_each(COALESCE(characters.conditions, '{}'::jsonb)) AS condition(key, active)
  WHERE condition.active = 'true'::jsonb
), '{}'::jsonb)
WHERE condition_details = '{}'::jsonb
  AND jsonb_typeof(conditions) = 'object';

CREATE OR REPLACE FUNCTION sync_character_condition_details()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.condition_details := COALESCE((
    SELECT jsonb_object_agg(
      condition.key,
      COALESCE(
        NEW.condition_details -> condition.key,
        jsonb_build_object(
          'name', replace(condition.key, '_', ' '),
          'description', NULL,
          'source', NULL,
          'duration', jsonb_build_object('type', 'indefinite', 'remaining', NULL),
          'appliedAt', NULL,
          'expiresAt', NULL,
          'affects', jsonb_build_object('checks', '[]'::jsonb, 'attributes', '[]'::jsonb)
        )
      )
    )
    FROM jsonb_each(COALESCE(NEW.conditions, '{}'::jsonb)) AS condition(key, active)
    WHERE condition.active = 'true'::jsonb
  ), '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS characters_sync_condition_details ON characters;
CREATE TRIGGER characters_sync_condition_details
BEFORE INSERT OR UPDATE OF conditions, condition_details ON characters
FOR EACH ROW
EXECUTE FUNCTION sync_character_condition_details();
