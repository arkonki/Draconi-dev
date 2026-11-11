/*
  # Fix Encounter Security and Schema

  1. Schema Changes
    - Add `has_acted` column to `encounter_combatants` to track turn completion (Dragonbane mechanic).
  
  2. Security Updates
    - Add RLS policy to `encounter_combatants` to allow players to update their own character's combatant record (HP, WP, Initiative, Has Acted).
*/

-- 1. Add missing column for turn tracking
ALTER TABLE public.encounter_combatants 
ADD COLUMN IF NOT EXISTS has_acted BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add RLS Policy for Players
-- This allows a user to UPDATE a combatant row ONLY IF that combatant is linked to a character they own.
CREATE POLICY "Players can update their own combatants"
ON public.encounter_combatants
FOR UPDATE
TO authenticated
USING (
  character_id IN (
    SELECT id FROM public.characters WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  character_id IN (
    SELECT id FROM public.characters WHERE user_id = auth.uid()
  )
);
