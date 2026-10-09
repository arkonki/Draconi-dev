export interface EncounterStatusEffect {
  name: string;
  duration?: number | null;
  [key: string]: unknown;
}

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
  status_effects: EncounterStatusEffect[];
  initiative_roll: number | null;
  initiative_slots?: number[];
  completed_initiative_slots?: number[];
  is_active_turn: boolean;
  has_acted: boolean;
  created_at: string;
  updated_at: string;
  character?: {
    user_id?: string;
    current_hp: number;
    max_hp: number;
    current_wp: number;
    max_wp: number;
    heroic_ability?: string[];
    attributes?: Record<string, number> | string;
    conditions?: Record<string, boolean>;
    is_rallied?: boolean;
    death_rolls_passed?: number;
    death_rolls_failed?: number;
    equipment?: { equipped?: { armor?: string; helmet?: string } } | null;
    skill_levels?: Record<string, number>;
    marked_skills?: string[];
  };
}

export interface Encounter {
  id: string;
  party_id: string;
  name: string;
  description: string | null;
  status: 'planning' | 'active' | 'completed';
  current_round: number;
  active_combatant_id: string | null;
  active_initiative_slot?: number | null;
  log?: unknown[]; // Array of combat events
  created_at: string;
  updated_at: string;
}
