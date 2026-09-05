CREATE OR REPLACE FUNCTION ensure_character_campaign_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  membership_role text;
BEGIN
  SELECT CASE WHEN created_by = NEW.user_id THEN 'owner' ELSE 'player' END
  INTO membership_role
  FROM parties
  WHERE id = NEW.party_id;

  INSERT INTO campaign_memberships (party_id, user_id, role)
  VALUES (NEW.party_id, NEW.user_id, membership_role)
  ON CONFLICT (party_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
