import { supabase } from '../supabase';

// Define the Item type based on the 'game_items' table structure
export interface GameItem {
  id: string; 
  name: string;
  category: string; // e.g., 'ARMOR & HELMETS', 'MELEE WEAPONS', 'LOOT'
  cost: string; // e.g., "2 gold"
  supply?: string; // e.g., 'Common', 'Uncommon'
  weight: number; 
  
  // Description / Rules
  effect?: string; 
  description?: string; // Alias for effect in some contexts
  
  // Combat Stats
  armor_rating?: number | string;
  grip?: string; // '1H', '2H'
  strength_requirement?: number | string;
  range?: string | number;
  damage?: string; // e.g., 'D8', '2D6'
  durability?: number | string;
  features?: string | string[]; // Can be array from DB or string from CSV import
  skill?: string; // The skill used (e.g. 'Swords')
  
  // Meta
  is_custom?: boolean; // <--- NEW: To distinguish user-created loot
  idx?: number; // Sorting index
  created_at?: string;
  updated_at?: string;
  
  // Catch-all for extra columns
  [key: string]: any;
}

// Function to fetch all game items
export async function fetchItems(category?: string): Promise<GameItem[]> {
  let query = supabase.from('game_items').select('*');

  if (category && category !== 'all') {
    query = query.eq('category', category.toUpperCase());
  }

  // Sort: Custom items first, then standard items, then alphabetically
  const { data, error } = await query
    .order('is_custom', { ascending: false }) 
    .order('category')
    .order('name');

  if (error) {
    console.error('Error fetching game items:', error);
    throw new Error(error.message || 'Failed to fetch game items');
  }

  return (data as GameItem[]) || [];
}

// Function to create a NEW custom item (Used by Loot Assignment)
export async function createGameItem(item: Partial<GameItem>): Promise<GameItem> {
  // Strip system fields that Supabase generates
  const { id, created_at, updated_at, ...itemData } = item;

  // 1. Ensure numeric fields are actually numbers or null (converts "5" to 5, "" to null)
  const cleanNumber = (val: any) => (val === '' || val === undefined || val === null ? null : Number(val));

  const payload = {
    ...itemData,
    weight: cleanNumber(itemData.weight) || 0,
    armor_rating: cleanNumber(itemData.armor_rating),
    durability: cleanNumber(itemData.durability),
    strength_requirement: cleanNumber(itemData.strength_requirement),
    // Ensure it is flagged as custom
    is_custom: true 
  };

  const { data, error } = await supabase
    .from('game_items')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("Error creating custom item:", error);
    throw new Error(error.message || "Failed to create item");
  }

  return data as GameItem;
}

// Function to find a specific item by name
export async function findItemByName(name: string): Promise<GameItem | null> {
   if (!name) return null;

   const { data, error } = await supabase
    .from('game_items')
    .select('*')
    .ilike('name', name) // Use ilike for case-insensitive match
    .maybeSingle();

  if (error) {
    console.error(`Error finding item by name "${name}":`, error);
    return null;
  }

  return data as GameItem | null;
}

// Function to delete a custom item (Optional: for cleanup later)
export async function deleteGameItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('game_items')
    .delete()
    .eq('id', id)
    .eq('is_custom', true); // Safety check: only delete custom items

  if (error) throw new Error(error.message);
}