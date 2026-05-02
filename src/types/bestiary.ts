// Defines the structure for monster data, including stats and attacks.

import type { AttributeName, DiceType } from './character';

export type MonsterSize = 'Small' | 'Normal' | 'Large' | 'Huge' | 'Swarm';

export const MONSTER_SIZES: MonsterSize[] = ['Small', 'Normal', 'Large', 'Huge', 'Swarm'];

export interface MonsterGearItem {
  item_id: string;
  name: string;
  category?: string;
  quantity: number;
  description?: string;
  damage?: string;
  armor_rating?: number | string;
  range?: string | number;
  grip?: string;
  durability?: number | string;
  features?: string | string[];
  effect?: string;
  skill?: string;
}

export interface MonsterDamageBonusConfig {
  attribute: AttributeName;
  die: DiceType;
}

export interface MonsterSkillEntry {
  skill_id: string;
  name: string;
  level: number;
  attribute?: string | null;
}

export interface MonsterHeroicAbilityEntry {
  ability_id: string;
  name: string;
  description?: string;
  willpower_cost?: number | null;
}

export interface MonsterStats {
  FEROCITY: number;
  SIZE: MonsterSize;
  MOVEMENT: number;
  ARMOR: number;
  HP: number;
  IS_NPC?: boolean;
  TYPE?: string;
  SKILLS?: string;
  SKILL_ENTRIES?: MonsterSkillEntry[];
  HEROIC_ABILITIES?: string;
  HEROIC_ABILITY_ITEMS?: MonsterHeroicAbilityEntry[];
  DAMAGE_BONUS?: string;
  DAMAGE_BONUS_CONFIG?: MonsterDamageBonusConfig | null;
  WP?: number;
  GEAR?: string;
  GEAR_ITEMS?: MonsterGearItem[];
}

// An effect, which could be part of a D6 rollable table of effects
export interface MonsterEffectEntry {
  id?: string; // For React key prop during rendering
  roll_values?: string; // e.g., "1", "2-3", "4-6". If undefined, it's a single unconditional effect.
  name: string;
  description: string;
}

// An attack, which could be part of a D6 rollable table of attacks
export interface MonsterAttackEntry {
  id?: string; // For React key prop during rendering
  roll_values?: string; // e.g., "1", "2-3", "4-6". If undefined, it's a single unconditional attack.
  name: string;
  description: string;
  effects?: MonsterEffectEntry[]; // Optional list of effects, which themselves can form a D6 table.
}

export interface MonsterData {
  id?: string; // UUID
  created_by?: string; // UUID of user
  name: string;
  description?: string;
  category?: string; // e.g., "Undead", "Beast", "Humanoid"
  stats: MonsterStats;
  attacks: MonsterAttackEntry[]; // This is the D6 rollable table of attacks.
  effectsSummary?: string;
  created_at?: string; // timestamptz
  updated_at?: string; // timestamptz
}
