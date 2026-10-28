import { supabase } from '../supabase';

// Adding things to a party's stash. Items with the same name and description stack, so the same loot added twice
// shows as one row with a larger quantity. Every addition is written to the stash history.

export interface StashAddition {
  name: string;
  category?: string;
  description?: string;
  quantity: number;
}

const stackKey = (name: string, description?: string | null) => `${name.trim().toLowerCase()}::${description || ''}`;

export async function addItemsToPartyStash(partyId: string, additions: StashAddition[], fromId = 'DM'): Promise<void> {
  const merged = new Map<string, StashAddition & { description: string }>();
  for (const addition of additions) {
    if (!addition.name.trim() || addition.quantity <= 0) continue;
    const description = addition.description || '';
    const key = stackKey(addition.name, description);
    const existing = merged.get(key);
    if (existing) existing.quantity += addition.quantity;
    else merged.set(key, { ...addition, name: addition.name.trim(), description });
  }
  if (merged.size === 0) return;

  // Read the stash now rather than trusting what a screen loaded earlier, so additions from others are not lost.
  const { data, error } = await supabase.from('party_inventory').select('id, name, quantity, description').eq('party_id', partyId);
  if (error) throw error;
  const stash = new Map(((data ?? []) as Array<{ id: string; name: string; quantity: number; description?: string | null }>)
    .map((row) => [stackKey(String(row.name), row.description), row]));

  const rowsToUpdate: Array<{ id: string; quantity: number }> = [];
  const rowsToInsert: Array<{ party_id: string; name: string; quantity: number; category: string; description: string }> = [];
  const logs: Array<{ party_id: string; item_name: string; quantity: number; from_type: 'party'; from_id: string; to_type: 'party'; to_id: string }> = [];
  for (const [key, addition] of merged) {
    const existing = stash.get(key);
    if (existing) rowsToUpdate.push({ id: existing.id, quantity: (Number(existing.quantity) || 0) + addition.quantity });
    else rowsToInsert.push({ party_id: partyId, name: addition.name, quantity: addition.quantity, category: addition.category || 'LOOT', description: addition.description });
    logs.push({ party_id: partyId, item_name: addition.name, quantity: addition.quantity, from_type: 'party', from_id: fromId, to_type: 'party', to_id: partyId });
  }

  if (rowsToUpdate.length > 0) {
    const { error: updateError } = await supabase.from('party_inventory').upsert(rowsToUpdate, { onConflict: 'id' });
    if (updateError) throw updateError;
  }
  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('party_inventory').insert(rowsToInsert);
    if (insertError) throw insertError;
  }
  const { error: logError } = await supabase.from('party_inventory_log').insert(logs);
  if (logError) console.error('Failed to write stash history.', logError);
}
