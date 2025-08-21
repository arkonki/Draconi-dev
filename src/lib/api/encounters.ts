import { supabase } from '../supabase';
import type { Encounter, EncounterCombatant } from '../../types/encounter';
// Character and MonsterData types are not directly used in this file's function signatures
// but are relevant for understanding the data structure of combatants.
// import type { Character } from '../../types/character';
// import type { MonsterData } from '../../types/bestiary';

export async function fetchLatestEncounterForParty(partyId: string): Promise<Encounter | null> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching latest encounter:', error);
    throw error;
  }
  return data?.[0] || null;
}

export async function fetchEncounterDetails(encounterId: string): Promise<Encounter | null> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('id', encounterId)
    .single();

  if (error) {
    console.error('Error fetching encounter details:', error);
    throw error;
  }
  return data;
}

export async function fetchEncounterCombatants(encounterId: string): Promise<EncounterCombatant[]> {
  const { data, error } = await supabase
    .from('encounter_combatants')
    .select('*, characters(name, level), monsters(name)') // Include related data for display names
    .eq('encounter_id', encounterId)
    .order('initiative_roll', { ascending: false, nullsLast: true }) // Higher initiative first
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching encounter combatants:', error);
    throw error;
  }
  return (data || []).map(c => ({
    ...c,
    // Ensure display_name is populated if not already set, using fetched related data
    display_name: c.display_name || (c.character_id && c.characters ? `${c.characters.name} (Lvl ${c.characters.level || 'N/A'})` : (c.monster_id && c.monsters ? c.monsters.name : 'Unknown Combatant'))
  }));
}

export async function createEncounter(
  partyId: string,
  name: string,
  description?: string
): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .insert({
      party_id: partyId,
      name: name,
      description: description,
      status: 'planning', 
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating encounter:', error);
    throw error;
  }
  if (!data) {
    throw new Error('Encounter creation returned no data');
  }
  return data;
}

interface AddCharacterCombatantPayload {
  type: 'character';
  characterId: string;
  initiativeRoll?: number | null;
}

interface AddMonsterCombatantPayload {
  type: 'monster';
  monsterId: string;
  customName?: string;
  initiativeRoll?: number | null;
}

export type AddCombatantPayload = AddCharacterCombatantPayload | AddMonsterCombatantPayload;

export async function addCombatantToEncounter(
  encounterId: string,
  payload: AddCombatantPayload
): Promise<EncounterCombatant> {
  let combatantBaseData: Partial<EncounterCombatant> = {
    encounter_id: encounterId,
    initiative_roll: payload.initiativeRoll,
  };

  if (payload.type === 'character') {
    const { data: charData, error: charError } = await supabase
      .from('characters')
      .select('id, name, max_health, current_health, max_willpower, current_willpower, level')
      .eq('id', payload.characterId)
      .single();

    if (charError || !charData) {
      console.error('Error fetching character for combatant:', charError?.message);
      throw new Error(`Character (ID: ${payload.characterId}) not found or error fetching details.`);
    }
    
    const displayName = `${charData.name || 'Unnamed Character'}${charData.level ? ` (Lvl ${charData.level})` : ''}`;

    combatantBaseData = {
      ...combatantBaseData,
      character_id: charData.id,
      display_name: displayName,
      max_hp: charData.max_health ?? 10,
      current_hp: charData.current_health ?? charData.max_health ?? 10,
      max_wp: charData.max_willpower,
      current_wp: charData.current_willpower,
      is_player_character: true,
    };
  } else if (payload.type === 'monster') {
    const { data: monsterData, error: monsterError } = await supabase
      .from('monsters')
      .select('id, name, stats') 
      .eq('id', payload.monsterId)
      .single();

    if (monsterError || !monsterData) {
      console.error('Error fetching monster for combatant:', monsterError?.message);
      throw new Error(`Monster (ID: ${payload.monsterId}) not found or error fetching details.`);
    }
    
    const monsterHp = monsterData.stats?.HP ?? 10;

    combatantBaseData = {
      ...combatantBaseData,
      monster_id: monsterData.id,
      display_name: payload.customName || monsterData.name || 'Unnamed Monster',
      max_hp: monsterHp,
      current_hp: monsterHp,
      max_wp: null, 
      current_wp: null,
      is_player_character: false,
    };
  } else {
    console.error('Invalid combatant type specified in payload:', payload);
    throw new Error('Invalid combatant type specified.');
  }

  const { data: newCombatant, error: insertError } = await supabase
    .from('encounter_combatants')
    .insert(combatantBaseData)
    .select()
    .single();
  
  if (insertError) {
    console.error('Error inserting combatant into encounter:', insertError.message, 'Payload:', combatantBaseData);
    throw insertError;
  }
  if (!newCombatant) {
    throw new Error('Combatant creation returned no data from insert operation.');
  }
  return newCombatant;
}

export async function updateEncounter(
  encounterId: string,
  updates: Partial<Pick<Encounter, 'name' | 'description' | 'status' | 'current_round'>>
): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .update(updates)
    .eq('id', encounterId)
    .select()
    .single();

  if (error) {
    console.error('Error updating encounter:', error);
    throw error;
  }
  if (!data) {
    throw new Error('Encounter update returned no data');
  }
  return data;
}

export async function updateCombatant(
  combatantId: string,
  updates: Partial<Pick<EncounterCombatant, 'current_hp' | 'current_wp' | 'initiative_roll' | 'status_effects' | 'is_active_turn'>>
): Promise<EncounterCombatant> {
  const { data, error } = await supabase
    .from('encounter_combatants')
    .update(updates)
    .eq('id', combatantId)
    .select()
    .single();

  if (error) {
    console.error('Error updating combatant:', error);
    throw error;
  }
  if (!data) {
    throw new Error('Combatant update returned no data');
  }
  return data;
}

export async function removeCombatant(combatantId: string): Promise<void> {
  const { error } = await supabase
    .from('encounter_combatants')
    .delete()
    .eq('id', combatantId);

  if (error) {
    console.error('Error removing combatant:', error);
    throw error;
  }
}
