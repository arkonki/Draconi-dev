// src/lib/api/characters.ts

import { supabase } from '../supabase';
import { Character } from '../../types/character';

// We select everything, plus join the magic school details
const CHARACTER_SELECT_QUERY = `*, magic_school:magic_schools!left(*)`;

export const mapCharacterData = (char: any): Character => {
  const defaultAttributes = { STR: 10, AGL: 10, INT: 10, CON: 10, WIL: 10, CHA: 10 };
  const dbAttributes = char.attributes || {};
  
  // Merge DB attributes with defaults to ensure no NaN errors
  const attributes = {
    STR: dbAttributes.STR ?? defaultAttributes.STR,
    AGL: dbAttributes.AGL ?? defaultAttributes.AGL,
    INT: dbAttributes.INT ?? defaultAttributes.INT,
    CHA: dbAttributes.CHA ?? defaultAttributes.CHA,
    CON: dbAttributes.CON ?? defaultAttributes.CON,
    WIL: dbAttributes.WIL ?? defaultAttributes.WIL,
  };

  // Logic: Trust DB max_hp/wp first. Fallback to attribute if null.
  const max_hp = char.max_hp ?? attributes.CON;
  const max_wp = char.max_wp ?? attributes.WIL;

  // Safely parse skill levels if they come as a JSON string (rare legacy case)
  let skillLevelsData: Record<string, number> = {};
  if (typeof char.skill_levels === 'string') {
    try {
      skillLevelsData = JSON.parse(char.skill_levels);
    } catch (e) { console.error("Error parsing skill_levels", e); }
  } else if (typeof char.skill_levels === 'object' && char.skill_levels !== null) {
    skillLevelsData = char.skill_levels;
  }

  const equipmentData = char.equipment || {};

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
    magicSchool: char.magic_school || null,
    memento: char.memento || '',
    
    // DB Column is 'weak_spot', App uses 'flaw'
    flaw: char.weak_spot || '', 
    
    attributes: attributes,
    max_hp: max_hp,
    current_hp: char.current_hp ?? max_hp,
    max_wp: max_wp,
    current_wp: char.current_wp ?? max_wp,
    
    skill_levels: skillLevelsData,
    
    // Ensure arrays are initialized
    trainedSkills: char.trained_skills || [],
    marked_skills: char.marked_skills || [], 
    
    spells: char.spells || { known: [] },
    
    // DB Column is 'heroic_ability', App uses 'heroic_abilities'
    heroic_abilities: char.heroic_ability || [], 
    
    equipment: {
        inventory: equipmentData.inventory || [],
        equipped: equipmentData.equipped || { weapons: [] },
        money: equipmentData.money || { gold: 0, silver: 0, copper: 0 },
    },

    // --- FIX ADDED HERE ---
    // Ensure item_notes are loaded from DB, or default to empty object
    item_notes: char.item_notes || {}, 
    // ----------------------
    
    conditions: char.conditions || { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false },
    is_rallied: char.is_rallied ?? false,
    death_rolls_passed: char.death_rolls_passed ?? 0,
    death_rolls_failed: char.death_rolls_failed ?? 0,
    experience: char.experience ?? 0,
    teacher: char.teacher || null,
    reputation: char.reputation ?? 0,
    corruption: char.corruption ?? 0,
    created_at: char.created_at,
    updated_at: char.updated_at,
    party_id: char.party_id,
    party_info: char.party_info,
  };
  
  return character;
};

export async function fetchCharacters(userId: string | undefined): Promise<Character[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('characters')
    .select(CHARACTER_SELECT_QUERY)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch characters');
  return (data || []).map(mapCharacterData);
}

export async function fetchCharacterById(id: string, userId: string): Promise<Character | null> {
  if (!id || !userId) {
    console.warn("fetchCharacterById requires both character ID and user ID.");
    return null;
  }

  try {
    // Attempt to use RPC for detail + party info
    const { data, error } = await supabase.rpc('get_character_details_with_party', {
      p_character_id: id,
      p_user_id: userId,
    });

    if (error) {
      console.error('Error fetching character via RPC:', error);
      // Fallback to standard select if RPC fails or doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('characters')
        .select(CHARACTER_SELECT_QUERY)
        .eq('id', id)
        .eq('user_id', userId)
        .single();
        
      if (fallbackError) throw fallbackError;
      return fallbackData ? mapCharacterData(fallbackData) : null;
    }
    
    return data ? mapCharacterData(data) : null;
  } catch (err) {
    console.error("Unexpected error in fetchCharacterById:", err);
    return null;
  }
}

export async function updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character | null> {
  // Create a copy to manipulate keys without affecting the UI object passed in
  const dbUpdates: Record<string, any> = { ...updates };

  // --- MAPPING APP KEYS TO DB COLUMNS ---
  
  // Map 'heroic_abilities' -> 'heroic_ability'
  if ('heroic_abilities' in dbUpdates) {
    dbUpdates.heroic_ability = dbUpdates.heroic_abilities;
    delete dbUpdates.heroic_abilities;
  }
  
  // Map 'trainedSkills' -> 'trained_skills'
  if ('trainedSkills' in dbUpdates) {
    dbUpdates.trained_skills = dbUpdates.trainedSkills;
    delete dbUpdates.trainedSkills;
  }
  
  // Map 'magicSchool' -> 'magic_school'
  if ('magicSchool' in dbUpdates) {
    // If it's an object with an ID (from a selection), use the ID. 
    // If it's just the ID string, use it.
    if (typeof dbUpdates.magicSchool === 'object' && dbUpdates.magicSchool !== null && 'id' in dbUpdates.magicSchool) {
        dbUpdates.magic_school = dbUpdates.magicSchool.id;
    } else {
        dbUpdates.magic_school = dbUpdates.magicSchool;
    }
    delete dbUpdates.magicSchool;
  }

  // Map 'flaw' -> 'weak_spot'
  if ('flaw' in dbUpdates) {
    dbUpdates.weak_spot = dbUpdates.flaw;
    delete dbUpdates.flaw;
  }

  // Note: 'item_notes' does not need manual mapping because the app key 'item_notes' 
  // matches the DB column 'item_notes' exactly.

  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('characters')
    .update(dbUpdates)
    .eq('id', characterId)
    .select(CHARACTER_SELECT_QUERY)
    .single();

  if (error) throw new Error(error.message || 'Failed to update character');
  
  return data ? mapCharacterData(data) : null;
}

export async function deleteCharacters(characterIds: string[]): Promise<void> {
  if (characterIds.length === 0) return;
  const { error } = await supabase
    .from('characters')
    .delete()
    .in('id', characterIds);
  if (error) throw new Error(error.message || 'Failed to delete characters');
}
