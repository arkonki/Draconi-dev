-- Add missing grid configuration columns to party_maps table
ALTER TABLE public.party_maps 
ADD COLUMN IF NOT EXISTS grid_color TEXT DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS grid_offset_x FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS grid_offset_y FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS grid_rotation FLOAT DEFAULT 0;

-- Optional: Add index if we often filter/sort (though not strictly needed for these settings)
-- No crucial indexes needed for these display properties.
