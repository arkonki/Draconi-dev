-- 1. CRITICAL: Fixes timeouts when loading encounters
CREATE INDEX IF NOT EXISTS idx_encounter_combatants_encounter_id 
ON public.encounter_combatants (encounter_id);

-- 2. Fixes timeouts when checking party ownership
CREATE INDEX IF NOT EXISTS idx_encounters_party_id 
ON public.encounters (party_id);

-- 3. Enables "Instant" updates (Realtime) for these tables
-- This fixes the issue where you have to wait or refresh to see changes
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE encounters;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE encounter_combatants;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
