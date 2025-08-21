import { supabase } from '../supabase';
import { Spell } from '../../types/magic'; // Assuming Spell type is defined here

// Define the MagicSchool type based on your table structure
export type MagicSchool = {
  id: number | string; // Allow string if UUID
  name: string;
  description?: string; // Optional description
  created_at?: string;
};

// Fetch all spells
export async function fetchSpells(): Promise<Spell[]> {
  const { data, error } = await supabase
    .from('game_spells') // Ensure this is your spells table name
    .select(`
      *,
      magic_schools ( name )
    `) // Fetch school name if relation exists
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching spells:', error);
    throw new Error(error.message || 'Failed to fetch spells');
  }
  // Cast data to include potential nested school name
  return (data as unknown as Spell[]) || [];
}

// Fetch spells by school ID
export async function fetchSpellsBySchool(schoolId: number | string): Promise<Spell[]> {
  const { data, error } = await supabase
    .from('game_spells')
    .select(`
      *,
      magic_schools ( name )
    `) // Fetch school name
    .eq('school_id', schoolId) // Ensure 'school_id' is the correct foreign key column
    .order('name', { ascending: true });

  if (error) {
    console.error(`Error fetching spells for school ${schoolId}:`, error);
    throw new Error(error.message || `Failed to fetch spells for school ${schoolId}`);
  }
  return (data as unknown as Spell[]) || [];
}

// Fetch only general spells (school_id is NULL)
export async function fetchGeneralSpells(): Promise<Spell[]> {
  const { data, error } = await supabase
    .from('game_spells')
    .select(`
      *,
      magic_schools ( name )
    `) // Include school name (will be null for general)
    .is('school_id', null) // Filter for NULL school_id
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching general spells:', error);
    throw new Error(error.message || 'Failed to fetch general spells');
  }
  return (data as unknown as Spell[]) || [];
}


// Fetch all magic schools
export async function fetchMagicSchools(): Promise<MagicSchool[]> {
  const { data, error } = await supabase
    .from('magic_schools') // Ensure this is your magic schools table name
    .select('id, name, description') // Select only needed fields
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching magic schools:', error);
    throw new Error(error.message || 'Failed to fetch magic schools');
  }
  return (data as MagicSchool[]) || [];
}
