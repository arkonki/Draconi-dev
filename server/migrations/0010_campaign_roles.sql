CREATE TABLE campaign_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player'
    CHECK (role IN ('owner', 'gm', 'player', 'observer')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, user_id)
);

CREATE INDEX campaign_memberships_user_id_idx
  ON campaign_memberships(user_id, party_id);
CREATE INDEX campaign_memberships_party_role_idx
  ON campaign_memberships(party_id, role);

INSERT INTO campaign_memberships (party_id, user_id, role)
SELECT id, created_by, 'owner'
FROM parties
ON CONFLICT (party_id, user_id) DO UPDATE SET role = 'owner';

INSERT INTO campaign_memberships (party_id, user_id, role)
SELECT DISTINCT pm.party_id, pm.user_id,
  CASE WHEN u.role = 'dm' THEN 'gm' ELSE 'player' END
FROM party_members pm
JOIN users u ON u.id = pm.user_id
JOIN parties p ON p.id = pm.party_id
WHERE pm.user_id <> p.created_by
ON CONFLICT (party_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION ensure_campaign_owner_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO campaign_memberships (party_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
  ON CONFLICT (party_id, user_id) DO UPDATE
    SET role = 'owner', updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER parties_ensure_campaign_owner
  AFTER INSERT OR UPDATE OF created_by ON parties
  FOR EACH ROW EXECUTE FUNCTION ensure_campaign_owner_membership();

CREATE OR REPLACE FUNCTION ensure_character_campaign_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO campaign_memberships (party_id, user_id, role)
  VALUES (NEW.party_id, NEW.user_id, 'player')
  ON CONFLICT (party_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER party_members_ensure_campaign_membership
  AFTER INSERT OR UPDATE OF party_id, user_id ON party_members
  FOR EACH ROW EXECUTE FUNCTION ensure_character_campaign_membership();

CREATE OR REPLACE FUNCTION remove_orphaned_player_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM campaign_memberships cm
  WHERE cm.party_id = OLD.party_id
    AND cm.user_id = OLD.user_id
    AND cm.role = 'player'
    AND NOT EXISTS (
      SELECT 1 FROM party_members pm
      WHERE pm.party_id = OLD.party_id AND pm.user_id = OLD.user_id
    );
  RETURN OLD;
END;
$$;

CREATE TRIGGER party_members_remove_orphaned_player_membership
  AFTER DELETE ON party_members
  FOR EACH ROW EXECUTE FUNCTION remove_orphaned_player_membership();

CREATE OR REPLACE FUNCTION protect_campaign_owner_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  campaign_owner uuid;
  candidate_party_id uuid;
  candidate_user_id uuid;
  candidate_role text;
BEGIN
  candidate_party_id := COALESCE(NEW.party_id, OLD.party_id);
  candidate_user_id := COALESCE(NEW.user_id, OLD.user_id);
  candidate_role := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.role END;

  SELECT created_by INTO campaign_owner FROM parties WHERE id = candidate_party_id;

  IF candidate_user_id = campaign_owner AND (TG_OP = 'DELETE' OR candidate_role <> 'owner') THEN
    RAISE EXCEPTION 'The campaign owner membership cannot be removed or demoted';
  END IF;
  IF candidate_role = 'owner' AND candidate_user_id <> campaign_owner THEN
    RAISE EXCEPTION 'Only the campaign creator can have the owner role';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER campaign_memberships_protect_owner
  BEFORE INSERT OR UPDATE OR DELETE ON campaign_memberships
  FOR EACH ROW EXECUTE FUNCTION protect_campaign_owner_membership();

CREATE TRIGGER campaign_memberships_set_updated_at
  BEFORE UPDATE ON campaign_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER campaign_memberships_log_change
  AFTER INSERT OR UPDATE OR DELETE ON campaign_memberships
  FOR EACH ROW EXECUTE FUNCTION log_app_change();

CREATE TRIGGER campaign_memberships_helper_revision
  AFTER INSERT OR UPDATE OR DELETE ON campaign_memberships
  FOR EACH ROW EXECUTE FUNCTION touch_helper_campaign_revision();
