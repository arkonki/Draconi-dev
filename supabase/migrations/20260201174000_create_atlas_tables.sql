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
    type TEXT NOT NULL DEFAULT 'location' CHECK (type IN ('location', 'character', 'note')),
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
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

-- Simple RLS Policies (Party members can see/do all for now, refined later)
CREATE POLICY "Enable all for party members on maps" ON party_maps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM party_members 
            WHERE party_members.party_id = party_maps.party_id 
            AND party_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable all for party members on pins" ON party_map_pins
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM party_members 
            WHERE party_members.party_id = party_map_pins.party_id 
            AND party_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Enable all for party members on drawings" ON party_map_drawings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM party_members 
            WHERE party_members.party_id = party_map_drawings.party_id 
            AND party_members.user_id = auth.uid()
        )
    );
