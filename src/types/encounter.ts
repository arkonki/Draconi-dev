export interface EncounterCombatant {
  id: string;
  encounter_id: string;
  character_id: string | null;
  monster_id: string | null;
  is_player_character: boolean;
  display_name: string;
  current_hp: number;
  max_hp: number;
  current_wp: number | null;
  max_wp: number | null;
  status_effects: any[]; // JSONB array
  initiative_roll: number | null;
  is_active_turn: boolean;
  has_acted: boolean; // Added to match schema fix
  created_at: string;
  updated_at: string;
}

export interface Encounter {
  id: string;
  party_id: string;
  name: string;
  description: string | null;
  status: 'planning' | 'active' | 'completed';
  current_round: number;
  active_combatant_id: string | null;
  log?: any[]; // Array of combat events
  created_at: string;
  updated_at: string;
}
