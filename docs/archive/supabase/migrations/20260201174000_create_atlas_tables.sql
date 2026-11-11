-- Create party_maps table
CREATE TABLE IF NOT EXISTS party_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'World Map',
    image_url TEXT,
    grid_type TEXT NOT NULL DEFAULT 'none' CHECK (grid_type IN ('none', 'square', 'hex')),
    grid_size INTEGER NOT NULL DEFAULT 50,
    grid_opacity FLOAT NOT NULL DEFAULT 0.5,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create party_map_pins table
CREATE TABLE IF NOT EXISTS party_map_pins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES party_maps(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    label TEXT,
    description TEXT,
    icon TEXT,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    type TEXT NOT NULL DEFAULT 'location' CHECK (type IN ('location', 'character', 'note', 'player_start')),
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create party_map_drawings table for persistent whiteboard marks
CREATE TABLE IF NOT EXISTS party_map_drawings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES party_maps(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    color TEXT NOT NULL DEFAULT '#000000',
    thickness INTEGER NOT NULL DEFAULT 2,
    points JSONB NOT NULL, -- Array of {x, y} coordinates
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE party_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_map_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_map_drawings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- 1. Maps: Read-only for players, Full control for DM
DROP POLICY IF EXISTS "Enable read access for all party members on maps" ON party_maps;
CREATE POLICY "Enable read access for all party members on maps" ON party_maps
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM party_members 
            WHERE party_members.party_id = party_maps.party_id 
            AND party_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM parties
            WHERE parties.id = party_maps.party_id
            AND parties.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Enable write access for DM only on maps" ON party_maps;
CREATE POLICY "Enable write access for DM only on maps" ON party_maps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM parties
            WHERE parties.id = party_maps.party_id
            AND parties.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM parties
            WHERE parties.id = party_maps.party_id
            AND parties.created_by = auth.uid()
        )
    );

-- 2. Pins: Collaborative (Players can move tokens), but ensure DM access
DROP POLICY IF EXISTS "Enable all access for party members on pins" ON party_map_pins;
CREATE POLICY "Enable all access for party members on pins" ON party_map_pins
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM party_members 
            WHERE party_members.party_id = party_map_pins.party_id 
            AND party_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM parties
            WHERE parties.id = party_map_pins.party_id
            AND parties.created_by = auth.uid()
        )
    );

-- 3. Drawings: Collaborative Whiteboard
DROP POLICY IF EXISTS "Enable all access for party members on drawings" ON party_map_drawings;
CREATE POLICY "Enable all access for party members on drawings" ON party_map_drawings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM party_members 
            WHERE party_members.party_id = party_map_drawings.party_id 
            AND party_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM parties
            WHERE parties.id = party_map_drawings.party_id
            AND parties.created_by = auth.uid()
        )
    );
