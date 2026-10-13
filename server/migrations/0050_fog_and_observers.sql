-- Fog of war on the shared table: a map can be covered for players, and the GM reveals parts of it. The revealed
-- parts are kept on the map as a short list of shapes ({id, shape: 'rect' | 'ellipse', x, y, w, h}, all as
-- fractions of the map's width and height), so they follow the map when the scene is switched away and back.
-- The map picture itself is still delivered to players; the fog is a cover over it, not a security boundary.
ALTER TABLE party_maps
  ADD COLUMN IF NOT EXISTS fog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fog_areas jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(fog_areas) = 'array' AND jsonb_array_length(fog_areas) <= 300);

-- Whether the campaign's invite link may also be used to follow the game as an observer. On by default.
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS allow_observers boolean NOT NULL DEFAULT true;
