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
    .select('*, character:characters(user_id, current_hp, max_hp, current_wp, max_wp, heroic_ability, attributes, conditions, is_rallied, death_rolls_passed, death_rolls_failed, equipment, skill_levels, marked_skills)')
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

export async function appendEncounterLog(encounterId: string, entry: unknown): Promise<void> {
  const { error } = await supabase.rpc('append_to_log', {
    p_encounter_id: encounterId,
    p_log_entry: entry,
  });
  if (error) {
    console.error("Failed to append log:", error);
  }
}

// --- ENCOUNTER FLOW OPERATIONS ---

export async function startEncounter(id: string): Promise<Encounter> {
  const encounter = await updateEncounter(id, { status: 'active', current_round: 1 });

  try {
    await supabase.functions.invoke('send-encounter-push', {
      body: { encounterId: encounter.id },
    });
  } catch (pushError) {
    console.warn('Encounter push notification dispatch failed:', pushError);
  }

  return encounter;
}
export interface DamageEntry {
  combatant_id: string;
  /** Damage as rolled; negative heals. */
  damage: number;
  armor: number;
  ignore_armor?: boolean;
  parried?: boolean;
}

export interface DamageOutcome {
  target: string;
  targetIsPlayer: boolean;
  damage: number;
  absorbed: number;
  parried: boolean;
  hpBefore: number;
  hpAfter: number;
  defeated: boolean;
  dying: boolean;
  instantDeath: boolean;
  deathFailures: number | null;
}

/** Applies armor, parry and HP loss to every target in one step and writes the combat log. */
export async function applyEncounterDamage(params: {
  encounterId: string;
  attackerName: string;
  attackName?: string | null;
  entries: DamageEntry[];
}): Promise<DamageOutcome[]> {
  const { data, error } = await supabase.rpc<{ outcomes: DamageOutcome[] }>('apply_encounter_damage', {
    p_encounter_id: params.encounterId,
    p_attacker_name: params.attackerName,
    p_attack_name: params.attackName ?? null,
    p_entries: params.entries,
  });
  if (error || !data) throw new Error(error?.message || 'Failed to apply the damage');
  return data.outcomes;
}

/** Completes the encounter, writes the end marker to the log and optionally clears the players' conditions. */
export async function finishEncounter(id: string, clearConditions = false): Promise<{ rounds: number; clearedConditions: number }> {
  const { data, error } = await supabase.rpc<{ rounds: number; clearedConditions: number }>('finish_encounter', {
    p_encounter_id: id,
    p_clear_conditions: clearConditions,
  });
  if (error || !data) throw new Error(error?.message || 'Failed to end the encounter');
  return data;
}

export async function updateCharacterCombatState(characterId: string, updates: {
  conditions?: Record<string, boolean>;
  death_rolls_passed?: number;
  death_rolls_failed?: number;
  is_rallied?: boolean;
  marked_skills?: string[];
}): Promise<void> {
  const { error } = await supabase.from('characters').update(updates).eq('id', characterId);
  if (error) throw new Error(error.message || 'Failed to update the character');
}

/** Starts the next round: resets everyone's turn and writes the round marker to the log, all in one step. */
export const nextRound = async (id: string) => {
  const { data, error } = await supabase.rpc<{ round: number }>('advance_encounter_round', {
    p_encounter_id: id
  });

  if (error) throw error;
  return data?.round ?? null;
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

export async function rollInitiativeForCombatants(encounterId: string, combatantIds: string[]): Promise<unknown> {
  const { data, error } = await supabase.rpc('roll_initiative_for_combatants', {
    p_encounter_id: encounterId,
    p_combatant_ids: combatantIds
  });
  if (error) throw error;
  return data;
}

// --- UPDATED SWAP FUNCTION ---
export async function swapInitiative({ id1, id2 }: { id1: string; id2: string }) {
  const { error } = await supabase.rpc('swap_initiative', {
    id1,
    id2
  });

  if (error) {
    console.error("Swap failed", error);
    throw new Error('Failed to swap initiative');
  }
}
