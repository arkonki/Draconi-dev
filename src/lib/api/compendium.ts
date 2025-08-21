import { supabase } from '../supabase';
import { CompendiumEntry, CompendiumTemplate } from '../../types/compendium';

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

// Add mutation functions later if needed (create, update, delete)
