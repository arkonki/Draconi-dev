import { supabase } from '../supabase';

// Define the Profession type based on expected Supabase structure
// Adjust if your Supabase table columns differ, especially 'skills' type
export type Profession = {
  id: number; // Assuming 'id' is the primary key
  name: string;
  description: string;
  key_attribute: string;
  skills: string[]; // Assuming 'skills' is stored as text[] in Supabase
  heroic_ability: string | string[]; // Keep flexible for now
  magic_school_id: string | null; // Foreign key to magic_schools or null
  created_at?: string; // Optional timestamp
  starting_equipment?: string[]; // Added based on GearSelection step
  equipment_description?: string[]; // Added based on GearSelection step
};

export async function fetchProfessionList(): Promise<Profession[]> {
  const { data, error } = await supabase
    .from('professions')
    .select('*')
    .order('name'); // Optional: order by name

  if (error) {
    console.error('Error fetching profession list:', error);
    throw new Error(error.message || 'Failed to fetch profession list');
  }

  // Basic type assertion, add more validation if needed
  return (data as Profession[]) || [];
}

// Function to fetch heroic abilities for a specific profession name
// Note: It might be better to link abilities by profession ID in the future
export async function fetchHeroicAbilitiesByProfession(professionName: string) {
   const { data, error } = await supabase
    .from('heroic_abilities')
    .select('*')
    .eq('profession', professionName); // Assuming 'profession' column stores the name

  if (error) {
    console.error('Error fetching heroic abilities:', error);
    throw new Error(error.message || 'Failed to fetch heroic abilities');
  }
  return data || [];
}
