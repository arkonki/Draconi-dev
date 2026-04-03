import { supabase } from '../supabase';
import type { PartyDisplaySession, PartyDisplaySlot, PlayerDisplayState } from '../../types/projectorDisplay';

const DISPLAY_TOKEN_STORAGE_PREFIX = 'party-display-token';
const PROJECTOR_IMAGE_FOLDER = 'ProjectorDisplays';
const PARTY_DISPLAY_SESSION_SELECT = 'id, party_id, display_map_id, display_image_url, expires_at, revoked_at, created_at, last_seen_at';

interface StoredDisplayToken {
  sessionId: string;
  token: string;
}

export const DEFAULT_DISPLAY_SLOTS: PartyDisplaySlot[] = [
  { corner: 'top_left', character_id: null, rotation_deg: 180, sort_order: 0 },
  { corner: 'top_right', character_id: null, rotation_deg: 90, sort_order: 1 },
  { corner: 'bottom_left', character_id: null, rotation_deg: 270, sort_order: 2 },
  { corner: 'bottom_right', character_id: null, rotation_deg: 0, sort_order: 3 },
];

function getStorageKey(partyId: string) {
  return `${DISPLAY_TOKEN_STORAGE_PREFIX}:${partyId}`;
}

export function storePartyDisplayToken(partyId: string, sessionId: string, token: string) {
  window.localStorage.setItem(getStorageKey(partyId), JSON.stringify({ sessionId, token } satisfies StoredDisplayToken));
}

export function getStoredPartyDisplayToken(partyId: string, sessionId: string) {
  const raw = window.localStorage.getItem(getStorageKey(partyId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredDisplayToken;
    return parsed.sessionId === sessionId ? parsed.token : null;
  } catch {
    return null;
  }
}

export function clearStoredPartyDisplayToken(partyId: string) {
  window.localStorage.removeItem(getStorageKey(partyId));
}

export function buildPartyDisplayUrl(sessionToken: string) {
  return `${window.location.origin}/display/${sessionToken}`;
}

function normalizePartyDisplaySession(value: unknown): PartyDisplaySession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.party_id !== 'string' || typeof row.expires_at !== 'string' || typeof row.created_at !== 'string') {
    return null;
  }

  return {
    id: row.id,
    party_id: row.party_id,
    display_map_id: typeof row.display_map_id === 'string' ? row.display_map_id : null,
    display_image_url: typeof row.display_image_url === 'string' ? row.display_image_url : null,
    expires_at: row.expires_at,
    revoked_at: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    created_at: row.created_at,
    last_seen_at: typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
  };
}

function normalizePartyDisplaySlots(value: unknown): PartyDisplaySlot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const slots = value.filter((slot) => slot && typeof slot === 'object') as Array<Record<string, unknown>>;
  if (slots.length !== value.length) {
    return null;
  }

  return slots.map((slot) => ({
    id: typeof slot.id === 'string' ? slot.id : undefined,
    session_id: typeof slot.session_id === 'string' ? slot.session_id : undefined,
    corner: slot.corner as PartyDisplaySlot['corner'],
    character_id: typeof slot.character_id === 'string' ? slot.character_id : null,
    rotation_deg: typeof slot.rotation_deg === 'number' ? slot.rotation_deg : 0,
    sort_order: typeof slot.sort_order === 'number' ? slot.sort_order : 0,
    created_at: typeof slot.created_at === 'string' ? slot.created_at : undefined,
    updated_at: typeof slot.updated_at === 'string' ? slot.updated_at : undefined,
  }));
}

async function fetchPartyDisplaySessionById(sessionId: string): Promise<PartyDisplaySession | null> {
  const { data, error } = await supabase
    .from('party_display_sessions')
    .select(PARTY_DISPLAY_SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle<PartyDisplaySession>();

  if (error) {
    throw new Error(error.message || 'Failed to fetch display session');
  }

  return data;
}

export async function fetchActivePartyDisplaySession(partyId: string): Promise<PartyDisplaySession | null> {
  const { data, error } = await supabase
    .from('party_display_sessions')
    .select(PARTY_DISPLAY_SESSION_SELECT)
    .eq('party_id', partyId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<PartyDisplaySession>();

  if (error) {
    throw new Error(error.message || 'Failed to fetch active display session');
  }

  return data;
}

export async function fetchPartyDisplaySlots(sessionId: string): Promise<PartyDisplaySlot[]> {
  const { data, error } = await supabase
    .from('party_display_slots')
    .select('id, session_id, corner, character_id, rotation_deg, sort_order, created_at, updated_at')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })
    .returns<PartyDisplaySlot[]>();

  if (error) {
    throw new Error(error.message || 'Failed to fetch display slots');
  }

  return data && data.length > 0 ? data : DEFAULT_DISPLAY_SLOTS;
}

export async function createPartyDisplaySession(partyId: string) {
  const { data, error } = await supabase.functions.invoke('create-party-display-session', {
    body: { partyId },
  });

  if (error) {
    throw new Error(error.message || 'Failed to create display session');
  }

  const session = normalizePartyDisplaySession(data?.session);
  const slots = normalizePartyDisplaySlots(data?.slots) || DEFAULT_DISPLAY_SLOTS;

  if (!data?.sessionToken || !session) {
    throw new Error('Display session response was incomplete');
  }

  storePartyDisplayToken(partyId, session.id, data.sessionToken);
  return { sessionToken: data.sessionToken as string, session, slots };
}

export async function uploadProjectorImage(partyId: string, file: File) {
  const fileExt = file.name.split('.').pop() || 'png';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`;
  const filePath = `${PROJECTOR_IMAGE_FOLDER}/${partyId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(filePath, file);

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload projector image');
  }

  const { data } = supabase.storage.from('images').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function fetchPartyMaps(partyId: string) {
  const { data, error } = await supabase
    .from('party_maps')
    .select('id, name, image_url, is_active')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch party maps');
  }

  return (data || []) as Array<{ id: string; name: string; image_url: string | null; is_active: boolean }>;
}

export async function updatePartyDisplayLayout(
  sessionId: string,
  slots: PartyDisplaySlot[],
  displayImageUrl: string | null,
  displayMapId: string | null
) {
  const { data, error } = await supabase.functions.invoke('update-party-display-layout', {
    body: {
      sessionId,
      displayImageUrl,
      displayMapId,
      slots: slots.map((slot) => ({
        corner: slot.corner,
        characterId: slot.character_id,
        rotationDeg: slot.rotation_deg,
        sortOrder: slot.sort_order,
      })),
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to update display layout');
  }

  const normalizedSession = normalizePartyDisplaySession(data?.session) || await fetchPartyDisplaySessionById(sessionId);
  const normalizedSlots = normalizePartyDisplaySlots(data?.slots) || await fetchPartyDisplaySlots(sessionId);

  if (!normalizedSession) {
    throw new Error('Display layout response was incomplete');
  }

  return { slots: normalizedSlots, session: normalizedSession };
}

export async function revokePartyDisplaySession(sessionId: string, partyId: string) {
  const { error } = await supabase.functions.invoke('revoke-party-display-session', {
    body: { sessionId },
  });

  if (error) {
    throw new Error(error.message || 'Failed to revoke display session');
  }

  clearStoredPartyDisplayToken(partyId);
}

export async function renewPartyDisplaySession(sessionId: string) {
  const { data, error } = await supabase.functions.invoke('renew-party-display-session', {
    body: { sessionId },
  });

  if (error) {
    throw new Error(error.message || 'Failed to renew display session');
  }

  const session = normalizePartyDisplaySession(data?.session);

  if (!session) {
    throw new Error('Renew response was incomplete');
  }

  return session;
}

export async function getPlayerDisplayState(sessionToken: string) {
  const { data, error } = await supabase.functions.invoke('get-player-display-state', {
    body: { sessionToken },
  });

  if (error) {
    throw new Error(error.message || 'Failed to load display state');
  }

  return data as PlayerDisplayState;
}
