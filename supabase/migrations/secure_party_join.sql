/*
  # Security Hardening: Secure Party Join (RPC)

  1. Purpose
    - Prevent "Invite Code Bypass" by validating codes on the server.
    - Ensure users can only join with characters they actually own.
  
  2. Function: join_party_secure
    - Validates Party Exists.
    - Validates Invite Code (if one is set).
    - Validates Character Ownership.
    - Inserts into party_members.
    - Updates character.party_id.
*/

CREATE OR REPLACE FUNCTION public.join_party_secure(
  p_party_id uuid,
  p_character_id uuid,
  p_invite_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (allows checking invite codes hidden from public)
AS $$
DECLARE
  v_party_code text;
  v_party_owner uuid;
  v_char_owner uuid;
BEGIN
  -- 1. Fetch Party Details
  SELECT invite_code, created_by INTO v_party_code, v_party_owner
  FROM public.parties
  WHERE id = p_party_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found.';
  END IF;

  -- 2. Verify Invite Code (If party has one)
  -- If v_party_code is NULL/Empty, it's an open party.
  -- If it has a value, input must match.
  IF v_party_code IS NOT NULL AND v_party_code <> '' THEN
    IF p_invite_code IS NULL OR p_invite_code <> v_party_code THEN
      RAISE EXCEPTION 'Invalid invite code.';
    END IF;
  END IF;

  -- 3. Verify Character Ownership
  SELECT user_id INTO v_char_owner
  FROM public.characters
  WHERE id = p_character_id;

  IF v_char_owner IS NULL THEN
    RAISE EXCEPTION 'Character not found.';
  END IF;

  IF v_char_owner <> auth.uid() THEN
    RAISE EXCEPTION 'You do not own this character.';
  END IF;

  -- 4. Perform the Join
  -- Insert into members
  INSERT INTO public.party_members (party_id, character_id)
  VALUES (p_party_id, p_character_id)
  ON CONFLICT (party_id, character_id) DO NOTHING;

  -- Update character link
  UPDATE public.characters
  SET party_id = p_party_id
  WHERE id = p_character_id;

  RETURN true;
END;
$$;
