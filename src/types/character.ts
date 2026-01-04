// src/types/character.ts

// --- CORE TYPES ---

export type AttributeName = 'STR' | 'AGL' | 'INT' | 'CHA' | 'CON' | 'WIL';
export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

// --- CURRENCY & ECONOMY ---

export interface Money {
  gold: number;
  silver: number;
  copper: number;
}

// --- ITEMS & EQUIPMENT ---

export interface InventoryItem {
  id?: string; // Optional because new items might not have IDs yet
  name: string;
  quantity: number;
  description?: string;
  category?: string; // 'WEAPON', 'ARMOR', 'LOOT', etc.
  weight?: number;
  cost?: string | number; // Support text like "10 gold" or numbers
}

export interface WeaponEntry {
  name: string;
  damage?: string;
  grip?: string;
  range?: string;
  durability?: string | number;
  features?: string[];
}

export interface EquippedItems {
  armor?: string;  // Name of the equipped armor item
  helmet?: string; // Name of the equipped helmet
  shield?: string; // Name of the equipped shield
  weapons: WeaponEntry[];
}

export interface Equipment {
  inventory: InventoryItem[];
  equipped: EquippedItems;
  money: Money;
}

// Used for fetching reference data from the game database
export interface GameItem {
  id: string;
  name: string;
  category: string;
  cost: string;
  weight: number | string;
  description?: string;
  effect?: string;
  requirement?: string;
  damage?: string;
  armor_rating?: number | string;
  range?: string;
  grip?: string;
  durability?: number | string;
  features?: string | string[];
  
  // Database specific fields
  created_at?: string;
  updated_at?: string;
  [key: string]: any; // Allow loose indexing for DB extras
}

// --- ITEM NOTES & DURABILITY ---

export interface ItemNote { 
  enhanced?: boolean; 
  bonus?: string; 
  broken?: boolean; // Tracks if item is broken via Parry
}

// Map: Category -> ItemID -> Note
export type CharacterItemNotes = Record<string, Record<string, ItemNote>>;

// --- ATTRIBUTES & CONDITIONS ---

export interface Attributes {
  STR: number;
  AGL: number;
  INT: number;
  CHA: number;
  CON: number;
  WIL: number;
}

export interface Conditions {
  exhausted: boolean;
  sickly: boolean;
  dazed: boolean;
  angry: boolean;
  scared: boolean;
  disheartened: boolean;
  [key: string]: boolean;
}

// --- SKILLS & SPELLS ---

export type SkillLevels = Record<string, number>;

export interface CharacterSpells {
  school: {
    name: string | null;
    spells: string[];
  };
  general: string[];
}

// --- ADVANCEMENT & ABILITIES ---

export interface Ability {
  id: string;
  name: string;
  description: string;
  willpower_cost?: number | null;
  requirement?: string | any; // Can be JSON logic or string text
  kin?: string; // If specific to a kin
}

export interface Teacher {
  skillUnderStudy: string | null;
}

// --- TYPE GUARDS & VALIDATION ---

export function isSkillNameRequirement(obj: any): obj is Record<string, number | null> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }
  return Object.values(obj).every(value => typeof value === 'number' || value === null);
}

export interface SkillUuidRequirement {
  skill_id: string; 
  minimumValue?: number;
}

export function isSkillUuidRequirement(obj: any): obj is SkillUuidRequirement {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return (
    typeof obj.skill_id === 'string' &&
    (obj.minimumValue === undefined || typeof obj.minimumValue === 'number')
  );
}

export type SkillRequirement = Record<string, number | null> | SkillUuidRequirement;

// --- STUB TYPES FOR RELATIONSHIPS ---

export interface PartyStub {
  id: string;
  name: string;
}

export interface CharacterStub {
  id: string;
  name: string;
  kin: string;
  profession: string;
  flaw?: string | null;
}

// --- THE MAIN CHARACTER INTERFACE ---

export interface Character {
  id: string;
  user_id: string;
  
  // Basic Info
  name: string;
  kin: string;
  profession: string;
  age?: number;
  appearance?: string;
  background?: string;
  notes?: string;
  portrait_url?: string;
  
  // Flaws & Magic
  memento?: string;
  flaw?: string | null;
  magicSchool?: string | null; // ID or Name of primary school
  
  // Stats
  attributes: Attributes;
  max_hp: number;
  current_hp: number;
  max_wp: number;
  current_wp: number;
  
  // Skills & Progression
  skill_levels: SkillLevels;
  trainedSkills: string[]; // List of trained skill names
  marked_skills: string[]; // Skills marked for advancement
  
  // Magic & Abilities
  spells: CharacterSpells;
  heroic_abilities: string[]; // List of ability names
  
  // Inventory
  equipment: Equipment;
  item_notes?: CharacterItemNotes; // JSONB storage for durability/enhancements
  
  // Status
  conditions: Conditions;
  is_rallied: boolean;
  death_rolls_passed: number;
  death_rolls_failed: number;
  
  // Advancement
  experience: number;
  teacher?: Teacher | null;
  reputation: number;
  corruption: number;
  
  // Meta
  created_at: string;
  updated_at: string;
  party_id?: string | null;
  party_info?: PartyStub | null;
}

export type CharacterCreationData = Partial<Character>;