-- A saved scale for each map, set from the shared table: how many of the map image's pixels one grid square
-- covers, and how many metres a square stands for. Tokens are sized in grid squares, so changing the scale
-- resizes them, and the ruler reads out metres. NULL means "no scale saved": the map's grid, if it has one,
-- is used instead.
ALTER TABLE party_maps
  ADD COLUMN IF NOT EXISTS scale_px_per_square numeric
    CHECK (scale_px_per_square IS NULL OR (scale_px_per_square >= 5 AND scale_px_per_square <= 5000)),
  ADD COLUMN IF NOT EXISTS scale_metres_per_square numeric
    CHECK (scale_metres_per_square IS NULL OR (scale_metres_per_square > 0 AND scale_metres_per_square <= 100000));
