/*
  # Security Hardening: Character Visibility & Access

  1. Purpose
    - Ensure players can see their own characters.
    - Ensure DMs can see all characters in their parties.
    - Ensure Party Members can see each other (for healing, buffs, etc.).

  2. Policies
    - SELECT: Complex logic to allow Party/DM visibility.
    - UPDATE: Strictly limited to the Character Owner and the DM (for specific fields like HP).
    - DELETE: Strictly limited to the Character Owner.
*/

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to rebuild them securely
DROP POLICY IF EXISTS "Users can see own characters" ON public.characters;
DROP POLICY IF EXISTS "Users can update own characters" ON public.characters;
DROP POLICY IF EXISTS "Users can delete own characters" ON public.characters;
DROP POLICY IF EXISTS "Complex visibility for parties" ON public.characters;

-- 1. VIEW (SELECT) POLICY
-- Allows viewing if:
-- A) You own the character
-- B) You are the DM of the party the character is in
-- C) You have a character in the same party
CREATE POLICY "Character Visibility"
ON public.characters
FOR SELECT
TO authenticated
USING (
  -- A. Owner
  user_id = auth.uid()
  OR
  -- B. DM of the Party
  (party_id IS NOT NULL AND party_id IN (
    SELECT id FROM public.parties WHERE created_by = auth.uid()
  ))
  OR
  -- C. Fellow Party Member
  (party_id IS NOT NULL AND party_id IN (
    SELECT party_id FROM public.party_members 
    WHERE character_id IN (SELECT id FROM public.characters WHERE user_id = auth.uid())
  ))
);

-- 2. UPDATE POLICY
-- Allows updating if:
-- A) You own the character
-- B) You are the DM (DMs often need to adjust HP/Conditions)
CREATE POLICY "Character Modification"
ON public.characters
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR
  (party_id IS NOT NULL AND party_id IN (
    SELECT id FROM public.parties WHERE created_by = auth.uid()
  ))
)
WITH CHECK (
  user_id = auth.uid()
  OR
  (party_id IS NOT NULL AND party_id IN (
    SELECT id FROM public.parties WHERE created_by = auth.uid()
  ))
);

-- 3. DELETE POLICY
-- Strictly Owner only. Even DMs shouldn't delete a player's sheet; they should just remove it from the party.
CREATE POLICY "Character Deletion"
ON public.characters
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
