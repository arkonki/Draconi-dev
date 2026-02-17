// src/lib/api/characters.ts

import { supabase } from '../supabase';
import { Character } from '../../types/character';

// Select all columns, plus join party_members to find the party_id if the direct column is empty
const CHARACTER_SELECT_QUERY = `
  *,
  magic_school:magic_schools!left(*),
  party_members(party_id)
`;

interface CharacterPartyMemberRow {
  party_id: string | null;
}

interface CharacterRow {
  id: string;
  user_id: string;
  name?: string | null;
  kin?: string | null;
  profession?: string | null;
  age?: number | null;
  appearance?: string | null;
  background?: string | null;
  notes?: string | null;
  portrait_url?: string | null;
  magic_school?: Character['magicSchool'] | null;
  memento?: string | null;
  weak_spot?: string | null;
  attributes?: Partial<Character['attributes']> | null;
  max_hp?: number | null;
  current_hp?: number | null;
  max_wp?: number | null;
  current_wp?: number | null;
  skill_levels?: string | Record<string, number> | null;
  trained_skills?: string[] | null;
  marked_skills?: string[] | null;
  spells?: Character['spells'] | null;
  prepared_spells?: string[] | null;
  heroic_ability?: string[] | null;
  equipment?: Partial<Character['equipment']> | null;
  item_notes?: Character['item_notes'];
  conditions?: Character['conditions'] | null;
  is_rallied?: boolean | null;
  death_rolls_passed?: number | null;
  death_rolls_failed?: number | null;
  experience?: number | null;
  teacher?: Character['teacher'];
  reputation?: number | null;
  corruption?: number | null;
  created_at: string;
  updated_at: string;
  party_id?: string | null;
  party_info?: Character['party_info'];
  party_members?: CharacterPartyMemberRow[];
}

export const mapCharacterData = (char: unknown): Character => {
  const row = char as CharacterRow;
  const defaultAttributes = { STR: 10, AGL: 10, INT: 10, CON: 10, WIL: 10, CHA: 10 };
  const dbAttributes = row.attributes || {};

  const attributes = {
    STR: dbAttributes.STR ?? defaultAttributes.STR,
    AGL: dbAttributes.AGL ?? defaultAttributes.AGL,
    INT: dbAttributes.INT ?? defaultAttributes.INT,
    CHA: dbAttributes.CHA ?? defaultAttributes.CHA,
    CON: dbAttributes.CON ?? defaultAttributes.CON,
    WIL: dbAttributes.WIL ?? defaultAttributes.WIL,
  };

  const max_hp = row.max_hp ?? attributes.CON;
  const max_wp = row.max_wp ?? attributes.WIL;

  let skillLevelsData: Record<string, number> = {};
  if (typeof row.skill_levels === 'string') {
    try {
      skillLevelsData = JSON.parse(row.skill_levels) as Record<string, number>;
    } catch (e) { console.error("Error parsing skill_levels", e); }
  } else if (typeof row.skill_levels === 'object' && row.skill_levels !== null) {
    skillLevelsData = row.skill_levels as Record<string, number>;
  }

  const equipmentData = row.equipment || {};

  // --- PARTY ID LOGIC ---
  // Try direct column first, then fall back to the relationship table
  let derivedPartyId = row.party_id;
  if (!derivedPartyId && row.party_members && Array.isArray(row.party_members) && row.party_members.length > 0) {
    derivedPartyId = row.party_members[0].party_id;
  }
  // ----------------------

  const character: Character = {
    id: row.id,
    user_id: row.user_id,
    name: row.name || 'Unnamed Character',
    kin: row.kin || 'Unknown',
    profession: row.profession || 'Unknown',
    age: row.age ?? undefined,
    appearance: row.appearance || '',
    background: row.background || '',
    notes: row.notes || '',
    portrait_url: row.portrait_url ?? undefined,
    magicSchool: row.magic_school || null,
    memento: row.memento || '',
    flaw: row.weak_spot || '',
    attributes: attributes,
    max_hp: max_hp,
    current_hp: row.current_hp ?? max_hp,
    max_wp: max_wp,
    current_wp: row.current_wp ?? max_wp,
    skill_levels: skillLevelsData,
    trainedSkills: row.trained_skills || [],
    marked_skills: row.marked_skills || [],
    spells: row.spells || { school: { name: null, spells: [] }, general: [] },
    prepared_spells: row.prepared_spells || [],
    heroic_abilities: row.heroic_ability || [],
    equipment: {
      inventory: equipmentData.inventory || [],
      equipped: equipmentData.equipped || { weapons: [] },
      money: equipmentData.money || { gold: 0, silver: 0, copper: 0 },
    },
    item_notes: row.item_notes || {},
    conditions: row.conditions || { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false },
    is_rallied: row.is_rallied ?? false,
    death_rolls_passed: row.death_rolls_passed ?? 0,
    death_rolls_failed: row.death_rolls_failed ?? 0,
    experience: row.experience ?? 0,
    teacher: row.teacher || null,
    reputation: row.reputation ?? 0,
    corruption: row.corruption ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,

    party_id: derivedPartyId,
    party_info: row.party_info,
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
  void userId;
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
  const dbUpdates: Record<string, unknown> = { ...updates };

  if ('heroic_abilities' in dbUpdates) {
    dbUpdates.heroic_ability = dbUpdates.heroic_abilities;
    delete dbUpdates.heroic_abilities;
  }

  if ('trainedSkills' in dbUpdates) {
    dbUpdates.trained_skills = dbUpdates.trainedSkills;
    delete dbUpdates.trainedSkills;
  }

  if ('magicSchool' in dbUpdates) {
    const magicSchool = dbUpdates.magicSchool;
    if (typeof magicSchool === 'object' && magicSchool !== null && 'id' in magicSchool) {
      dbUpdates.magic_school = (magicSchool as { id?: unknown }).id;
    } else {
      dbUpdates.magic_school = magicSchool;
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
