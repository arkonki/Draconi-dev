import { supabase } from '../supabase';

// Defines the expected structure of the 'flaws' data in your table.
// Assumes the 'flaws' column is an array of strings (e.g., a JSONB array).
interface WeaknessData {
  flaws: string[];
}

/**
 * Fetches the list of possible weaknesses from the bio_data table.
 */
export async function fetchWeaknesses(): Promise<WeaknessData | null> {
  // We select the 'flaws' column from the single row where the name is 'WEAKNESS'.
  const { data, error } = await supabase
    .from('bio_data')
    .select('flaws')
    .eq('name', 'WEAKNESS')
    .single();

  if (error) {
    console.error("Error fetching weaknesses:", error);
    throw new Error(error.message);
  }

  return data as WeaknessData | null;
}