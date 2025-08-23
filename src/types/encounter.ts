import type { Character } from './character';
import type { MonsterData } from './bestiary';

export interface Encounter {
  id: string;
  party_id: string;
  name: string;
  description?: string | null;
  status: 'planning' | 'active' | 'completed';
  current_round: number;
  active_combatant_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EncounterCombatant {
  id: string;
  encounter_id: string;
  character_id?: string | null;
  monster_id?: string | null;
  is_player_character: boolean;
  display_name: string;
  current_hp: number;
  max_hp: number;
  current_wp?: number | null;
  max_wp?: number | null;
  status_effects: any[]; // Define a proper type for status effects later
  initiative_roll?: number | null;
  is_active_turn: boolean;
  created_at: string;
  updated_at: string;
  // Optional hydrated data - removed level reference
  characters?: Pick<Character, 'name'>;
  monsters?: Pick<MonsterData, 'name'>;
}
