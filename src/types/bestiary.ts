// Defines the structure for monster data, including stats and attacks.

      export type MonsterSize = "Small" | "Normal" | "Large" | "Huge" | "Swarm";

      export const MONSTER_SIZES: MonsterSize[] = ["Small", "Normal", "Large", "Huge", "Swarm"];

      export interface MonsterStats {
        FEROCITY: number;
        SIZE: MonsterSize;
        MOVEMENT: number;
        ARMOR: number;
        HP: number;
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
        created_at?: string; // timestamptz
        updated_at?: string; // timestamptz
      }
