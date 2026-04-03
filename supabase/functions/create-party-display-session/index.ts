import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DisplayCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

interface DisplaySlotInput {
  corner: DisplayCorner;
  characterId: string | null;
  rotationDeg: number;
  sortOrder: number;
}

interface PartyRow {
  id: string;
  name: string;
  created_by: string;
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function createAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function createAuthClient(authorization: string) {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
  });
}

async function requireUser(request: Request) {
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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createDisplayToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getSessionExpiryIso() {
  return new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
}

function getDefaultSlots(): DisplaySlotInput[] {
  return [
    { corner: 'top_left', characterId: null, rotationDeg: 180, sortOrder: 0 },
    { corner: 'top_right', characterId: null, rotationDeg: 90, sortOrder: 1 },
    { corner: 'bottom_left', characterId: null, rotationDeg: 270, sortOrder: 2 },
    { corner: 'bottom_right', characterId: null, rotationDeg: 0, sortOrder: 3 },
  ];
}

async function verifyPartyOwner(adminClient: SupabaseClient, partyId: string, userId: string) {
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

async function loadLatestSlots(adminClient: SupabaseClient, partyId: string) {
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

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const authResult = await requireUser(request);
  if ('error' in authResult) {
    return authResult.error;
  }

  const { partyId } = await request.json().catch(() => ({ partyId: null }));
  if (!partyId || typeof partyId !== 'string') {
    return jsonResponse(400, { error: 'partyId is required.' });
  }

  try {
    const adminClient = createAdminClient();
    const party = await verifyPartyOwner(adminClient, partyId, authResult.user.id);

    if (!party) {
      return jsonResponse(403, { error: 'Only the party owner can create a display session.' });
    }

    const latestSlots = await loadLatestSlots(adminClient, partyId);
    const { data: latestSession } = await adminClient
      .from('party_display_sessions')
      .select('display_map_id, display_image_url')
      .eq('party_id', partyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ display_map_id: string | null; display_image_url: string | null }>();

    await adminClient
      .from('party_display_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('party_id', partyId)
      .is('revoked_at', null);

    const sessionToken = createDisplayToken();
    const tokenHash = await sha256Hex(sessionToken);
    const expiresAt = getSessionExpiryIso();

    const { data: session, error: sessionError } = await adminClient
      .from('party_display_sessions')
      .insert({
        party_id: partyId,
        token_hash: tokenHash,
        created_by: authResult.user.id,
        display_map_id: latestSession?.display_map_id ?? null,
        display_image_url: latestSession?.display_image_url ?? null,
        expires_at: expiresAt,
      })
      .select('id, party_id, display_map_id, display_image_url, expires_at, revoked_at, created_at, last_seen_at')
      .single();

    if (sessionError || !session) {
      return jsonResponse(500, { error: sessionError?.message || 'Failed to create display session.' });
    }

    const slotsToInsert = (latestSlots || getDefaultSlots()).map((slot) => ({
      session_id: session.id,
      corner: slot.corner,
      character_id: slot.characterId,
      rotation_deg: slot.rotationDeg,
      sort_order: slot.sortOrder,
    }));

    const { data: slots, error: slotsError } = await adminClient
      .from('party_display_slots')
      .insert(slotsToInsert)
      .select('id, session_id, corner, character_id, rotation_deg, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true });

    if (slotsError) {
      await adminClient.from('party_display_sessions').delete().eq('id', session.id);
      return jsonResponse(500, { error: slotsError.message });
    }

    return jsonResponse(200, {
      sessionToken,
      session,
      slots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error creating display session.';
    return jsonResponse(500, { error: message });
  }
});
