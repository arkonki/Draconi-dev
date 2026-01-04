import { supabase } from '../supabase';

// Define the Item type based on the 'game_items' table structure
export interface GameItem {
  id: string; 
  name: string;
  category: string; 
  cost: string; 
  supply?: string; 
  weight: number; 
  
  // Description / Rules
  effect?: string; 
  description?: string;
  
  // Combat Stats
  armor_rating?: number | string;
  grip?: string; 
  strength_requirement?: number | string;
  range?: string | number;
  damage?: string; 
  durability?: number | string;
  features?: string | string[]; 
  skill?: string; 
  
  // Meta
  is_custom?: boolean; 
  idx?: number; 
  created_at?: string;
  updated_at?: string;
  
  [key: string]: any;
}

// --- UPDATED FETCH FUNCTION ---
export async function fetchItems(category?: string | any): Promise<GameItem[]> {
  let query = supabase.from('game_items').select('*');

  // SAFETY CHECK: React Query passes an object context by default.
  // We only filter if 'category' is explicitly a STRING.
  if (typeof category === 'string' && category !== 'all') {
    query = query.eq('category', category.toUpperCase());
  }

  // Sort: Custom items first, then standard items
  const { data, error } = await query
    .order('is_custom', { ascending: false }) 
    .order('category')
    .order('name');

  if (error) {
    console.error('Error fetching game items:', error);
    // Return empty array instead of throwing to prevent UI crashes
    return []; 
  }

  return (data as GameItem[]) || [];
}

// Function to create a NEW custom item
export async function createGameItem(item: Partial<GameItem>): Promise<GameItem> {
  const { id, created_at, updated_at, ...itemData } = item;

  const cleanNumber = (val: any) => (val === '' || val === undefined || val === null ? null : Number(val));

  const payload = {
    ...itemData,
    weight: cleanNumber(itemData.weight) || 0,
    armor_rating: cleanNumber(itemData.armor_rating),
    durability: cleanNumber(itemData.durability),
    strength_requirement: cleanNumber(itemData.strength_requirement),
    is_custom: true 
  };

  const { data, error } = await supabase
    .from('game_items')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as GameItem;
}

export async function findItemByName(name: string): Promise<GameItem | null> {
   if (!name) return null;

   const { data, error } = await supabase
    .from('game_items')
    .select('*')
    .ilike('name', name) 
    .maybeSingle();

  if (error) return null;
  return data as GameItem | null;
}