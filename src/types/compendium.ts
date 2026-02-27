export interface CompendiumEntry {
  id?: string;
  title: string;
  content: string;
  category: string;
  template?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CompendiumTemplate {
  id?: string;
  name: string;
  category: string;
  description: string;
  content: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GrimoireSpell {
  id: string;
  name: string;
  description: string | null;
  school_id: string | null;
  rank: number | null;
  casting_time: string | null;
  range: string | null;
  duration: string | null;
  willpower_cost: number | null;
  dice: string | null;
  power_level: 'yes' | 'none' | null;
  prerequisite: string | null;
  requirement: string | null;
  magic_schools: { name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface BioData {
  id?: string;
  name: string;
  appearance: string[];
  mementos: string[];
  flaws: string[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}
