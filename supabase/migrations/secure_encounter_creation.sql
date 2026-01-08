/*
  # Security Hardening: Encounter Management

  1. Purpose
    - Prevent unauthorized users from creating encounters in parties they don't own.
    - Allow players to VIEW encounters (so they can see the combat tracker).
    - Allow only DMs to MANAGE (Insert/Update/Delete) encounters.
*/

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.encounters;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.encounters;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.encounters;

-- 1. VIEW POLICY
-- Visible to DM and all Players in the party
CREATE POLICY "Encounter Visibility"
ON public.encounters
FOR SELECT
TO authenticated
USING (
  -- Is DM
  party_id IN (SELECT id FROM public.parties WHERE created_by = auth.uid())
  OR
  -- Is Player in Party
  party_id IN (
    SELECT party_id FROM public.party_members 
    WHERE character_id IN (SELECT id FROM public.characters WHERE user_id = auth.uid())
  )
);

-- 2. MANAGEMENT POLICY (Insert, Update, Delete)
-- Strictly DM Only
CREATE POLICY "Encounter Management"
ON public.encounters
FOR ALL
TO authenticated
USING (
  party_id IN (SELECT id FROM public.parties WHERE created_by = auth.uid())
)
WITH CHECK (
  party_id IN (SELECT id FROM public.parties WHERE created_by = auth.uid())
);
