/*
  # Fix Encounter Security and Schema (V2)

  1. Schema Changes
    - Safely add `has_acted` column to `encounter_combatants` to track turn completion.
  
  2. Security Updates
    - Add RLS policy to `encounter_combatants` to allow players to update their own character's combatant record.
    - Uses DO blocks for idempotency.
*/

DO $$
BEGIN
  -- 1. Add missing column for turn tracking if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'encounter_combatants' AND column_name = 'has_acted'
  ) THEN
    ALTER TABLE public.encounter_combatants 
    ADD COLUMN has_acted BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- 2. Add RLS Policy for Players
-- We drop it first to ensure we can recreate it with the correct definition if it exists but is incorrect
DROP POLICY IF EXISTS "Players can update their own combatants" ON public.encounter_combatants;

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
