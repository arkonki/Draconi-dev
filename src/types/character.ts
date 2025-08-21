export interface Money {
  gold: number;
  silver: number;
  copper: number;
}

export interface EquippedItems {
  armor?: InventoryItem | null;
  shield?: InventoryItem | null;
  helmet?: InventoryItem | null;
  weapons: InventoryItem[]; // Allow multiple weapons
  // Add other slots as needed, e.g., cloak, boots, rings, amulet
}

export interface InventoryItem {
  id: string; // Unique ID for the instance of the item in inventory, if needed, or use item_id from GameItem
  item_id: string; // FK to GameItem
  name: string;
  quantity: number;
  description?: string;
  type: string; // e.g., 'weapon', 'armor', 'consumable', 'gear'
  properties?: Record<string, any>; // e.g., { "damage": "1d6", "range": "melee" }
  equipped_status?: 'equipped' | 'carried' | 'stored'; // More granular status
  weight?: number;
  cost?: Money;
  // any other relevant fields from GameItem that you want to denormalize or override
}

export interface GameItem { // This is what fetchItems would return
  id: string; // Master item ID
  name: string;
  description: string;
  type: string; // e.g., 'weapon', 'armor', 'consumable', 'gear'
  properties: Record<string, any>;
  weight: number;
  cost: Money;
  rarity?: string;
  requires_attunement?: boolean;
  effects?: string[]; // Descriptive effects
  // ... other master item properties
}


export interface Equipment {
  inventory: InventoryItem[];
  equipped: EquippedItems;
  money: Money;
}

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
  // Add other conditions as per Dragonbane rules
  [key: string]: boolean; // Allow for dynamic conditions
}

export interface Spell {
  id: string; // Unique ID for the spell definition
  name: string;
  rank: number; // Or level
  type: 'General' | string; // General or specific magic school name
  description: string;
  requirements?: string; // e.g., "Iron Ring"
  effect: string;
  duration?: string;
  range?: string;
  casting_time?: string;
  // ... other spell properties
}

export interface CharacterSpells {
  school: {
    name: string | null; // Name of the magic school, e.g., "Animism", "Elementalism"
    spells: string[]; // Array of spell names or IDs known in this school
  } | null;
  general: string[]; // Array of general spell names or IDs known
}

export interface Teacher {
  skillUnderStudy: string | null; // Name of the skill being studied
  // progress?: number; // Optional: track study progress
  // location?: string; // Optional: where the teacher is
}

// For skill_levels, it's better to have a defined structure if it's JSONB
// Example: { "Swords": 2, "Stealth": 1 }
export type SkillLevels = Record<string, number>;


// Represents basic party information fetched alongside a character
export interface PartyStub {
  id: string;
  name: string;
}

export interface Character {
  id: string; // UUID
  user_id?: string; // UUID of the user who owns this character
  created_by?: string; // User ID - might be redundant if user_id is primary owner
  party_id?: string | null; // UUID of the party this character belongs to
  party_info?: PartyStub | null; // Populated details of the party

  name: string;
  class?: string; // Profession in Dragonbane
  race?: string; // Kin in Dragonbane
  level?: number; // Not directly a Dragonbane concept, but can be house-ruled or derived
  background?: string;
  alignment?: string; // Not a Dragonbane concept
  experience_points?: number; // Or just 'experience'

  // Core Dragonbane attributes
  attributes: Attributes;

  // Derived stats
  max_hp: number; // Typically CON score
  current_hp: number;
  temporary_hp?: number; // If using this mechanic
  max_wp: number; // Typically WIL score
  current_wp: number;

  armor_class?: number; // Calculated based on armor, shield, AGL
  speed?: number; // Base speed, modified by kin/armor
  proficiency_bonus?: number; // Not a Dragonbane concept, use skill levels

  // Dragonbane specific fields
  age?: number;
  kin?: string; // e.g., Human, Elf, Dwarf, Halfling, Mallard, Wolfkin
  profession?: string; // e.g., Warrior, Hunter, Mage, Thief
  
  appearance?: string; // Text description
  notes?: string; // General notes

  conditions: Conditions;
  
  equipment: Equipment;
  
  // Skills: Dragonbane uses skill levels (1-18). Store as JSONB or related table.
  // Example: skill_levels: { "Swords": 2, "Stealth": 1 }
  skill_levels?: SkillLevels | string; // string if it's a raw JSON string from DB initially

  // Spells
  spells?: CharacterSpells; // Learned spells
  prepared_spells?: string[]; // Array of spell names/IDs prepared for the day

  // Other Dragonbane specific character aspects
  mementos?: string[];
  weak_spot?: string; // Text description of a weak spot
  heroic_ability?: string[]; // Array of heroic ability names
  
  teacher?: Teacher | null; // Information about current teacher if any

  // Tracking for game mechanics
  experience?: number; // Total XP or unspent XP for skill increases
  reputation?: number;
  corruption?: number; // If using corruption rules
  death_rolls_passed?: number;
  death_rolls_failed?: number;
  is_rallied?: boolean; // For death saves

  created_at?: string; // timestamptz
  updated_at?: string; // timestamptz
}

// Placeholder for skill names - this should be expanded based on your game system
export enum SkillName {
  Acrobatics = "Acrobatics", // Example, adapt to Dragonbane skills
  Arcana = "Arcana",
  Athletics = "Athletics",
  Deception = "Deception",
  History = "History",
  Insight = "Insight",
  Intimidation = "Intimidation",
  Investigation = "Investigation",
  Medicine = "Medicine",
  Nature = "Nature",
  Perception = "Perception",
  Performance = "Performance",
  Persuasion = "Persuasion",
  Religion = "Religion",
  SleightOfHand = "SleightOfHand",
  Stealth = "Stealth",
  Survival = "Survival",
  // Add actual Dragonbane skills here
}

export interface SkillNameRequirement {
  skill: SkillName;
  minimumValue?: number;
}

export function isSkillNameRequirement(obj: any): obj is SkillNameRequirement {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return (
    typeof obj.skill === 'string' &&
    Object.values(SkillName).includes(obj.skill as SkillName) &&
    (obj.minimumValue === undefined || typeof obj.minimumValue === 'number')
  );
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
