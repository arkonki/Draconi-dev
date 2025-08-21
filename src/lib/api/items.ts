import { supabase } from '../supabase';

// Define the Item type based on the 'game_items' table structure
// Adjust properties based on your actual table columns
export interface GameItem {
  id: string; // Assuming UUID primary key
  name: string;
  category: string; // e.g., 'ARMOR & HELMETS', 'MELEE WEAPONS', etc.
  cost: string; // e.g., "2 gold", "5 silver, 10 copper"
  supply: string; // e.g., 'Common', 'Uncommon', 'Rare'
  weight: number;
  effect?: string; // Description or effect
  armor_rating?: number;
  grip?: string; // '1H', '2H'
  strength_requirement?: number;
  range?: string | number; // Can be number or text like 'STR'
  damage?: string; // e.g., 'D6', '2D8'
  durability?: number | string; // Can be number or text like 'N/A'
  features?: string[]; // Assuming text[] in Supabase
  created_at?: string;
}

// Function to fetch all game items
export async function fetchItems(category?: string): Promise<GameItem[]> {
  let query = supabase.from('game_items').select('*');

  if (category && category !== 'all' && typeof category === 'string') { // Check type
    query = query.eq('category', category.toUpperCase()); // Match category if provided
  }

  const { data, error } = await query.order('category').order('name');

  if (error) {
    console.error('Error fetching game items:', error);
    throw new Error(error.message || 'Failed to fetch game items');
  }

  return (data as GameItem[]) || [];
}

// Function to find a specific item by name (useful for replacing findEquipment)
// Consider adding caching or fetching by ID if performance becomes an issue
export async function findItemByName(name: string): Promise<GameItem | null> {
   if (!name || typeof name !== 'string') return null; // Check type

   const { data, error } = await supabase
    .from('game_items')
    .select('*')
    .eq('name', name)
    .maybeSingle(); // Use maybeSingle to return null if not found

  if (error) {
    console.error(`Error finding item by name "${name}":`, error);
    // Don't throw an error if not found, just return null
    if (error.code === 'PGRST116') {
        return null;
    }
    throw new Error(error.message || `Failed to find item: ${name}`);
  }

  return data as GameItem | null;
}

// Add functions for creating, updating, deleting items later if needed for admin panel
