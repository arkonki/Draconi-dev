/*
  # Update RLS Policies for `parties` table

  This migration updates the Row Level Security (RLS) policies for the `parties` table to enable the party invitation system to work correctly.

  1. Changes
    - The `SELECT` policy is changed to allow any authenticated user to view any party's details. This is necessary so that users who are not yet members can view the party information when they receive an invite link.
    - Policies for `INSERT`, `UPDATE`, and `DELETE` are explicitly defined to ensure security is maintained.

  2. Security Policies
    - **SELECT**: Allows any authenticated user to read party data.
    - **INSERT**: Allows any authenticated user to create a new party.
    - **UPDATE**: Restricts updates to the party's creator (DM).
    - **DELETE**: Restricts deletion to the party's creator (DM).
*/

-- Drop existing policies to avoid conflicts.
-- It's safe to drop policies that don't exist with `IF EXISTS`.
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.parties;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.parties;
DROP POLICY IF EXISTS "Enable update for users based on created_by" ON public.parties;
DROP POLICY IF EXISTS "Enable delete for users based on created_by" ON public.parties;
DROP POLICY IF EXISTS "DMs can manage their own parties" ON public.parties;
DROP POLICY IF EXISTS "Users can view parties they created" ON public.parties;
DROP POLICY IF EXISTS "Players can view parties they are in" ON public.parties;


-- 1. Create policy for SELECT
-- Allows any authenticated user to view any party. This is required for the invite link system.
CREATE POLICY "Enable read access for authenticated users"
ON public.parties
FOR SELECT
TO authenticated
USING (true);

-- 2. Create policy for INSERT
-- Allows any authenticated user to create a party.
CREATE POLICY "Enable insert for authenticated users"
ON public.parties
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Create policy for UPDATE
-- Allows a user to update a party only if they are the creator.
CREATE POLICY "Enable update for users based on created_by"
ON public.parties
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- 4. Create policy for DELETE
-- Allows a user to delete a party only if they are the creator.
CREATE POLICY "Enable delete for users based on created_by"
ON public.parties
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);
