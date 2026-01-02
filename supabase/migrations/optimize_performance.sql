/*
  # Optimize Performance and Enable Realtime

  1. Performance
    - Add indexes to foreign keys in `encounter_combatants` to prevent full table scans.
    - Add indexes to `encounters` for faster party lookups.
  
  2. Realtime
    - Add `encounters` and `encounter_combatants` to the `supabase_realtime` publication.
    - This ensures the `useEncounterRealtime` hook receives 'INSERT', 'UPDATE', and 'DELETE' events.
*/

-- Add index for encounter lookups (Critical for preventing timeouts)
CREATE INDEX IF NOT EXISTS idx_encounter_combatants_encounter_id 
ON encounter_combatants(encounter_id);

-- Add index for party lookups
CREATE INDEX IF NOT EXISTS idx_encounters_party_id 
ON encounters(party_id);

-- Enable Realtime for these tables
-- Note: We use a DO block to avoid errors if they are already added
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