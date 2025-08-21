import { CharacterSpells } from "./character"; // Assuming CharacterSpells might be used if spells require other spells by ID eventually

export interface MagicSchool {
  id: string;
  name: string;
  description: string;
  created_at?: string;
  updated_at?: string;
  // relevant_skill: string; // Example: 'Animism', 'Elementalism', 'Mentalism'
}

export type PrerequisiteType = "spell" | "school" | "skill" | "attribute" | "anySchool" | "logical";

export interface BasePrerequisite {
  type: PrerequisiteType;
  negate?: boolean; // Optional: to represent "NOT X"
}

export interface SpellKnownPrerequisite extends BasePrerequisite {
  type: "spell";
  name: string; // Name of the spell required
}

export interface SchoolMembershipPrerequisite extends BasePrerequisite {
  type: "school";
  name: string; // Name of the magic school
}

export interface AnySchoolPrerequisite extends BasePrerequisite {
  type: "anySchool";
}

export interface SkillLevelPrerequisite extends BasePrerequisite {
  type: "skill";
  name: string; // Name of the skill
  value: number; // Minimum skill level required
}

export interface AttributeLevelPrerequisite extends BasePrerequisite {
  type: "attribute";
  name: string; // Attribute abbreviation (e.g., "STR", "WIL")
  value: number; // Minimum attribute value required
}

export interface LogicalPrerequisite extends BasePrerequisite {
  type: "logical";
  operator: "AND" | "OR";
  conditions: SpellPrerequisite[];
}

export type SinglePrerequisite =
  | SpellKnownPrerequisite
  | SchoolMembershipPrerequisite
  | AnySchoolPrerequisite
  | SkillLevelPrerequisite
  | AttributeLevelPrerequisite;

export type SpellPrerequisite = SinglePrerequisite | LogicalPrerequisite;


export interface Spell {
  id: string; // Assuming it's a UUID from the database
  name: string;
  description: string;
  school_id: string | null; // Foreign key to magic_schools table, null for general spells
  rank: number | null; // e.g., 0 for trick, 1-3 for ranks
  casting_time: string | null;
  range: string | null;
  duration: string | null;
  willpower_cost: number | null;
  prerequisite: string | null; // JSON string for learning prerequisites
  casting_requirement: string | null; // Free-text or other format for casting requirements
  // power_levels: boolean; // Does it support power levels?
  created_at?: string;
  updated_at?: string;
  school_name?: string; // Optional: populated if joined
}

// Example of how a `prerequisite` (JSON string for learning) might look in the database:
// Single condition:
// '{"type": "spell", "name": "Light"}'
// '{"type": "school", "name": "Elementalism"}'
// '{"type": "anySchool"}'
// '{"type": "skill", "name": "Mentalism", "value": 10}'
// '{"type": "attribute", "name": "WIL", "value": 13}'

// Combined conditions:
// '{
//    "type": "logical",
//    "operator": "AND",
//    "conditions": [
//      {"type": "school", "name": "Elementalism"},
//      {"type": "spell", "name": "Ignite"}
//    ]
//  }'
// ... and so on for other examples.
