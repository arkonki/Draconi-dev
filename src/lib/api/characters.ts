// src/lib/api/characters.ts

import { supabase } from '../supabase';
import { Character, InventoryItem, AttributeName } from '../../types/character';

// Helper function to map raw character data to the strict Character type
export const mapCharacterData = (char: any): Character => {
  // Establish default attributes to prevent errors if the DB field is null
  const defaultAttributes = { STR: 10, AGL: 10, INT: 10, CON: 10, WIL: 10, CHA: 10 };
  const dbAttributes = char.attributes || {};
  const attributes = {
    STR: dbAttributes.STR ?? defaultAttributes.STR,
    AGL: dbAttributes.AGL ?? defaultAttributes.AGL,
    INT: dbAttributes.INT ?? defaultAttributes.INT,
    CHA: dbAttributes.CHA ?? defaultAttributes.CHA,
    CON: dbAttributes.CON ?? defaultAttributes.CON,
    WIL: dbAttributes.WIL ?? defaultAttributes.WIL,
  };

  const max_hp = attributes.CON;
  const max_wp = attributes.WIL;

  // Ensure equipment is always a valid object
  const equipmentData = char.equipment || {};

  // Construct a valid Character object, strictly adhering to the interface
  const character: Character = {
    id: char.id,
    user_id: char.user_id,
    name: char.name || 'Unnamed Character',
    kin: char.kin || 'Unknown',
    profession: char.profession || 'Unknown',
    age: char.age,
    appearance: char.appearance || '',
    background: char.background || '',
    notes: char.notes || '',
    portrait_url: char.portrait_url,
    
    // FIX: Map the correct memento and flaw fields from the database
    memento: char.memento || '',
    flaw: char.weak_spot || '',

    attributes: attributes,
    max_hp: max_hp,
    current_hp: char.current_hp ?? max_hp,
    max_wp: max_wp,
    current_wp: char.current_wp ?? max_wp,
    
    // FIX: Only include skill_levels as defined in the Character type
    skill_levels: char.skill_levels || {},
    
    spells: char.spells || { known: [] },
    heroic_abilities: char.heroic_ability || [], // Note: DB is singular, frontend is plural
    
    equipment: {
        inventory: equipmentData.inventory || [],
        equipped: equipmentData.equipped || { weapons: [] },
        money: equipmentData.money || { gold: 0, silver: 0, copper: 0 },
    },
    conditions: char.conditions || { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false },
    is_rallied: char.is_rallied ?? false,
    death_rolls_failed: char.death_rolls_failed ?? 0,
    
    experience: char.experience ?? 0,
    teacher: char.teacher || null,
    reputation: char.reputation ?? 0,

    created_at: char.created_at,
    updated_at: char.updated_at,
    party_id: char.party_id,
    party_info: char.party_info, // Assuming RLS and select allows this
  };
  
  // No 'as Character' needed because we constructed a valid object
  return character;
};

export async function fetchCharacters(userId: string | undefined): Promise<Character[]> {
  if (!userId) return [];

  // Using '*' is fine here as mapCharacterData will sanitize the output
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching characters:', error);
    throw new Error(error.message || 'Failed to fetch characters');
  }

  return (data || []).map(mapCharacterData);
}

export async function fetchCharacterById(id: string | undefined, userId: string | undefined): Promise<Character | null> {
  if (!id || !userId) return null;

  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId) // Important for security (RLS)
    .single(); // Use single() as we expect one character

  if (error) {
    // It's normal for single() to error if no rows are found, so we handle that case.
    if (error.code === 'PGRST116') {
      console.warn(`Character with ID ${id} not found.`);
      return null;
    }
    console.error('Error fetching character by ID:', error);
    throw new Error(error.message || 'Failed to fetch character');
  }

  return data ? mapCharacterData(data) : null;
}

// FIX: Radically simplified and corrected update logic
export async function updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character | null> {
  // The `updates` object is already a Partial<Character>, so its keys
  // should align with the database columns. No complex mapping needed.
  
  // The only exception might be pluralization, like heroic_abilities
  const dbUpdates: Record<string, any> = { ...updates };
  if (dbUpdates.heroic_abilities) {
    dbUpdates.heroic_ability = dbUpdates.heroic_abilities;
    delete dbUpdates.heroic_abilities;
  }

  // Always set the updated_at timestamp
  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('characters')
    .update(dbUpdates)
    .eq('id', characterId)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating character:', error);
    throw new Error(error.message || 'Failed to update character');
  }

  return data ? mapCharacterData(data) : null;
}

export async function deleteCharacters(characterIds: string[]): Promise<void> {
  if (characterIds.length === 0) return;
  
  const { error } = await supabase
    .from('characters')
    .delete()
    .in('id', characterIds);

  if (error) {
    console.error('Error deleting characters:', error);
    throw new Error(error.message || 'Failed to delete characters');
  }
}