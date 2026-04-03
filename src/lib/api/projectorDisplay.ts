import { supabase } from '../supabase';
import type { PartyDisplaySession, PartyDisplaySlot, PlayerDisplayState } from '../../types/projectorDisplay';

const DISPLAY_TOKEN_STORAGE_PREFIX = 'party-display-token';

interface StoredDisplayToken {
  sessionId: string;
  token: string;
}

export const DEFAULT_DISPLAY_SLOTS: PartyDisplaySlot[] = [
  { corner: 'top_left', character_id: null, rotation_deg: 45, sort_order: 0 },
  { corner: 'top_right', character_id: null, rotation_deg: -45, sort_order: 1 },
  { corner: 'bottom_left', character_id: null, rotation_deg: 135, sort_order: 2 },
  { corner: 'bottom_right', character_id: null, rotation_deg: -135, sort_order: 3 },
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

export async function fetchActivePartyDisplaySession(partyId: string): Promise<PartyDisplaySession | null> {
  const { data, error } = await supabase
    .from('party_display_sessions')
    .select('id, party_id, expires_at, revoked_at, created_at, last_seen_at')
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

  if (!data?.sessionToken || !data?.session) {
    throw new Error('Display session response was incomplete');
  }

  storePartyDisplayToken(partyId, data.session.id, data.sessionToken);
  return data as { sessionToken: string; session: PartyDisplaySession; slots: PartyDisplaySlot[] };
}

export async function updatePartyDisplayLayout(sessionId: string, slots: PartyDisplaySlot[]) {
  const { data, error } = await supabase.functions.invoke('update-party-display-layout', {
    body: {
      sessionId,
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

  return (data?.slots || []) as PartyDisplaySlot[];
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

  if (!data?.session) {
    throw new Error('Renew response was incomplete');
  }

  return data.session as PartyDisplaySession;
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
