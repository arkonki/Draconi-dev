import { supabase } from '../supabase';
import { Character, InventoryItem, AttributeName } from '../../types/character'; // Import InventoryItem and AttributeName

// Helper function to map raw character data to Character type
export const mapCharacterData = (char: any): Character => {
  // Default attributes using uppercase keys consistent with Character type
  const defaultAttributes = { STR: 10, AGL: 10, INT: 10, CON: 10, WIL: 10, CHA: 10 };

  // Get attributes from DB or use an empty object
  const dbAttributes = char.attributes || {};

  // Explicitly map potential lowercase keys from DB to uppercase keys, using defaults if necessary
  const attributes = {
    STR: dbAttributes.strength ?? dbAttributes.STR ?? defaultAttributes.STR,
    AGL: dbAttributes.agility ?? dbAttributes.AGL ?? defaultAttributes.AGL,
    INT: dbAttributes.intelligence ?? dbAttributes.INT ?? defaultAttributes.INT,
    CHA: dbAttributes.charisma ?? dbAttributes.CHA ?? defaultAttributes.CHA,
    CON: dbAttributes.constitution ?? dbAttributes.CON ?? defaultAttributes.CON,
    WIL: dbAttributes.willpower ?? dbAttributes.WIL ?? defaultAttributes.WIL,
  };

  const max_hp = attributes.CON; // Max HP derived from CON
  const max_wp = attributes.WIL;   // Max WP derived from WIL

  const equipmentData = char.equipment || {};
  const inventory: InventoryItem[] = equipmentData.inventory || [];
  const equipped = equipmentData.equipped || { weapons: [] };
  const money = equipmentData.money || { gold: 0, silver: 0, copper: 0 };

  let teacherData = char.teacher;
  if (typeof teacherData !== 'object' || teacherData === null) {
      teacherData = null;
  } else if (teacherData.skillUnderStudy === undefined) {
      teacherData = { ...teacherData, skillUnderStudy: null };
  }

  return {
    id: char.id,
    user_id: char.user_id,
    name: char.name,
    kin: char.kin,
    profession: char.profession,
    magicSchool: char.magic_school, // Kept from original, though not in Character type from character.ts
    age: char.age,
    attributes: attributes,
    
    // Standardized health and willpower fields to match DB and desired Character type
    max_hp: max_hp,
    current_hp: char.current_hp ?? max_hp, // Default current_hp to max_hp if null/undefined
    max_wp: max_wp,
    current_wp: char.current_wp ?? max_wp,   // Default current_wp to max_wp if null/undefined
    // temporary_hp is optional in Character type, map if present in char, e.g. char.temporary_hp

    movement: char.movement ?? 10, // Kept from original (Character type has `speed`)
    damage_bonus: char.damage_bonus ?? 0, // Kept from original, not in Character type
    conditions: char.conditions || { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false },
    equipment: {
        inventory: inventory,
        equipped: equipped,
        money: money,
    },
    trainedSkills: char.trained_skills || [], // Kept from original (Character type has `skill_levels`)
    untrainedSkills: char.other_skills || [], // Kept from original (Character type has `skill_levels`)
    heroic_ability: char.heroic_ability || [],
    spells: char.spells || { school: null, general: [] },
    prepared_spells: char.prepared_spells || [],
    experience: char.experience ?? 0,
    reputation: char.reputation ?? 0,
    corruption: char.corruption ?? 0,
    notes: char.notes ?? '',
    created_at: char.created_at,
    updated_at: char.updated_at,
    party_id: char.party_id,
    is_npc: char.is_npc ?? false, // Kept from original, not in Character type
    key_attribute: char.key_attribute as AttributeName | null, // Kept from original, not in Character type
    death_rolls_failed: char.death_rolls_failed ?? 0,
    death_rolls_passed: char.death_rolls_passed ?? 0,
    appearance: char.appearance ?? '',
    skill_levels: char.skill_levels || {},
    teacher: teacherData,
  } as Character; // Using 'as Character' to bridge potential discrepancies for unmapped/extra fields.
};


export async function fetchCharacters(userId: string | undefined): Promise<Character[]> {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('characters')
    .select(`
      *
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching characters:', error);
    throw new Error(error.message || 'Failed to fetch characters');
  }

  const characters: Character[] = (data || []).map(mapCharacterData);
  return characters;
}

export async function fetchCharacterById(id: string | undefined, userId: string | undefined): Promise<Character | null> {
  if (!id) {
    return null;
  }

  const query = supabase
    .from('characters')
    .select(`
      *
    `)
    .eq('id', id);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error fetching character by ID:', error);
    if (error.code !== 'PGRST116') { 
      throw new Error(error.message || 'Failed to fetch character');
    }
  }

  if (!data) {
    return null;
  }

  const safeCharacter: Character = mapCharacterData(data);
  return safeCharacter;
}

export async function updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character | null> {
  const dbUpdates: { [key: string]: any } = {};

  // Mapping for keys that differ between frontend Character model and DB columns
  const frontendToDbKeyMappings: Record<string, string> = {
    untrainedSkills: 'other_skills', 
    trainedSkills: 'trained_skills', 
  };

  for (const key in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const value = (updates as any)[key as keyof Character];
      
      const dbKey = frontendToDbKeyMappings[key] || key;
      dbUpdates[dbKey] = value;
    }
  }

  dbUpdates['updated_at'] = new Date().toISOString();

  const { data, error } = await supabase
    .from('characters')
    .update(dbUpdates)
    .eq('id', characterId)
    .select(`
      *
    `)
    .single();

  if (error) {
    console.error('Error updating character:', error);
    if (error.code === 'PGRST116') {
        console.error(`Update failed: Character ${characterId} not found or RLS prevented access.`);
         throw new Error(`Character ${characterId} not found or update permission denied.`);
    }
    throw new Error(error.message || 'Failed to update character');
  }

  if (!data) {
     console.error(`Update seemed successful but no data returned for character ${characterId}.`);
     return null;
  }

  return mapCharacterData(data);
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
