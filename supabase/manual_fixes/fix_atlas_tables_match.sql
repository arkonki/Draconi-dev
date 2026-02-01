-- Add missing Columns to party_maps
ALTER TABLE party_maps 
ADD COLUMN IF NOT EXISTS grid_color TEXT DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS grid_offset_x FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS grid_offset_y FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS grid_rotation FLOAT DEFAULT 0;

-- RENAME Tables to match the code usage (since code uses map_pins/map_drawings)
-- Or we fix the code. Looking at previous context, code uses 'map_pins' and 'map_drawings' 
-- but SQL created 'party_map_pins' and 'party_map_drawings'.
-- Let's rename the tables to match what the frontend expects:

ALTER TABLE IF EXISTS party_map_pins RENAME TO map_pins;
ALTER TABLE IF EXISTS party_map_drawings RENAME TO map_drawings;

-- Add Realtime Support (Fixes sync issues)
ALTER PUBLICATION supabase_realtime ADD TABLE party_maps;
ALTER PUBLICATION supabase_realtime ADD TABLE map_pins;
ALTER PUBLICATION supabase_realtime ADD TABLE map_drawings;
