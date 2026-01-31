import { supabase } from '../supabase';
import { CompendiumEntry, CompendiumTemplate } from '../../types/compendium';

export interface BioOptions {
  appearance: string[];
  mementos: string[];
  flaws: string[];
}

export async function fetchCompendiumEntries(): Promise<CompendiumEntry[]> {
  const { data, error } = await supabase
    .from('compendium')
    .select('*')
    .order('category')
    .order('title');

  if (error) {
    console.error('Error fetching compendium entries:', error);
    throw new Error(error.message || 'Failed to load compendium entries');
  }
  return (data as CompendiumEntry[]) || [];
}

export async function fetchCompendiumTemplates(): Promise<CompendiumTemplate[]> {
  const { data, error } = await supabase
    .from('compendium_templates')
    .select('*')
    .order('category')
    .order('name');

  if (error) {
    console.error('Error fetching compendium templates:', error);
    throw new Error(error.message || 'Failed to load compendium templates');
  }
  return (data as CompendiumTemplate[]) || [];
}

export async function fetchBioData(): Promise<BioOptions> {
  const { data, error } = await supabase
    .from('bio_data')
    .select('appearance, mementos, flaws');

  if (error) {
    console.error('Error fetching bio data:', error);
    throw new Error(error.message || 'Failed to load bio data');
  }

  const allAppearance = new Set<string>();
  const allMementos = new Set<string>();
  const allFlaws = new Set<string>();

  (data || []).forEach(row => {
    (row.appearance || []).forEach(item => allAppearance.add(item));
    (row.mementos || []).forEach(item => allMementos.add(item));
    (row.flaws || []).forEach(item => allFlaws.add(item));
  });

  return {
    appearance: Array.from(allAppearance).sort(),
    mementos: Array.from(allMementos).sort(),
    flaws: Array.from(allFlaws).sort(),
  };
}

export async function deleteCompendiumEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('compendium')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting compendium entry:', error);
    throw new Error(error.message || 'Failed to delete compendium entry');
  }
}
