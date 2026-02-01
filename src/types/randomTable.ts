export interface RandomTableRow {
    min: number;
    max: number;
    result: string;
}

export interface RandomTable {
    id: string;
    party_id: string;
    name: string;
    description?: string | null;
    category: string;
    die_type: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd66' | 'd100';
    rows: RandomTableRow[];
    created_at: string;
    updated_at: string;
}
