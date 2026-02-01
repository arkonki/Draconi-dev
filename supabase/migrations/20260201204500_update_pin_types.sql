DO $$
BEGIN
    -- Check if map_pins table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'map_pins') THEN
        -- Drop the constraint if it exists (handling potentially different names if needed, but standard is map_pins_type_check)
        -- We'll try to drop the constraint by name. If the name is different, this might fail, so we can be broader or just try the standard one.
        ALTER TABLE map_pins DROP CONSTRAINT IF EXISTS map_pins_type_check;
        ALTER TABLE map_pins DROP CONSTRAINT IF EXISTS party_map_pins_type_check; -- Just in case

        -- Add the new constraint
        ALTER TABLE map_pins ADD CONSTRAINT map_pins_type_check 
            CHECK (type IN ('location', 'character', 'note', 'player_start'));
            
    ELSIF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'party_map_pins') THEN
        -- Fallback for party_map_pins if that's what exists (unlikely given the error, but consistency)
        ALTER TABLE party_map_pins DROP CONSTRAINT IF EXISTS party_map_pins_type_check;
        
        ALTER TABLE party_map_pins ADD CONSTRAINT party_map_pins_type_check 
            CHECK (type IN ('location', 'character', 'note', 'player_start'));
    END IF;
END $$;
