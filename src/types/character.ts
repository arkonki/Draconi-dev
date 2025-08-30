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

export interface SkillRequirement {
  [key: string]: number; // e.g. { "Swords": 12, "Persuasion": 10 }
}

// --- CORRECTED: This type now matches the data structure used by the rest of the app ---
export interface CharacterSpells {
  school: {
    name: string | null;
    spells: string[]; // Array of spell names
  };
  general: string[]; // Array of general spell names
}

export interface Teacher {
  skillUnderStudy: string | null;
}

// --- STUB TYPES FOR RELATIONSHIPS ---

export interface PartyStub {
  id: string;
  name: string;
}

// --- ADDED: A proper stub for characters, used in the PartyView/SessionEndCheatsheet ---
export interface CharacterStub {
  id: string;
  name: string;
  kin: string;
  profession: string;
  flaw?: string | null; // The SessionEndCheatsheet needs this
}


// --- THE MAIN CHARACTER INTERFACE ---

export interface Character {
  id: string;
  user_id: string;
  party_id?: string | null;
  party_info?: PartyStub | null;

  // Basic Info
  name: string;
  kin: string;
  profession: string;
  age?: number;
  appearance?: string;
  background?: string;
  notes?: string;
  portrait_url?: string;
  memento?: string;
  flaw?: string | null; // Standardized name (ensure your mapCharacterData maps 'weak_spot' to this)

  // Core Attributes
  attributes: Attributes;

  // Derived Stats
  max_hp: number;
  current_hp: number;
  max_wp: number;
  current_wp: number;
  
  // Skills, Spells, and Abilities
  skill_levels: SkillLevels;
  spells: CharacterSpells;
  heroic_abilities: string[]; // Standardized to plural (ensure your API maps this to/from 'heroic_ability')
  
  // Equipment
  equipment: Equipment;

  // Status
  conditions: Conditions;
  
  // --- ADDED: Missing death & dying fields ---
  is_rallied: boolean;
  death_rolls_passed: number;
  death_rolls_failed: number;

  // Character Progression & Social
  experience: number;
  teacher?: Teacher | null;
  reputation: number;
  corruption: number;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// This is the data structure for the character creation process
export type CharacterCreationData = Partial<Character>;