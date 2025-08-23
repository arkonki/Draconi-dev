import { supabase } from '../supabase';
import type { MonsterData } from '../../types/bestiary';

export async function fetchAllMonsters(): Promise<MonsterData[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching all monsters:', error);
    throw error;
  }
  return data || [];
}

export async function fetchMonstersByCategory(category: string): Promise<MonsterData[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('category', category)
    .order('name');

  if (error) {
    console.error('Error fetching monsters by category:', error);
    throw error;
  }
  return data || [];
}

export async function fetchMonsterById(id: string): Promise<MonsterData | null> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching monster by ID:', error);
    throw error;
  }
  return data;
}
