import { supabase } from '../supabase';
import type { PartyMap } from '../../types/atlas';
import type { NewTableItem, TableItem, TablePing, TableState } from '../../types/virtualTable';

const toNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The database hands numeric columns back as text from some endpoints; the canvas needs real numbers. */
export function normalizeTableItem(row: TableItem): TableItem {
  return { ...row, x: toNumber(row.x, 0.5), y: toNumber(row.y, 0.5), size: toNumber(row.size, 1) };
}

export async function fetchTableState(partyId: string): Promise<TableState | null> {
  const { data, error } = await supabase.from('party_table_state').select('*').eq('party_id', partyId).maybeSingle<TableState>();
  if (error) throw new Error(error.message || 'Could not load the table');
  return data ? { ...data, revision: toNumber(data.revision, 0) } : null;
}

export async function fetchTableMaps(partyId: string): Promise<PartyMap[]> {
  const { data, error } = await supabase.from('party_maps').select('*').eq('party_id', partyId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Could not load the maps');
  return (data || []) as PartyMap[];
}

export async function fetchTableItems(mapId: string): Promise<TableItem[]> {
  const { data, error } = await supabase.from('table_items').select('*').eq('map_id', mapId).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Could not load the tokens');
  return ((data || []) as TableItem[]).map(normalizeTableItem);
}

export async function setTableScene(partyId: string, mapId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_table_scene', { p_party_id: partyId, p_map_id: mapId });
  if (error) throw new Error(error.message || 'Could not change the scene');
}

export async function addTableItems(mapId: string, items: NewTableItem[], visible = false): Promise<TableItem[]> {
  const { data, error } = await supabase.rpc<{ items: TableItem[] }>('add_table_items', { p_map_id: mapId, p_items: items, p_visible: visible });
  if (error || !data) throw new Error(error?.message || 'Could not add the tokens');
  return data.items.map(normalizeTableItem);
}

export async function setItemsVisibility(mapId: string, visible: boolean, itemIds?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc<{ changed: number }>('set_table_items_visibility', { p_map_id: mapId, p_visible: visible, p_item_ids: itemIds ?? null });
  if (error || !data) throw new Error(error?.message || 'Could not change visibility');
  return data.changed;
}

export async function moveTableItem(itemId: string, x: number, y: number): Promise<void> {
  const { error } = await supabase.rpc('move_table_item', { p_item_id: itemId, p_x: x, p_y: y });
  if (error) throw new Error(error.message || 'Could not move the token');
}

export async function updateTableItem(id: string, updates: Partial<Pick<TableItem, 'label' | 'size' | 'color' | 'locked' | 'visible' | 'image_url'>>): Promise<void> {
  const { error } = await supabase.from('table_items').update(updates).eq('id', id);
  if (error) throw new Error(error.message || 'Could not update the token');
}

export async function deleteTableItem(id: string): Promise<void> {
  const { error } = await supabase.from('table_items').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Could not remove the token');
}

export async function pingTable(mapId: string, x: number, y: number, focus = false): Promise<void> {
  const { error } = await supabase.rpc<TablePing>('ping_table', { p_map_id: mapId, p_x: x, p_y: y, p_focus: focus });
  // A ping sent too soon after the last one is simply dropped; there is nothing for the sender to fix.
  if (error && !/one ping at a time/i.test(error.message)) throw new Error(error.message || 'Could not send the ping');
}

/** The same 20 MB-per-campaign map allowance and storage folder the Atlas uses, so maps are shared between the two. */
export const MAP_STORAGE_LIMIT_BYTES = 20 * 1024 * 1024;

export async function uploadTableMap(partyId: string, file: File, name: string): Promise<PartyMap> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const folder = `Atlas/${partyId}`;
  const { data: existing, error: listError } = await supabase.storage.from('images').list(folder);
  if (!listError) {
    const used = (existing ?? []).reduce((sum, entry) => sum + (entry.metadata?.size || 0), 0);
    if (used + file.size > MAP_STORAGE_LIMIT_BYTES) {
      throw new Error(`Map storage is full: a campaign can hold ${MAP_STORAGE_LIMIT_BYTES / 1024 / 1024} MB of maps. Remove an old map in the Atlas first.`);
    }
  }
  const extension = file.name.split('.').pop() || 'png';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
  if (uploadError) throw new Error(uploadError.message || 'The upload failed.');
  const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path);
  const { data, error } = await supabase
    .from('party_maps')
    .insert([{ party_id: partyId, name: name.trim() || file.name, image_url: publicUrl, is_active: false }])
    .select()
    .single<PartyMap>();
  if (error || !data) throw new Error(error?.message || 'Could not save the map.');
  return data;
}
