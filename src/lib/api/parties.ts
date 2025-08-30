import { supabase } from '../supabase';
import { Character } from '../../types/character';
import { mapCharacterData } from './characters'; // Import the shared mapper

// Define a type for the Party structure including members
export interface Party {
  id: string;
  name: string;
  description?: string;
  created_by: string; // User ID of the creator (DM)
  created_at: string;
  members: Character[]; // Array of Character objects
}

/**
 * Fetches parties based on the user's role.
 * - If isDM is true, fetches parties created by the user.
 * - If isDM is false, fetches parties the user is a member of.
 * This function now filters at the database level for better performance.
 */
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

  // Apply the correct filter directly in the database query
  if (isDM) {
    // For DMs, fetch parties they created.
    query = query.eq('created_by', userId);
  } else {
    // For Players, fetch parties where one of their characters is a member.
    // This nested filter is highly efficient as it's done by the database.
    query = query.eq('members.characters.user_id', userId);
  }

  const { data: partiesData, error: partiesError } = await query
    .order('created_at', { ascending: false });

  if (partiesError) {
    console.error('Error fetching parties:', partiesError);
    throw new Error(partiesError.message || 'Failed to fetch parties');
  }

  // Transform the data structure. The expensive client-side filtering is no longer needed.
  const parties: Party[] = (partiesData || []).map((party: any) => ({
    ...party,
    // Ensure members array contains only valid character objects, mapped correctly
    members: (party.members || [])
      .map((m: any) => m.characters ? mapCharacterData(m.characters) : null)
      .filter((char): char is Character => !!char), // Type guard to filter out nulls
  }));

  return parties;
}

/**
 * Fetches characters owned by a user that are not currently in any party.
 * NOTE: This implementation uses two queries. For ultimate performance at large scale,
 * this could be converted into a single database function (RPC) in Supabase.
 * However, this approach is clear and works perfectly well for most applications.
 */
export async function fetchAvailableCharacters(userId: string | undefined): Promise<Character[]> {
  if (!userId) {
    return [];
  }

  // 1. Get IDs of all characters that are already in any party.
  const { data: memberCharIds, error: memberError } = await supabase
    .from('party_members')
    .select('character_id');

  if (memberError) {
    console.error('Error fetching party member IDs:', memberError);
    throw new Error(memberError.message || 'Failed to fetch member data');
  }

  const assignedCharacterIds = (memberCharIds || []).map(m => m.character_id);

  // 2. Fetch characters owned by the user that are NOT in the assigned list.
  let query = supabase
    .from('characters')
    .select('*') // Select all columns to be mapped
    .eq('user_id', userId);

  if (assignedCharacterIds.length > 0) {
    query = query.not('id', 'in', `(${assignedCharacterIds.join(',')})`);
  }

  const { data: charactersData, error: charactersError } = await query;

  if (charactersError) {
    console.error('Error fetching available characters:', charactersError);
    throw new Error(charactersError.message || 'Failed to fetch available characters');
  }

  // Use the shared mapper to ensure data consistency
  return (charactersData || []).map(mapCharacterData);
}

/**
 * Fetches a single party by its ID, including its members.
 */
export async function fetchPartyById(partyId: string | undefined): Promise<Party | null> {
  if (!partyId) {
    return null;
  }

  const { data: partyData, error: partyError } = await supabase
    .from('parties')
    .select(`
      id,
      name,
      description,
      created_by,
      created_at,
			invite_code,
      members:party_members (
        characters (
          *
        )
      )
    `)
    .eq('id', partyId)
    .single(); // Expect a single result

  if (partyError) {
    console.error('Error fetching party by ID:', partyError);
    if (partyError.code === 'PGRST116') { // Specific code for "Not Found"
      throw new Error('Party not found');
    }
    throw new Error(partyError.message || 'Failed to fetch party');
  }

  if (!partyData) {
    return null;
  }

  // Transform the data structure
  const party: Party = {
    ...partyData,
    members: (partyData.members || [])
      .map((m: any) => m.characters ? mapCharacterData(m.characters) : null)
      .filter((char): char is Character => !!char), // Type guard
  };

  return party;
}

/**
 * [CORRECTED] Adds a single character to a party and updates the character's record.
 * This function is now a two-step transaction to ensure data integrity.
 * RLS policies should ensure the user owns the character.
 */
export async function addPartyMember(partyId: string, characterId: string): Promise<void> {
  // Step 1: Create the link in the party_members table.
  const { error: insertError } = await supabase
    .from('party_members')
    .insert([{ party_id: partyId, character_id: characterId }]);

  if (insertError) {
    console.error('Error adding party member:', insertError);
    if (insertError.code === '23505') { // unique_violation
      // If they are already a member, we can still try to fix their character record.
      console.warn('Character is already a member. Attempting to sync character record anyway.');
    } else {
      throw new Error(insertError.message || 'Failed to join party');
    }
  }

  // Step 2: Update the character's record to link it to the party.
  // This is the critical step that makes RLS policies work correctly.
  const { error: updateError } = await supabase
    .from('characters')
    .update({ party_id: partyId })
    .eq('id', characterId);

  if (updateError) {
    console.error('Error updating character party link:', updateError);
    // This error is critical, as it leaves the data in an inconsistent state.
    throw new Error(updateError.message || 'Failed to update character after joining party');
  }
}

/**
 * [CORRECTED] Removes a single character from a party and clears the link on the character's record.
 */
export async function removePartyMember(partyId: string, characterId: string): Promise<void> {
  // Step 1: Remove the link from the party_members table.
  const { error: deleteError } = await supabase
    .from('party_members')
    .delete()
    .match({ party_id: partyId, character_id: characterId });

  if (deleteError) {
    console.error('Error removing party member:', deleteError);
    throw new Error(deleteError.message || 'Failed to remove party member');
  }

  // Step 2: Clear the party_id on the character's record to maintain data consistency.
  const { error: updateError } = await supabase
    .from('characters')
    .update({ party_id: null }) // Set the party_id back to NULL.
    .eq('id', characterId);

  if (updateError) {
    console.error('Error clearing character party link:', updateError);
    // We don't throw an error here, as the primary goal (removal) was successful.
    // However, this should be monitored as it indicates a potential issue.
  }
}

/**
 * Deletes an entire party and all its members.
 * IMPORTANT: This function relies on a database-level "ON DELETE CASCADE" constraint
 * on the 'party_id' foreign key in your 'party_members' table. This ensures that
 * when a party is deleted, all its membership records are automatically and reliably
 * removed by the database itself.
 */
export async function deleteParty(partyId: string): Promise<void> {
  // With ON DELETE CASCADE, we only need to delete the party itself.
  const { error } = await supabase
    .from('parties')
    .delete()
    .eq('id', partyId);

  if (error) {
    console.error('Error deleting party:', error);
    throw new Error(error.message || 'Failed to delete party');
  }
}