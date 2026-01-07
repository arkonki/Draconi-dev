import { supabase } from '../supabase';
import type { Encounter, EncounterCombatant } from '../../types/encounter';

// --- FETCH (GET) OPERATIONS ---

export async function fetchAllEncountersForParty(partyId: string): Promise<Encounter[]> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchEncounterDetails(encounterId: string): Promise<Encounter | null> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('id', encounterId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchEncounterCombatants(encounterId: string): Promise<EncounterCombatant[]> {
  const { data, error } = await supabase
    .from('encounter_combatants')
    .select('*') 
    .eq('encounter_id', encounterId)
    // Primary Sort: Initiative (1 is best, null is worst)
    .order('initiative_roll', { ascending: true, nullsLast: true }) 
    // Secondary Sort: Name (for ties)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('Error fetching encounter combatants:', error);
    throw error;
  }
  return data || [];
}

export async function fetchLatestEncounterForParty(partyId: string): Promise<Encounter | null> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  // Ignore "No Rows Found" error (PGRST116)
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function fetchActiveEncounterForParty(partyId: string): Promise<Encounter | null> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('party_id', partyId)
    .eq('status', 'active') // Only finds running battles
    .maybeSingle(); 
  
  if (error) {
    console.error("Error fetching active encounter:", error);
    return null;
  }
  return data;
}

// --- CREATE (POST) OPERATIONS ---

export async function createEncounter(partyId: string, name: string, description?: string): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .insert({ party_id: partyId, name, description, status: 'planning', log: [] })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function duplicateEncounter(encounterId: string, newName: string): Promise<Encounter> {
  // Requires SQL Function: duplicate_encounter_with_combatants
  const { data, error } = await supabase.rpc('duplicate_encounter_with_combatants', {
    p_encounter_id: encounterId,
    p_new_name: newName
  });
  if (error) throw error;
  return data;
}

// --- RPC FUNCTIONS FOR ADDING COMBATANTS ---

export async function addCharacterToEncounter(params: {
  encounterId: string;
  characterId: string;
  initiativeRoll: number | null;
}) {
  const { data, error } = await supabase.rpc('add_character_to_encounter', {
    p_encounter_id: params.encounterId,
    p_character_id: params.characterId,
    p_initiative_roll: params.initiativeRoll,
  });
  if (error) throw error;
  return data;
}

export async function addMonsterToEncounter(params: {
  encounterId: string;
  monsterId: string;
  customName: string;
  initiativeRoll: number | null;
}) {
  const { data, error } = await supabase.rpc('add_monster_to_encounter', {
    p_encounter_id: params.encounterId,
    p_monster_id: params.monsterId,
    p_custom_name: params.customName,
    p_initiative_roll: params.initiativeRoll,
  });
  if (error) throw error;
  return data;
}

// --- UPDATE (PATCH) OPERATIONS ---

export async function updateEncounter(id: string, updates: Partial<Encounter>): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle(); 

  if (error) throw error;
  if (!data) throw new Error('Encounter not found or permission denied');
  return data;
}

export async function updateCombatant(id: string, updates: Partial<EncounterCombatant>): Promise<EncounterCombatant> {
  const { data, error } = await supabase
    .from('encounter_combatants')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle(); 

  if (error) throw error;
  if (!data) throw new Error('Combatant not found or permission denied');
  return data;
}

// --- LOGGING ---

export async function appendEncounterLog(encounterId: string, entry: any): Promise<void> {
  // Fallback: If RPC fails, we could fetch->update JSON manually.
  // Requires SQL Function: append_to_log
  const { error } = await supabase.rpc('append_to_log', {
    p_encounter_id: encounterId,
    p_log_entry: entry,
  });
  if (error) {
    console.error("Failed to append log:", error);
  }
}

// --- ENCOUNTER FLOW OPERATIONS ---

export const startEncounter = (id: string) => updateEncounter(id, { status: 'active', current_round: 1 });
export const endEncounter = (id: string) => updateEncounter(id, { status: 'completed' });

export const nextRound = async (id: string) => {
  // Requires SQL Function: advance_encounter_round
  // This must reset 'has_acted' to false and increment 'current_round'
  const { error } = await supabase.rpc('advance_encounter_round', {
    p_encounter_id: id
  });
  
  if (error) throw error;
};

// --- DELETE OPERATIONS ---

export async function deleteEncounter(id: string): Promise<void> {
  const { error } = await supabase.from('encounters').delete().eq('id', id);
  if (error) throw error; 
}

export async function removeCombatant(id: string): Promise<void> {
  const { error } = await supabase.from('encounter_combatants').delete().eq('id', id);
  if (error) throw error;
}

// --- COMPLEX ACTIONS ---

export async function rollInitiativeForCombatants(encounterId: string, combatantIds: string[]): Promise<any> {
  const { data, error } = await supabase.rpc('roll_initiative_for_combatants', {
    p_encounter_id: encounterId,
    p_combatant_ids: combatantIds
  });
  if (error) throw error;
  return data;
}

export async function swapInitiative(combatantId1: string, combatantId2: string): Promise<any> {
  const { data, error } = await supabase.rpc('swap_combatant_initiative', {
    p_combatant_id_1: combatantId1,
    p_combatant_id_2: combatantId2
  });
  if (error) throw error;
  return data;
}
