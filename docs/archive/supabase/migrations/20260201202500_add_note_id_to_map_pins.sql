-- Add note_id to map_pins table
-- This allows linking a map pin to a rich text note in the notes table

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'map_pins') THEN
        ALTER TABLE map_pins 
        ADD COLUMN IF NOT EXISTS note_id UUID REFERENCES notes(id) ON DELETE SET NULL;
    ELSIF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'party_map_pins') THEN
        ALTER TABLE party_map_pins 
        ADD COLUMN IF NOT EXISTS note_id UUID REFERENCES notes(id) ON DELETE SET NULL;
    END IF;
END $$;
