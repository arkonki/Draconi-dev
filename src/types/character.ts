// types/character.ts

// --- CURRENCY & ITEMS ---

export interface Money {
  gold: number;
  silver: number;
  copper: number;
}

export interface InventoryItem {
  id: string;
  item_id: string;
  name: string;
  quantity: number;
  description?: string;
  type: string;
  properties?: Record<string, any>;
  equipped: boolean;
  weight?: number;
  cost?: Money;
}

export interface GameItem {
  id: string;
  name:string;
  description: string;
  type: string;
  properties: Record<string, any>;
  weight: number;
  cost: Money;
}

export interface EquippedItems {
  armor?: InventoryItem | null;
  shield?: InventoryItem | null;
  helmet?: InventoryItem | null;
  weapons: InventoryItem[];
}

export interface Equipment {
  inventory: InventoryItem[];
  equipped: EquippedItems;
  money: Money;
}

// --- ATTRIBUTES & CONDITIONS ---

export type AttributeName = 'STR' | 'AGL' | 'INT' | 'CHA' | 'CON' | 'WIL';

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

// --- SPELLS & SKILLS ---

export type SkillLevels = Record<string, number>;

// --- FIX #1: Restoring the first missing function ---
export function isSkillNameRequirement(obj: any): obj is Record<string, number | null> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }
  return Object.values(obj).every(value => typeof value === 'number' || value === null);
}

// --- FIX #2: Restoring the second missing function and its interface ---
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
// --- END OF FIX ---


export interface CharacterSpells {
  school: {
    name: string | null;
    spells: string[];
  };
  general: string[];
}

export interface Teacher {
  skillUnderStudy: string | null;
}

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
  party_id?: string | null;
  party_info?: PartyStub | null;
  name: string;
  kin: string;
  profession: string;
  age?: number;
  appearance?: string;
  background?: string;
  notes?: string;
  portrait_url?: string;
  memento?: string;
  flaw?: string | null;
  attributes: Attributes;
  max_hp: number;
  current_hp: number;
  max_wp: number;
  current_wp: number;
  skill_levels: SkillLevels;
  spells: CharacterSpells;
  heroic_abilities: string[];
  equipment: Equipment;
  conditions: Conditions;
  is_rallied: boolean;
  death_rolls_passed: number;
  death_rolls_failed: number;
  experience: number;
teacher?: Teacher | null;
  reputation: number;
  corruption: number;
  created_at: string;
  updated_at: string;
}

export type CharacterCreationData = Partial<Character>;
