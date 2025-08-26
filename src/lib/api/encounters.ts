import { supabase } from '../supabase';
import type { Encounter, EncounterCombatant } from '../../types/encounter';

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

export async function fetchAllEncountersForParty(partyId: string): Promise<Encounter[]> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all encounters:', error);
    throw error;
  }
  return data || [];
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
    .select('*, characters(name), monsters(name)')
    .eq('encounter_id', encounterId)
    .order('initiative_roll', { ascending: false, nullsLast: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching encounter combatants:', error);
    throw error;
  }
  return (data || []).map((c: any) => ({
    ...c,
    display_name:
      c.display_name ||
      (c.character_id && c.characters ? c.characters.name :
       c.monster_id && c.monsters ? c.monsters.name : 'Unknown Combatant'),
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
      name,
      description,
      status: 'planning',
      // ensure the column exists; if not, add via migration:
      // ALTER TABLE encounters ADD COLUMN log jsonb NOT NULL DEFAULT '[]'::jsonb;
      log: [], // initialize as empty JSON array
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
  return data as Encounter;
}

export async function deleteEncounter(encounterId: string): Promise<void> {
  const { error: combatantsError } = await supabase
    .from('encounter_combatants')
    .delete()
    .eq('encounter_id', encounterId);

  if (combatantsError) {
    console.error('Error deleting encounter combatants:', combatantsError);
    throw combatantsError;
  }

  const { error: encounterError } = await supabase
    .from('encounters')
    .delete()
    .eq('id', encounterId);

  if (encounterError) {
    console.error('Error deleting encounter:', encounterError);
    throw encounterError;
  }
}

export async function duplicateEncounter(
  encounterId: string,
  newName: string,
  newDescription?: string
): Promise<Encounter> {
  const originalEncounter = await fetchEncounterDetails(encounterId);
  if (!originalEncounter) throw new Error('Original encounter not found');

  const newEncounter = await createEncounter(
    originalEncounter.party_id,
    newName,
    newDescription || originalEncounter.description || undefined
  );

  const originalCombatants = await fetchEncounterCombatants(encounterId);

  if (originalCombatants.length > 0) {
    const combatantsToInsert = originalCombatants.map((c) => ({
      encounter_id: newEncounter.id,
      character_id: c.character_id,
      monster_id: c.monster_id,
      display_name: c.display_name,
      max_hp: c.max_hp,
      current_hp: c.max_hp, // Reset to full health
      max_wp: c.max_wp,
      current_wp: c.max_wp, // Reset to full willpower
      is_player_character: c.is_player_character,
      initiative_roll: null, // Reset initiative
      is_active_turn: false,
      status_effects: [],
    }));

    const { error: insertError } = await supabase
      .from('encounter_combatants')
      .insert(combatantsToInsert);

    if (insertError) {
      console.error('Error duplicating combatants:', insertError);
      throw insertError;
    }
  }

  return newEncounter;
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
  instanceCount?: number;
}

export type AddCombatantPayload = AddCharacterCombatantPayload | AddMonsterCombatantPayload;

export async function addCombatantToEncounter(
  encounterId: string,
  payload: AddCombatantPayload
): Promise<EncounterCombatant[]> {
  if (payload.type === 'character') {
    const { data: charData, error: charError } = await supabase
      .from('characters')
      .select('id, name, max_health, current_health, max_willpower, current_willpower')
      .eq('id', payload.characterId)
      .single();

    if (charError || !charData) {
      console.error('Error fetching character for combatant:', charError?.message);
      throw new Error(`Character (ID: ${payload.characterId}) not found or error fetching details.`);
    }

    const displayName = charData.name || 'Unnamed Character';

    const combatantData = {
      encounter_id: encounterId,
      character_id: charData.id,
      display_name: displayName,
      max_hp: charData.max_health ?? 10,
      current_hp: charData.current_health ?? charData.max_health ?? 10,
      max_wp: charData.max_willpower,
      current_wp: charData.current_willpower,
      is_player_character: true,
      initiative_roll: payload.initiativeRoll,
    };

    const { data: newCombatant, error: insertError } = await supabase
      .from('encounter_combatants')
      .insert(combatantData)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting character combatant:', insertError.message);
      throw insertError;
    }
    return [newCombatant as EncounterCombatant];
  } else {
    const { data: monsterData, error: monsterError } = await supabase
      .from('monsters')
      .select('id, name, stats')
      .eq('id', payload.monsterId)
      .single();

    if (monsterError || !monsterData) {
      console.error('Error fetching monster for combatant:', monsterError?.message);
      throw new Error(`Monster (ID: ${payload.monsterId}) not found or error fetching details.`);
    }

    const monsterHp = (monsterData as any).stats?.HP ?? (monsterData as any).stats?.hp ?? 10;
    const instanceCount = payload.instanceCount ?? 1;
    const combatantsToInsert: any[] = [];

    for (let i = 0; i < instanceCount; i++) {
      const displayName =
        instanceCount > 1
          ? `${payload.customName || monsterData.name || 'Unnamed Monster'} ${i + 1}`
          : payload.customName || monsterData.name || 'Unnamed Monster';

      combatantsToInsert.push({
        encounter_id: encounterId,
        monster_id: monsterData.id,
        display_name: displayName,
        max_hp: monsterHp,
        current_hp: monsterHp,
        max_wp: null,
        current_wp: null,
        is_player_character: false,
        initiative_roll: payload.initiativeRoll,
      });
    }

    const { data: newCombatants, error: insertError } = await supabase
      .from('encounter_combatants')
      .insert(combatantsToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting monster combatants:', insertError.message);
      throw insertError;
    }
    return (newCombatants || []) as EncounterCombatant[];
  }
}

export async function joinEncounterAsCharacter(
  encounterId: string,
  characterId: string
): Promise<EncounterCombatant> {
  const { data: existing } = await supabase
    .from('encounter_combatants')
    .select('id')
    .eq('encounter_id', encounterId)
    .eq('character_id', characterId)
    .single();

  if (existing) {
    throw new Error('Character is already in this encounter');
  }

  const result = await addCombatantToEncounter(encounterId, {
    type: 'character',
    characterId,
  });

  return result[0];
}

export async function updateEncounter(
  encounterId: string,
  updates: Partial<Pick<Encounter, 'name' | 'description' | 'status' | 'current_round' | 'active_combatant_id' | 'log'>>
): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .update(updates as any)
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
  return data as Encounter;
}

export async function updateCombatant(
  combatantId: string,
  updates: Partial<Pick<EncounterCombatant, 'current_hp' | 'current_wp' | 'initiative_roll' | 'status_effects' | 'is_active_turn'>>
): Promise<EncounterCombatant> {
  const { data, error } = await supabase
    .from('encounter_combatants')
    .update(updates as any)
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
  return data as EncounterCombatant;
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

export async function rollInitiativeForCombatants(
  encounterId: string,
  combatantIds: string[]
): Promise<EncounterCombatant[]> {
  const { data: combatants, error: fetchError } = await supabase
    .from('encounter_combatants')
    .select('*, monsters(stats)')
    .eq('encounter_id', encounterId)
    .in('id', combatantIds);

  if (fetchError) {
    console.error('Error fetching combatants for initiative:', fetchError);
    throw fetchError;
  }

  const updates =
    combatants?.map((combatant: any) => {
      let initiativeRoll: number;

      if (combatant.is_player_character) {
        initiativeRoll = Math.floor(Math.random() * 10) + 1;
      } else {
        // Be defensive about case of FEROCITY vs ferocity
        const ferocity =
          combatant.monsters?.stats?.FEROCITY ??
          combatant.monsters?.stats?.ferocity ??
          1;
        const maxRolls = Math.max(1, Math.min(ferocity, 5));
        const rolls = Array.from({ length: maxRolls }, () => Math.floor(Math.random() * 10) + 1);
        initiativeRoll = Math.max(...rolls);
      }

      return { id: combatant.id, initiative_roll: initiativeRoll };
    }) || [];

  const updatePromises = updates.map((u) => updateCombatant(u.id, { initiative_roll: u.initiative_roll }));
  return Promise.all(updatePromises);
}

export async function swapInitiative(
  combatantId1: string,
  combatantId2: string
): Promise<[EncounterCombatant, EncounterCombatant]> {
  const { data: combatants, error } = await supabase
    .from('encounter_combatants')
    .select('id, initiative_roll')
    .in('id', [combatantId1, combatantId2]);

  if (error || !combatants || combatants.length !== 2) {
    throw new Error('Could not fetch combatants for initiative swap');
  }

  const [c1, c2] = combatants as { id: string; initiative_roll: number | null }[];

  const [updated1, updated2] = await Promise.all([
    updateCombatant(c1.id, { initiative_roll: c2.initiative_roll }),
    updateCombatant(c2.id, { initiative_roll: c1.initiative_roll }),
  ]);

  return [updated1, updated2];
}

export async function startEncounter(encounterId: string): Promise<Encounter> {
  const encounter = await updateEncounter(encounterId, {
    status: 'active',
    current_round: 1,
  });
  // Optional: seed a log entry
  await appendEncounterLog(encounterId, { type: 'start', round: 1 });
  return encounter;
}

export async function endEncounter(encounterId: string): Promise<Encounter> {
  const encounter = await updateEncounter(encounterId, {
    status: 'completed',
    active_combatant_id: null,
  });
  await appendEncounterLog(encounterId, { type: 'end' });
  return encounter;
}

export async function nextRound(encounterId: string): Promise<Encounter> {
  const { data: currentEncounter } = await supabase
    .from('encounters')
    .select('current_round')
    .eq('id', encounterId)
    .single();

  if (!currentEncounter) throw new Error('Encounter not found');

  const updated = await updateEncounter(encounterId, {
    current_round: (currentEncounter.current_round ?? 0) + 1,
    active_combatant_id: null,
  });

  await appendEncounterLog(encounterId, {
    type: 'round_advanced',
    round: updated.current_round,
  });

  return updated;
}

/* -------------------------------------------------------------------------------------------------
 * Encounter Log helpers (JSONB array in encounters.log)
 * - appendEncounterLog: append a single entry (adds ISO timestamp if missing)
 * - appendEncounterLogs: append multiple entries
 * - getEncounterLog: fetch the current log array (always returns an array)
 * ------------------------------------------------------------------------------------------------ */

type EncounterLogEntry = Record<string, any> & { ts?: string };

export async function getEncounterLog(encounterId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('encounters')
    .select('log')
    .eq('id', encounterId)
    .single();

  if (error) {
    console.error('Error fetching encounter log:', error);
    throw error;
  }
  const log = (data?.log ?? []);
  return Array.isArray(log) ? log : [];
}

export async function appendEncounterLog(
  encounterId: string,
  entry: EncounterLogEntry
): Promise<void> {
  // fetch current log
  const log = await getEncounterLog(encounterId);

  // ensure timestamp
  const stamped: EncounterLogEntry = {
    ts: entry.ts ?? new Date().toISOString(),
    ...entry,
  };

  log.push(stamped);

  const { error } = await supabase
    .from('encounters')
    .update({ log })
    .eq('id', encounterId);

  if (error) {
    console.error('Error appending encounter log:', error);
    throw error;
  }
}

export async function appendEncounterLogs(
  encounterId: string,
  entries: EncounterLogEntry[]
): Promise<void> {
  if (!entries || entries.length === 0) return;
  const log = await getEncounterLog(encounterId);
  const stamped = entries.map((e) => ({ ts: e.ts ?? new Date().toISOString(), ...e }));
  const { error } = await supabase
    .from('encounters')
    .update({ log: [...log, ...stamped] })
    .eq('id', encounterId);

  if (error) {
    console.error('Error appending encounter logs:', error);
    throw error;
  }
}
