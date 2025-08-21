import { supabase } from '../supabase';
import { Ability } from '../../types/character'; // Import Ability type

export interface Kin {
  id: string;
  name: string;
  description: string;
  heroic_ability: string | null; // UPDATED: Use correct column name
  created_at?: string;
}

export async function fetchKinList(): Promise<Kin[]> {
  const { data, error } = await supabase
    .from('kin')
    .select('id, name, description, heroic_ability'); // UPDATED: Select correct column

  if (error) {
    console.error('Error fetching kin list:', error);
    // Throw the actual Supabase error for better debugging
    throw new Error(error.message || 'Failed to fetch kin list');
  }
  return data || [];
}

// Function to fetch full details for multiple abilities by their names
// (Assuming heroic_ability contains comma-separated names for now)
export async function fetchAbilityDetailsByNames(abilityNames: string[]): Promise<Ability[]> {
  if (!abilityNames || abilityNames.length === 0) {
    return []; // Return empty if no names provided
  }

  // Clean up names (trim whitespace)
  const cleanedNames = abilityNames.map(name => name.trim()).filter(name => name);
  if (cleanedNames.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('heroic_abilities') // Ensure table name is correct
    .select('id, name, description, willpower_cost, requirement') // Select desired fields
    .in('name', cleanedNames); // Filter by the list of names

  if (error) {
    console.error('Error fetching ability details by names:', error);
    throw new Error(error.message || 'Failed to fetch ability details');
  }

  // Map data to Ability type (might be redundant if columns match exactly)
  return (data || []).map(ability => ({
    id: ability.id,
    name: ability.name,
    description: ability.description,
    willpower_cost: ability.willpower_cost,
    requirement: ability.requirement,
  }));
}
