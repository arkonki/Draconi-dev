import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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

function isValidCorner(value: string): value is DisplayCorner {
  return ['top_left', 'top_right', 'bottom_left', 'bottom_right'].includes(value);
}

function normalizeSlots(rawSlots: unknown): DisplaySlotInput[] | null {
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
      rotationDeg: typeof rawRotation === 'number' ? Math.round(rawRotation) : 0,
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

  const { sessionId, slots: rawSlots, displayImageUrl: rawDisplayImageUrl, displayMapId: rawDisplayMapId } = await request.json().catch(() => ({ sessionId: null, slots: null, displayImageUrl: null, displayMapId: null }));
  if (!sessionId || typeof sessionId !== 'string') {
    return jsonResponse(400, { error: 'sessionId is required.' });
  }

  const displayImageUrl = typeof rawDisplayImageUrl === 'string' && rawDisplayImageUrl.trim().length > 0
    ? rawDisplayImageUrl.trim()
    : null;
  const displayMapId = typeof rawDisplayMapId === 'string' && rawDisplayMapId.trim().length > 0
    ? rawDisplayMapId.trim()
    : null;

  const slots = normalizeSlots(rawSlots);
  if (!slots) {
    return jsonResponse(400, { error: 'slots must contain four unique corners and no duplicate character assignments.' });
  }

  try {
    const adminClient = createAdminClient();
    const { data: session, error: sessionError } = await adminClient
      .from('party_display_sessions')
      .select('id, party_id, created_by')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; party_id: string; created_by: string }>();

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message });
    }

    if (!session || session.created_by !== authResult.user.id) {
      return jsonResponse(403, { error: 'Only the party owner can update the display layout.' });
    }

    if (displayMapId) {
      const { data: mapRow, error: mapError } = await adminClient
        .from('party_maps')
        .select('id')
        .eq('id', displayMapId)
        .eq('party_id', session.party_id)
        .maybeSingle<{ id: string }>();

      if (mapError) {
        return jsonResponse(500, { error: mapError.message });
      }

      if (!mapRow) {
        return jsonResponse(400, { error: 'Selected projector map must belong to the party.' });
      }
    }

    const { data: updatedSession, error: sessionUpdateError } = await adminClient
      .from('party_display_sessions')
      .update({ display_image_url: displayImageUrl, display_map_id: displayMapId })
      .eq('id', sessionId)
      .select('id, party_id, display_map_id, display_image_url, expires_at, revoked_at, created_at, last_seen_at')
      .single();

    if (sessionUpdateError || !updatedSession) {
      return jsonResponse(500, { error: sessionUpdateError?.message || 'Failed to update display session.' });
    }

    const characterIds = slots.map((slot) => slot.characterId).filter(Boolean) as string[];
    if (characterIds.length > 0) {
      const { data: partyMembers, error: membersError } = await adminClient
        .from('party_members')
        .select('character_id')
        .eq('party_id', session.party_id)
        .in('character_id', characterIds);

      if (membersError) {
        return jsonResponse(500, { error: membersError.message });
      }

      const validIds = new Set((partyMembers || []).map((member) => member.character_id).filter(Boolean));
      if (characterIds.some((characterId) => !validIds.has(characterId))) {
        return jsonResponse(400, { error: 'All assigned characters must belong to the party.' });
      }
    }

    const { data: updatedSlots, error: updateError } = await adminClient
      .from('party_display_slots')
      .upsert(
        slots.map((slot) => ({
          session_id: sessionId,
          corner: slot.corner,
          character_id: slot.characterId,
          rotation_deg: slot.rotationDeg,
          sort_order: slot.sortOrder,
        })),
        { onConflict: 'session_id,corner' }
      )
      .select('id, session_id, corner, character_id, rotation_deg, sort_order, created_at, updated_at')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true });

    if (updateError) {
      return jsonResponse(500, { error: updateError.message });
    }

    return jsonResponse(200, { session: updatedSession, slots: updatedSlots || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error updating display layout.';
    return jsonResponse(500, { error: message });
  }
});
