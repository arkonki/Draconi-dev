export interface PartyMap {
    id: string;
    party_id: string;
    name: string;
    image_url: string | null;
    grid_type: 'none' | 'square' | 'hex';
    grid_size: number;
    grid_opacity: number;
    grid_offset_x: number;
    grid_offset_y: number;
    grid_color: string;
    grid_rotation: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface MapPin {
    id: string;
    map_id: string;
    party_id: string;
    label: string | null;
    description: string | null;
    icon: string | null;
    x: number;
    y: number;
    type: 'location' | 'character' | 'note' | 'player_start';
    character_id: string | null;
    note_id: string | null;
    color: string | null;
    created_at: string;
    updated_at: string;
}

export interface MapDrawing {
    id: string;
    map_id: string;
    party_id: string;
    color: string;
    thickness: number;
    points: { x: number; y: number }[];
    created_by: string;
    created_at: string;
}
