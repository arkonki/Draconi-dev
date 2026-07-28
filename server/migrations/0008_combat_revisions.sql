CREATE OR REPLACE FUNCTION touch_helper_combat_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('draconi.skip_campaign_revision', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.helper_revision = OLD.helper_revision THEN
    NEW.helper_revision := OLD.helper_revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encounters_touch_combat_revision
  BEFORE UPDATE ON encounters
  FOR EACH ROW EXECUTE FUNCTION touch_helper_combat_revision();

CREATE OR REPLACE FUNCTION touch_combat_revision_from_participant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed_encounter_id uuid;
BEGIN
  IF current_setting('draconi.skip_campaign_revision', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  changed_encounter_id := COALESCE(NEW.encounter_id, OLD.encounter_id);
  PERFORM set_config('draconi.skip_campaign_revision', 'on', true);
  UPDATE encounters
  SET helper_revision = helper_revision + 1
  WHERE id = changed_encounter_id;
  PERFORM set_config('draconi.skip_campaign_revision', 'off', true);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER zz_encounter_combatants_touch_combat_revision
  AFTER INSERT OR UPDATE OR DELETE ON encounter_combatants
  FOR EACH ROW EXECUTE FUNCTION touch_combat_revision_from_participant();

