/*
  # Remove Level Column Requirement from Characters Table

  This migration removes the level column requirement from the characters table
  as Dragonbane RPG characters do not use a level-based progression system.

  1. Changes
    - Remove NOT NULL constraint from level column in characters table
    - This allows level to be NULL since it's not part of the Dragonbane system
    - Existing level values (if any) will be preserved but not required

  2. Security
    - No changes to RLS policies needed
    - Existing policies remain intact
*/

-- Remove NOT NULL constraint from level column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'characters' 
    AND column_name = 'level' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.characters ALTER COLUMN level DROP NOT NULL;
  END IF;
END $$;
