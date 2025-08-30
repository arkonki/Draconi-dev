// src/lib/api/parties.ts

import { supabase } from '../supabase';
import { Character } from '../../types/character';
import { mapCharacterData } from './characters';

export interface Party {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  invite_code?: string;
  members: Character[];
}

export async function fetchParties(userId: string | undefined, isDM: boolean): Promise<Party[]> {
  if (!userId) {
    return [];
  }

  let query = supabase.from('parties').select(`
    id,
    name,
    description,
    created_by,
    created_at,
    members:party_members!left (
      characters!inner (
        *
      )
    )
  `);

  if (isDM) {
    query = query.eq('created_by', userId);
  } else {
    query = query.eq('members.characters.user_id', userId);
  }

  const { data: partiesData, error: partiesError } = await query
    .order('created_at', { ascending: false });

  if (partiesError) {
    console.error('Error fetching parties:', partiesError);
    throw new Error(partiesError.message || 'Failed to fetch parties');
  }

  const parties: Party[] = (partiesData || []).map((party: any) => ({
    ...party,
    members: (party.members || [])
      .map((m: any) => m.characters ? mapCharacterData(m.characters) : null)
      .filter((char): char is Character => !!char),
  }));

  return parties;
}

export async function fetchAvailableCharacters(userId: string | undefined): Promise<Character[]> {
  if (!userId) {
    return [];
  }

  const { data: memberCharIds, error: memberError } = await supabase
    .from('party_members')
    .select('character_id');

  if (memberError) {
    console.error('Error fetching party member IDs:', memberError);
    throw new Error(memberError.message || 'Failed to fetch member data');
  }

  const assignedCharacterIds = (memberCharIds || []).map(m => m.character_id);

  let query = supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId);

  if (assignedCharacterIds.length > 0) {
    query = query.not('id', 'in', `(${assignedCharacterIds.join(',')})`);
  }

  const { data: charactersData, error: charactersError } = await query;

  if (charactersError) {
    console.error('Error fetching available characters:', charactersError);
    throw new Error(charactersError.message || 'Failed to fetch available characters');
  }

  return (charactersData || []).map(mapCharacterData);
}

export async function fetchPartyById(partyId: string | undefined): Promise<Party | null> {
  if (!partyId) {
    return null;
  }

  // --- THIS IS THE FIX ---
  // We replace `characters(*)` with an explicit list of the columns we need.
  // This guarantees that `weak_spot` is always included in the data.
  const selectQuery = `
    id,
    name,
    description,
    created_by,
    created_at,
    invite_code,
    members:party_members (
      characters (
        id,
        user_id,
        name,
        kin,
        profession,
        attributes,
        max_hp,
        current_hp,
        max_wp,
        current_wp,
        skill_levels,
        spells,
        heroic_ability,
        equipment,
        conditions,
        weak_spot 
      )
    )
  `;
  // --- END OF FIX ---

  const { data: partyData, error: partyError } = await supabase
    .from('parties')
    .select(selectQuery) // Use the new, more specific query
    .eq('id', partyId)
    .single();

  if (partyError) {
    console.error('Error fetching party by ID:', partyError);
    if (partyError.code === 'PGRST116') {
      throw new Error('Party not found');
    }
    throw new Error(partyError.message || 'Failed to fetch party');
  }

  if (!partyData) {
    return null;
  }

  const party: Party = {
    ...partyData,
    members: (partyData.members || [])
      .map((m: any) => m.characters ? mapCharacterData(m.characters) : null)
      .filter((char): char is Character => !!char),
  };

  return party;
}

export async function addPartyMember(partyId: string, characterId: string): Promise<void> {
  const { error: insertError } = await supabase
    .from('party_members')
    .insert([{ party_id: partyId, character_id: characterId }]);

  if (insertError) {
    console.error('Error adding party member:', insertError);
    if (insertError.code === '23505') {
      console.warn('Character is already a member. Attempting to sync character record anyway.');
    } else {
      throw new Error(insertError.message || 'Failed to join party');
    }
  }

  const { error: updateError } = await supabase
    .from('characters')
    .update({ party_id: partyId })
    .eq('id', characterId);

  if (updateError) {
    console.error('Error updating character party link:', updateError);
    throw new Error(updateError.message || 'Failed to update character after joining party');
  }
}

export async function removePartyMember(partyId: string, characterId: string): Promise<void> {
  const { error: deleteError } = await supabase
    .from('party_members')
    .delete()
    .match({ party_id: partyId, character_id: characterId });

  if (deleteError) {
    console.error('Error removing party member:', deleteError);
    throw new Error(deleteError.message || 'Failed to remove party member');
  }

  const { error: updateError } = await supabase
    .from('characters')
    .update({ party_id: null })
    .eq('id', characterId);

  if (updateError) {
    console.error('Error clearing character party link:', updateError);
  }
}

export async function deleteParty(partyId: string): Promise<void> {
  const { error } = await supabase
    .from('parties')
    .delete()
    .eq('id', partyId);

  if (error) {
    console.error('Error deleting party:', error);
    throw new Error(error.message || 'Failed to delete party');
  }
}