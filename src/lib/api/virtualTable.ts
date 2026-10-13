import { supabase } from '../supabase';
import { listProjectorImages, type ProjectorStoredImage } from './projectorDisplay';
import { isImageFileName, sanitizeIconFileName, type TokenIconFile } from '../tokenIcons';
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

export interface ImageLibraryGroup {
  /** The campaign the images were saved under (the folder name inside ProjectorDisplays). */
  folderId: string;
  /** A name for the group; the current campaign is labelled as such, others by their name when it is known. */
  label: string;
  isCurrent: boolean;
  images: ProjectorStoredImage[];
}

const IMAGE_BUCKET = 'images';
const PROJECTOR_FOLDER = 'ProjectorDisplays';

/**
 * Every image saved in the projector library: this campaign's first, then those saved under other campaigns on
 * the same server (a GM often keeps their maps under an older campaign). Images are shared by reference, not copied.
 */
export async function listImageLibrary(partyId: string, options: { includeIcons?: boolean } = {}): Promise<ImageLibraryGroup[]> {
  const { data: entries, error } = await supabase.storage.from(IMAGE_BUCKET).list(PROJECTOR_FOLDER, { limit: 200 });
  if (error) throw new Error(error.message || 'Could not read the image library');
  const folderIds = new Set<string>((entries ?? []).filter((entry) => entry.id?.endsWith('/')).map((entry) => entry.name));
  folderIds.add(partyId);

  const names = new Map<string, string>();
  try {
    const { data } = await supabase.from('parties').select('id, name').in('id', [...folderIds]);
    for (const party of (data ?? []) as Array<{ id: string; name: string }>) names.set(party.id, party.name);
  } catch {
    // Names are a convenience; the images are still listed without them.
  }

  const groups: ImageLibraryGroup[] = [];
  for (const folderId of folderIds) {
    const images = (await listProjectorImages(folderId).catch(() => []))
      .filter((image) => /\.(png|jpe?g|webp|gif|avif)$/i.test(image.name));
    if (images.length === 0 && folderId !== partyId) continue;
    groups.push({
      folderId,
      isCurrent: folderId === partyId,
      label: folderId === partyId ? 'This campaign' : (names.get(folderId) ?? 'Another campaign'),
      images,
    });
  }
  groups.sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || right.images.length - left.images.length);
  if (options.includeIcons) {
    const icons = await listTokenIcons().catch(() => []);
    if (icons.length > 0) {
      groups.unshift({
        folderId: TOKEN_ICON_FOLDER,
        isCurrent: false,
        label: 'Token icons',
        images: icons.map((icon) => ({ name: icon.name, path: icon.path, publicUrl: icon.url, updatedAt: null })),
      });
    }
  }
  return groups;
}

/** Makes a scene from an image that is already stored, without uploading anything again. */
export async function createMapFromImage(partyId: string, imageUrl: string, name: string): Promise<PartyMap> {
  const { data, error } = await supabase
    .from('party_maps')
    .insert([{ party_id: partyId, name: name.trim() || 'Map', image_url: imageUrl, is_active: false }])
    .select()
    .single<PartyMap>();
  if (error || !data) throw new Error(error?.message || 'Could not save the scene.');
  return data;
}

// --- Token icons and token images ---

export const TOKEN_ICON_FOLDER = 'TokenIcons';
const TOKEN_IMAGE_FOLDER = 'TokenImages';
const ICON_PAGE_SIZE = 500;

/** Every icon in the shared icon folder. Named after a monster, an icon is shown on that monster's tokens. */
export async function listTokenIcons(): Promise<TokenIconFile[]> {
  const icons: TokenIconFile[] = [];
  for (let offset = 0; ; offset += ICON_PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list(TOKEN_ICON_FOLDER, { limit: ICON_PAGE_SIZE, offset });
    if (error) throw new Error(error.message || 'Could not read the icon folder');
    const page = data ?? [];
    for (const entry of page) {
      if (!entry.name || entry.id?.endsWith('/') || !isImageFileName(entry.name)) continue;
      const path = `${TOKEN_ICON_FOLDER}/${entry.name}`;
      icons.push({ name: entry.name, path, url: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl });
    }
    if (page.length < ICON_PAGE_SIZE) break;
  }
  return icons;
}

export interface IconUploadResult { uploaded: number; failed: Array<{ name: string; reason: string }> }

/** Uploads icons one after another, keeping each file's own name so it can be matched to a monster. */
export async function uploadTokenIcons(files: File[], onProgress?: (done: number, total: number) => void): Promise<IconUploadResult> {
  const result: IconUploadResult = { uploaded: 0, failed: [] };
  const images = files.filter((file) => file.type.startsWith('image/') || isImageFileName(file.name));
  result.failed.push(...files.filter((file) => !images.includes(file)).map((file) => ({ name: file.name, reason: 'Not an image' })));
  for (const [index, file] of images.entries()) {
    const name = sanitizeIconFileName(file.name);
    const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(`${TOKEN_ICON_FOLDER}/${name}`, file, { upsert: true });
    if (error) result.failed.push({ name: file.name, reason: error.message || 'Upload failed' });
    else result.uploaded += 1;
    onProgress?.(index + 1, images.length);
  }
  return result;
}

export async function deleteTokenIcon(path: string): Promise<void> {
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(error.message || 'Could not remove the icon');
}

/** A custom picture for one token. */
export async function uploadTokenImage(partyId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const extension = file.name.split('.').pop() || 'png';
  const path = `${TOKEN_IMAGE_FOLDER}/${partyId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file);
  if (error) throw new Error(error.message || 'The upload failed.');
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
