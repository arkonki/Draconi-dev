import { supabase } from '../supabase';
import { Ability } from '../../types/character'; // Use Ability type from character types

// Fetches all heroic abilities - filtering should happen client-side for now
// based on character data (kin, profession, known abilities, requirements)
export async function fetchHeroicAbilities(): Promise<Ability[]> {
  const { data, error } = await supabase
    .from('heroic_abilities') // Ensure this table name is correct
    .select(`
      id,
      name,
      description,
      willpower_cost,
      requirement,
      kin,        
      profession  
    `); // Select all relevant columns - CORRECTED: Removed invalid comments

  if (error) {
    console.error('Error fetching heroic abilities:', error);
    throw new Error(error.message || 'Failed to fetch heroic abilities');
  }

  // Map data to Ability type, handling potential nulls
  const abilities: Ability[] = (data || []).map(ab => ({
    id: ab.id,
    name: ab.name,
    description: ab.description,
    willpower_cost: ab.willpower_cost,
    requirement: ab.requirement,
    kin: ab.kin,
    profession: ab.profession,
  }));

  return abilities;
}
