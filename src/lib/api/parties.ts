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
  campaign_role: CampaignRole;
  members: Character[];
  campaign_memberships: CampaignMembership[];
}

export type CampaignRole = 'owner' | 'gm' | 'player' | 'observer';

export interface CampaignMembership {
  id: string;
  party_id: string;
  user_id: string;
  role: CampaignRole;
  users?: {
    id: string;
    username: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface PartyMemberJoinRow {
  characters?: unknown;
}

interface PartyRow {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  invite_code?: string;
  campaign_role?: CampaignRole;
  members?: PartyMemberJoinRow[];
  campaign_memberships?: CampaignMembership[];
}

export async function fetchParties(userId: string | undefined): Promise<Party[]> {
  if (!userId) {
    return [];
  }

  const query = supabase.from('parties').select(`
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

  const { data: partiesData, error: partiesError } = await query
    .order('created_at', { ascending: false });

  if (partiesError) {
    console.error('Error fetching parties:', partiesError);
    throw new Error(partiesError.message || 'Failed to fetch parties');
  }

  const parties: Party[] = ((partiesData || []) as unknown as PartyRow[]).map((party) => ({
    ...party,
    campaign_role: party.campaign_role || (party.created_by === userId ? 'owner' : 'player'),
    campaign_memberships: party.campaign_memberships || [],
    members: (party.members || [])
      .map((m) => m.characters ? mapCharacterData(m.characters) : null)
      .filter((char: Character | null | undefined): char is Character => !!char),
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
        portrait_url,
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

  const { data: partyData, error: partyError } = await supabase
    .from('parties')
    .select(selectQuery)
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
    ...(partyData as unknown as PartyRow),
    campaign_role: partyData.campaign_role as CampaignRole,
    campaign_memberships: (partyData.campaign_memberships || []) as CampaignMembership[],
    members: (partyData.members || [])
      .map((m: PartyMemberJoinRow) => m.characters ? mapCharacterData(m.characters) : null)
      .filter((char: Character | null): char is Character => !!char),
  };

  return party;
}

export async function updateCampaignMemberRole(
  partyId: string,
  userId: string,
  role: Exclude<CampaignRole, 'owner'>,
): Promise<void> {
  const { error } = await supabase
    .from('campaign_memberships')
    .update({ role })
    .match({ party_id: partyId, user_id: userId });

  if (error) {
    throw new Error(error.message || 'Failed to update campaign role');
  }
}

// REVERTED: Uses direct DB insert instead of RPC
export async function removePartyMember(partyId: string, characterId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_party_member', { p_party_id: partyId, p_character_id: characterId });
  if (error) throw new Error(error.message || 'Failed to remove party member');
}

/** Creates a campaign and adds the chosen characters in one step: either everything is saved or nothing is. */
export async function createParty(details: { name: string; description?: string; characterIds: string[] }): Promise<{ id: string; name: string }> {
  const name = details.name.trim();
  if (!name) throw new Error('Party name is required');
  const { data, error } = await supabase.rpc<{ id: string; name: string }>('create_campaign', {
    p_name: name,
    p_description: details.description ?? '',
    p_character_ids: details.characterIds,
  });
  if (error || !data) throw new Error(error?.message || 'Party creation failed');
  return data;
}

/** Hands the campaign to another member. The previous owner stays on as a GM. */
export async function transferCampaignOwnership(partyId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_campaign_ownership', { p_party_id: partyId, p_user_id: userId });
  if (error) throw new Error(error.message || 'Failed to hand over the campaign');
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

/** Changes the campaign's name and description. Only the campaign owner may do this. */
export async function updatePartyDetails(partyId: string, details: { name: string; description: string }): Promise<void> {
  const name = details.name.trim();
  if (!name) throw new Error('The campaign needs a name');
  const { error } = await supabase
    .from('parties')
    .update({ name, description: details.description.trim() })
    .eq('id', partyId);
  if (error) throw new Error(error.message || 'Failed to update the campaign');
}

/** Same shape as the database default: ten upper-case hexadecimal characters. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Replaces the invite code, which stops the old link from working. Returns the new code. */
export async function regenerateInviteCode(partyId: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inviteCode = generateInviteCode();
    const { error } = await supabase.from('parties').update({ invite_code: inviteCode }).eq('id', partyId);
    if (!error) return inviteCode;
    // 23505 is a collision with another campaign's code: try a fresh one.
    if (error.code !== '23505') throw new Error(error.message || 'Failed to create a new invite link');
  }
  throw new Error('Could not create a unique invite link. Please try again.');
}

/** Removes the signed-in user's characters and role from the campaign. The owner cannot leave. */
export async function leaveParty(partyId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_campaign', { p_party_id: partyId });
  if (error) throw new Error(error.message || 'Failed to leave the campaign');
}
