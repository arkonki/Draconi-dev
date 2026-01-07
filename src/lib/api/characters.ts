// src/lib/api/characters.ts

import { supabase } from '../supabase';
import { Character } from '../../types/character';

// Select all columns, plus join party_members to find the party_id if the direct column is empty
const CHARACTER_SELECT_QUERY = `
  *,
  magic_school:magic_schools!left(*),
  party_members(party_id)
`;

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

  const max_hp = char.max_hp ?? attributes.CON;
  const max_wp = char.max_wp ?? attributes.WIL;

  let skillLevelsData: Record<string, number> = {};
  if (typeof char.skill_levels === 'string') {
    try {
      skillLevelsData = JSON.parse(char.skill_levels);
    } catch (e) { console.error("Error parsing skill_levels", e); }
  } else if (typeof char.skill_levels === 'object' && char.skill_levels !== null) {
    skillLevelsData = char.skill_levels;
  }

  const equipmentData = char.equipment || {};

  // --- PARTY ID LOGIC ---
  // Try direct column first, then fall back to the relationship table
  let derivedPartyId = char.party_id; 
  if (!derivedPartyId && char.party_members && Array.isArray(char.party_members) && char.party_members.length > 0) {
    derivedPartyId = char.party_members[0].party_id;
  }
  // ----------------------

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
    marked_skills: char.marked_skills || [], 
    spells: char.spells || { known: [] },
    heroic_abilities: char.heroic_ability || [], 
    equipment: {
        inventory: equipmentData.inventory || [],
        equipped: equipmentData.equipped || { weapons: [] },
        money: equipmentData.money || { gold: 0, silver: 0, copper: 0 },
    },
    item_notes: char.item_notes || {}, 
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
    
    party_id: derivedPartyId,
    party_info: char.party_info,
  };
  
  return character;
};

// FETCH LIST (Only My Characters) - This Keeps user_id check
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

// FETCH SINGLE (Any Character I have permission to see)
export async function fetchCharacterById(id: string, userId: string): Promise<Character | null> {
  if (!id) {
    console.warn("fetchCharacterById requires character ID.");
    return null;
  }

  try {
    // FIX: Removed .eq('user_id', userId)
    // We rely on RLS policies to determine if the user can see this character.
    // (e.g. RLS says: "If in same party, allow SELECT")
    const { data, error } = await supabase
      .from('characters')
      .select(CHARACTER_SELECT_QUERY)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching character:', error);
      return null;
    }

    return data ? mapCharacterData(data) : null;
  } catch (err) {
    console.error("Unexpected error in fetchCharacterById:", err);
    return null;
  }
}

export async function updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character | null> {
  const dbUpdates: Record<string, any> = { ...updates };

  if ('heroic_abilities' in dbUpdates) {
    dbUpdates.heroic_ability = dbUpdates.heroic_abilities;
    delete dbUpdates.heroic_abilities;
  }
  
  if ('trainedSkills' in dbUpdates) {
    dbUpdates.trained_skills = dbUpdates.trainedSkills;
    delete dbUpdates.trainedSkills;
  }
  
  if ('magicSchool' in dbUpdates) {
    if (typeof dbUpdates.magicSchool === 'object' && dbUpdates.magicSchool !== null && 'id' in dbUpdates.magicSchool) {
        dbUpdates.magic_school = dbUpdates.magicSchool.id;
    } else {
        dbUpdates.magic_school = dbUpdates.magicSchool;
    }
    delete dbUpdates.magicSchool;
  }

  if ('flaw' in dbUpdates) {
    dbUpdates.weak_spot = dbUpdates.flaw;
    delete dbUpdates.flaw;
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
