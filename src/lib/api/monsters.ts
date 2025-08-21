import { supabase } from '../supabase';
import type { MonsterData } from '../../types/bestiary';

export async function fetchAllMonsters(): Promise<MonsterData[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*');

  if (error) {
    console.error('Error fetching all monsters:', error);
    throw error;
  }
  return data || [];
}
