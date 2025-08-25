// src/lib/api/characters.ts

import { supabase } from '../supabase';
import { Character } from '../../types/character';

const CHARACTER_SELECT_QUERY = `*, magic_school:magic_schools!left(*)`;

// Helper function to map raw character data to the strict Character type
export const mapCharacterData = (char: any): Character => {
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

  let skillLevelsData: Record<string, number> = {};
  if (typeof char.skill_levels === 'string') {
    try {
      skillLevelsData = JSON.parse(char.skill_levels);
    } catch (e) { }
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
    flaw: char.weak_spot || '',
    attributes: attributes,
    max_hp: max_hp,
    current_hp: char.current_hp ?? max_hp,
    max_wp: max_wp,
    current_wp: char.current_wp ?? max_wp,
    skill_levels: skillLevelsData,
    trainedSkills: char.trained_skills || [],
    spells: char.spells || { known: [] },
    heroic_abilities: char.heroic_ability || [],
    equipment: {
        inventory: equipmentData.inventory || [],
        equipped: equipmentData.equipped || { weapons: [] },
        money: equipmentData.money || { gold: 0, silver: 0, copper: 0 },
    },
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

export async function fetchCharacterById(id: string | undefined): Promise<Character | null> {
  // The userId is no longer needed for this query, as RLS will handle security.
  if (!id) return null;

  // --- FIX: Removed the .eq('user_id', userId) check ---
  // The application should just ask for the character. RLS will decide if the user has permission.
  const { data, error } = await supabase
    .from('characters')
    .select(CHARACTER_SELECT_QUERY)
    .eq('id', id)
    .single();
  // --- End of Fix ---

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message || 'Failed to fetch character');
  }

  return data ? mapCharacterData(data) : null;
}

export async function updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character | null> {
  // ... (rest of the file is unchanged)
  const dbUpdates: Record<string, any> = { ...updates };
  if (dbUpdates.heroic_abilities) {
    dbUpdates.heroic_ability = dbUpdates.heroic_abilities;
    delete dbUpdates.heroic_abilities;
  }
  if (dbUpdates.trainedSkills) {
    dbUpdates.trained_skills = dbUpdates.trainedSkills;
    delete dbUpdates.trainedSkills;
  }
  if (dbUpdates.magicSchool) {
    dbUpdates.magic_school = dbUpdates.magicSchool;
    delete dbUpdates.magicSchool;
  }
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