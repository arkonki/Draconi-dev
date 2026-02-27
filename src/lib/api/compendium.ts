import { supabase } from '../supabase';
import { CompendiumEntry, CompendiumTemplate, GrimoireSpell } from '../../types/compendium';

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

export async function fetchGrimoireSpells(): Promise<GrimoireSpell[]> {
  const { data, error } = await supabase
    .from('game_spells')
    .select(`
      id,
      name,
      description,
      school_id,
      rank,
      casting_time,
      range,
      duration,
      willpower_cost,
      dice,
      power_level,
      prerequisite,
      requirement,
      created_at,
      updated_at,
      magic_schools ( name )
    `)
    .order('rank', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching grimoire spells:', error);
    throw new Error(error.message || 'Failed to load grimoire spells');
  }

  return (data as GrimoireSpell[]) || [];
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

export async function saveCompendiumEntry(entry: CompendiumEntry, userId?: string): Promise<CompendiumEntry> {
  const normalizedTitle = (entry.title || '').trim();
  const normalizedCategory = (entry.category || 'General').trim() || 'General';
  const payload = {
    title: normalizedTitle,
    content: entry.content,
    category: normalizedCategory,
  };

  if (!normalizedTitle) {
    throw new Error('Entry title is required');
  }

  if (entry.id) {
    const { data, error } = await supabase
      .from('compendium')
      .update(payload)
      .eq('id', entry.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating compendium entry:', error);
      throw new Error(error.message || 'Failed to update compendium entry');
    }

    return data as CompendiumEntry;
  }

  if (!userId) {
    throw new Error('User is required to create a compendium entry');
  }

  const { data, error } = await supabase
    .from('compendium')
    .insert([{ ...payload, created_by: userId }])
    .select()
    .single();

  if (error) {
    console.error('Error creating compendium entry:', error);
    throw new Error(error.message || 'Failed to create compendium entry');
  }

  return data as CompendiumEntry;
}

export async function createCompendiumEntry(entry: Omit<CompendiumEntry, 'id' | 'created_at' | 'updated_at'>): Promise<CompendiumEntry> {
  return saveCompendiumEntry(entry, entry.created_by);
}
