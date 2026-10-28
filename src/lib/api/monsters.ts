import { supabase } from '../supabase';
import type { MonsterData } from '../../types/bestiary';

/**
 * The shared bestiary plus, with `partyId`, that campaign's own monsters and NPCs. A GM of several campaigns can read
 * each one's monsters, so the list is narrowed to the campaign at hand.
 */
export async function fetchAllMonsters(partyId?: string): Promise<MonsterData[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching all monsters:', error);
    throw error;
  }
  return ((data || []) as MonsterData[]).filter((monster) => !monster.party_id || monster.party_id === partyId);
}

/** Saves a monster or NPC to one campaign's own bestiary. Only that campaign's GMs can see or change it. */
export async function createCampaignMonster(partyId: string, monster: MonsterData): Promise<MonsterData> {
  const attacks = (monster.attacks || []).map((attack) => {
    const { id: _attackId, effects, ...rest } = attack;
    void _attackId;
    return { ...rest, effects: (effects || []).map(({ id: _effectId, ...effect }) => { void _effectId; return effect; }) };
  });
  const { data, error } = await supabase
    .from('monsters')
    .insert({
      name: monster.name.trim(),
      description: monster.description || null,
      category: monster.category || null,
      stats: monster.stats || {},
      attacks,
      effects_summary: monster.effectsSummary || null,
      party_id: partyId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MonsterData;
}

export async function fetchMonstersByCategory(category: string): Promise<MonsterData[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('category', category)
    .order('name');

  if (error) {
    console.error('Error fetching monsters by category:', error);
    throw error;
  }
  return data || [];
}

export async function fetchMonsterById(id: string): Promise<MonsterData | null> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching monster by ID:', error);
    throw error;
  }
  return data;
}
