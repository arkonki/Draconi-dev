import { supabase } from '../supabase'; // Adjust path if needed (e.g. '../../lib/supabase')
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
    // Dragonbane: Low initiative (1) goes first. Nulls (not drawn) go last.
    .order('initiative_roll', { ascending: true, nullsLast: true }) 
    .order('display_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

// --- MISSING FUNCTION RESTORED HERE ---
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
  const { data, error } = await supabase.rpc('duplicate_encounter_with_combatants', {
    p_encounter_id: encounterId,
    p_new_name: newName
  });
  if (error) throw error;
  return data;
}

// --- RPC ADDITIONS ---

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
  if (!data) throw new Error(`Encounter update failed: Item ${id} not found.`);
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
  if (!data) throw new Error(`Combatant update failed: Item ${id} not found.`);
  return data;
}

// --- LOGGING ---

export async function appendEncounterLog(encounterId: string, entry: any): Promise<void> {
  const { error } = await supabase.rpc('append_to_log', {
    p_encounter_id: encounterId,
    p_log_entry: entry,
  });
  if (error) console.error("Failed to append log:", error);
}

// --- FLOW OPERATIONS ---

export const startEncounter = (id: string) => updateEncounter(id, { status: 'active', current_round: 1 });
export const endEncounter = (id: string) => updateEncounter(id, { status: 'completed' });

export const nextRound = async (id: string) => {
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

export async function swapInitiative(combatantId1: string, combatantId2: string): Promise<any> {
  const { data, error } = await supabase.rpc('swap_combatant_initiative', {
    p_combatant_id_1: combatantId1,
    p_combatant_id_2: combatantId2
  });
  if (error) throw error;
  return data;
}

export async function rollInitiativeForCombatants(encounterId: string, combatantIds: string[]): Promise<any> {
  const { data, error } = await supabase.rpc('roll_initiative_for_combatants', {
    p_encounter_id: encounterId,
    p_combatant_ids: combatantIds
  });
  if (error) throw error;
  return data;
}