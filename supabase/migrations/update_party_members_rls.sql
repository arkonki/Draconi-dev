/*
  # Create RLS Policies for `party_members` table

  This migration establishes the Row Level Security (RLS) policies for the `party_members` table, which is the join table connecting characters to parties.

  1. New Policies
    - **SELECT**: Allows any authenticated user to view party membership. This is consistent with the `parties` table policy, relying on the unguessable party ID for security.
    - **INSERT**: Allows a user to add one of their own characters to a party. It verifies that the `user_id` of the character being added matches the current user's ID.
    - **DELETE**: Allows a character to be removed from a party by either the party's creator (DM) or the owner of the character.

  2. Security Rationale
    - The `INSERT` policy is crucial for the "Join Party" feature. It ensures that users can only add characters they own, preventing them from adding other players' characters to a party.
    - The `DELETE` policy provides flexibility, allowing both DMs and players to manage party composition.
*/

-- Enable RLS on the party_members table if it's not already enabled.
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts.
DROP POLICY IF EXISTS "Allow authenticated users to view members" ON public.party_members;
DROP POLICY IF EXISTS "Allow users to add their own characters to a party" ON public.party_members;
DROP POLICY IF EXISTS "Allow DM or character owner to remove member" ON public.party_members;

-- 1. Create policy for SELECT
-- Allows any authenticated user to see who is in a party.
CREATE POLICY "Allow authenticated users to view members"
ON public.party_members
FOR SELECT
TO authenticated
USING (true);

-- 2. Create policy for INSERT
-- A user can add a character to a party if they own that character.
CREATE POLICY "Allow users to add their own characters to a party"
ON public.party_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = (
    SELECT user_id FROM public.characters WHERE id = character_id
  )
);

-- 3. Create policy for DELETE
-- A user can remove a party member if they are the DM of the party OR they own the character.
CREATE POLICY "Allow DM or character owner to remove member"
ON public.party_members
FOR DELETE
TO authenticated
USING (
  -- User is the party's creator (DM)
  (auth.uid() = (SELECT created_by FROM public.parties WHERE id = party_id))
  OR
  -- User is the owner of the character being removed
  (auth.uid() = (SELECT user_id FROM public.characters WHERE id = character_id))
);
