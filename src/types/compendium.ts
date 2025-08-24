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
