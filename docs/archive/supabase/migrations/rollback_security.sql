/*
  # EMERGENCY ROLLBACK
  
  1. Purpose
    - Restore visibility of Characters and Encounters immediately.
    - Remove strict RLS policies that caused the blackout.
    - Revert to permissive "Authenticated Read" to fix the app.

  2. Changes
    - Drop "Character Visibility" / "Encounter Visibility" policies.
    - Create "View All" policies for authenticated users.
*/

-- --- 1. RESTORE CHARACTERS ---
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Drop the strict policies
DROP POLICY IF EXISTS "Character Visibility" ON public.characters;
DROP POLICY IF EXISTS "Character Modification" ON public.characters;
DROP POLICY IF EXISTS "Character Deletion" ON public.characters;

-- Restore Permissive Visibility (Fixes "Players can't see characters")
CREATE POLICY "Enable read access for all users"
ON public.characters FOR SELECT
TO authenticated
USING (true);

-- Restore Owner Editing
CREATE POLICY "Enable update for users based on id"
ON public.characters FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable delete for users based on id"
ON public.characters FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Enable insert for authenticated users only"
ON public.characters FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);


-- --- 2. RESTORE ENCOUNTERS ---
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

-- Drop the strict policies
DROP POLICY IF EXISTS "Encounter Visibility" ON public.encounters;
DROP POLICY IF EXISTS "Encounter Management" ON public.encounters;

-- Restore Permissive Visibility (Fixes "Players can't see encounters")
CREATE POLICY "Enable read access for all users"
ON public.encounters FOR SELECT
TO authenticated
USING (true);

-- Restore Permissive Editing (Fixes "DMs can't manage encounters")
CREATE POLICY "Enable insert for authenticated users only"
ON public.encounters FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users only"
ON public.encounters FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users only"
ON public.encounters FOR DELETE
TO authenticated
USING (true);
