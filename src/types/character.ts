// types/character.ts

// --- CURRENCY & ITEMS ---

export interface Money {
  gold: number;
  silver: number;
  copper: number;
}

// Defines an item as it exists in a character's inventory
export interface InventoryItem {
  id: string; // Unique instance ID for this item in the inventory
  item_id: string; // Foreign Key to the master GameItem
  name: string;
  quantity: number;
  description?: string;
  type: string; // e.g., 'weapon', 'armor', 'consumable'
  properties?: Record<string, any>; // Flexible properties like { "damage": "1d6" }
  equipped: boolean; // Simplified from equipped_status
  weight?: number;
  cost?: Money;
}

// Defines a master item template from the database
export interface GameItem {
  id: string;
  name:string;
  description: string;
  type: string;
  properties: Record<string, any>;
  weight: number;
  cost: Money;
  // ... other master item properties
}

export interface EquippedItems {
  armor?: InventoryItem | null;
  shield?: InventoryItem | null;
  helmet?: InventoryItem | null;
  weapons: InventoryItem[]; // Can equip multiple weapons
  // Add other slots as needed
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

// REFINED: Actual Dragonbane skills for a more accurate type
export enum SkillName {
  Acrobatics = "Acrobatics",
  BeastLore = "Beast Lore",
  Bladework = "Bladework",
  Bushcraft = "Bushcraft",
  Crafting = "Crafting",
  Evade = "Evade",
  Healing = "Healing",
  HuntingAndFishing = "Hunting & Fishing",
  Languages = "Languages",
  MythsAndLegends = "Myths & Legends",
  Performance = "Performance",
  Persuasion = "Persuasion",
  Riding = "Riding",
  SleightOfHand = "Sleight of Hand",
  Sneaking = "Sneaking",
  SpotHidden = "Spot Hidden",
  Swimming = "Swimming",
  Seamanship = "Seamanship",
  // Add any other core or optional skills
}

// A record mapping skill names to their level, e.g., { "Swords": 2, "Stealth": 1 }
export type SkillLevels = Record<string, number>;

// This is the correct type guard for the requirement format used elsewhere in the app.
// It checks for an object where keys are skill names and values are numbers (or null).
export function isSkillNameRequirement(obj: any): obj is Record<string, number | null> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }
  // Check if all values are either numbers or null
  return Object.values(obj).every(value => typeof value === 'number' || value === null);
}


// --- FIX: ADD THE MISSING INTERFACE AND FUNCTION BACK ---

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
// --- END FIX ---


export interface Spell {
  id: string;
  name: string;
  rank: number;
  school_name?: string; // e.g., "Animism", "Elementalism". General spells won't have this.
  description: string;
  // ... other spell properties
}

export interface CharacterSpells {
  known: string[]; // Simple array of known spell names or IDs
}

export interface Teacher {
  skillUnderStudy: string | null;
}

// --- CHARACTER ---

export interface PartyStub {
  id: string;
  name: string;
}

export interface Character {
  id: string; // UUID
  user_id: string; // UUID of the user who owns this character
  party_id?: string | null;
  party_info?: PartyStub | null;

  // REFINED: Standardized to Dragonbane terminology and removed redundant fields
  name: string;
  kin: string;
  profession: string;
  age?: number;
  appearance?: string;
  background?: string;
  notes?: string; // For backstory and other details
  portrait_url?: string;
  
  // ADDED: The missing fields for memento and flaw
  memento?: string | null;
  flaw?: string | null;

  // Core Attributes
  attributes: Attributes;

  // Derived Stats
  max_hp: number;
  current_hp: number;
  max_wp: number;
  current_wp: number;
  
  // Skills, Spells, and Abilities
  skill_levels: SkillLevels;
  spells?: CharacterSpells;
  heroic_abilities?: string[]; // Array of heroic ability names
  
  // Equipment
  equipment: Equipment;

  // Status
  conditions: Conditions;
  is_rallied?: boolean; // For death saves
  death_rolls_failed?: number;

  // Character Progression & Social
  experience: number; // Single source for experience points
  teacher?: Teacher | null;
  reputation?: number;

  // Timestamps
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
}

// Correctly used Partial<T> with the Character interface
// This is the data structure for the character creation process
export type CharacterCreationData = Partial<Character>;