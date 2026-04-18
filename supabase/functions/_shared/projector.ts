import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const DISPLAY_SESSION_DURATION_HOURS = 12;
export const DISPLAY_CORNERS = ['top_left', 'top_right', 'bottom_left', 'bottom_right'] as const;
export type DisplayCorner = typeof DISPLAY_CORNERS[number];

export interface DisplaySlotInput {
  corner: DisplayCorner;
  characterId: string | null;
  rotationDeg: number;
  sortOrder: number;
}

export interface SessionRow {
  id: string;
  party_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface PartyRow {
  id: string;
  name: string;
  created_by: string;
}

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function createAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export function createAuthClient(authorization: string) {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
  });
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return { error: jsonResponse(401, { error: 'Missing authorization header.' }) };
  }

  const authClient = createAuthClient(authorization);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    return { error: jsonResponse(401, { error: 'Unauthorized.' }) };
  }

  return { user };
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function slugifyPartyName(name: string) {
  const normalized = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return (normalized || 'party').slice(0, 24).replace(/-+$/g, '') || 'party';
}

export function createShortCode(length = 6) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function createDisplayToken(partyName: string) {
  return `${slugifyPartyName(partyName)}-${createShortCode(6)}`;
}

export function getSessionExpiryIso() {
  return new Date(Date.now() + DISPLAY_SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();
}

export function getDefaultSlots(): DisplaySlotInput[] {
  return [
    { corner: 'top_left', characterId: null, rotationDeg: 45, sortOrder: 0 },
    { corner: 'top_right', characterId: null, rotationDeg: -45, sortOrder: 1 },
    { corner: 'bottom_left', characterId: null, rotationDeg: 135, sortOrder: 2 },
    { corner: 'bottom_right', characterId: null, rotationDeg: -135, sortOrder: 3 },
  ];
}

export async function verifyPartyOwner(adminClient: SupabaseClient, partyId: string, userId: string) {
  const { data: party, error } = await adminClient
    .from('parties')
    .select('id, name, created_by')
    .eq('id', partyId)
    .maybeSingle<PartyRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!party || party.created_by !== userId) {
    return null;
  }

  return party;
}

export function isValidCorner(value: string): value is DisplayCorner {
  return DISPLAY_CORNERS.includes(value as DisplayCorner);
}

export function normalizeSlots(rawSlots: unknown): DisplaySlotInput[] | null {
  if (!Array.isArray(rawSlots)) {
    return null;
  }

  const normalized = rawSlots.map((slot, index) => {
    if (!slot || typeof slot !== 'object') {
      return null;
    }

    const rawCorner = typeof (slot as Record<string, unknown>).corner === 'string'
      ? (slot as Record<string, unknown>).corner
      : '';

    const rawRotation = (slot as Record<string, unknown>).rotationDeg;
    const rawCharacterId = (slot as Record<string, unknown>).characterId;
    const rawSortOrder = (slot as Record<string, unknown>).sortOrder;

    if (!isValidCorner(rawCorner)) {
      return null;
    }

    return {
      corner: rawCorner,
      characterId: typeof rawCharacterId === 'string' && rawCharacterId.trim().length > 0 ? rawCharacterId : null,
      rotationDeg: Number.isFinite(rawRotation) ? Math.round(rawRotation as number) : 0,
      sortOrder: typeof rawSortOrder === 'number' ? rawSortOrder : index,
    } satisfies DisplaySlotInput;
  });

  if (normalized.some((slot) => !slot)) {
    return null;
  }

  const slots = normalized as DisplaySlotInput[];
  const cornerCount = new Set(slots.map((slot) => slot.corner)).size;
  const characterIds = slots.map((slot) => slot.characterId).filter(Boolean) as string[];

  if (slots.length !== 4 || cornerCount !== 4 || new Set(characterIds).size !== characterIds.length) {
    return null;
  }

  return slots.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function loadLatestSlots(adminClient: SupabaseClient, partyId: string) {
  const { data: latestSession } = await adminClient
    .from('party_display_sessions')
    .select('id')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!latestSession) {
    return null;
  }

  const { data: slotRows } = await adminClient
    .from('party_display_slots')
    .select('corner, character_id, rotation_deg, sort_order')
    .eq('session_id', latestSession.id)
    .order('sort_order', { ascending: true })
    .returns<Array<{ corner: DisplayCorner; character_id: string | null; rotation_deg: number; sort_order: number }>>();

  if (!slotRows || slotRows.length !== 4) {
    return null;
  }

  return slotRows.map((slot) => ({
    corner: slot.corner,
    characterId: slot.character_id,
    rotationDeg: slot.rotation_deg ?? 0,
    sortOrder: slot.sort_order,
  }));
}
