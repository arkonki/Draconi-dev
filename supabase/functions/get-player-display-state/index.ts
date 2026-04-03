import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DisplayCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

interface SessionRow {
  id: string;
  party_id: string;
  token_hash: string;
  display_map_id?: string | null;
  display_image_url?: string | null;
  expires_at: string;
  revoked_at: string | null;
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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getDefaultSlots() {
  return [
    { corner: 'top_left' as const, characterId: null, rotationDeg: 180, sortOrder: 0 },
    { corner: 'top_right' as const, characterId: null, rotationDeg: 90, sortOrder: 1 },
    { corner: 'bottom_left' as const, characterId: null, rotationDeg: 270, sortOrder: 2 },
    { corner: 'bottom_right' as const, characterId: null, rotationDeg: 0, sortOrder: 3 },
  ];
}

type CharacterRow = {
  id: string;
  name: string | null;
  portrait_url: string | null;
  current_hp: number | null;
  max_hp: number | null;
  current_wp: number | null;
  max_wp: number | null;
  conditions: Record<string, boolean> | null;
};

type SlotRow = {
  corner: DisplayCorner;
  character_id: string | null;
  rotation_deg: number | null;
  sort_order: number;
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const { sessionToken } = await request.json().catch(() => ({ sessionToken: null }));
  if (!sessionToken || typeof sessionToken !== 'string') {
    return jsonResponse(400, { error: 'sessionToken is required.' });
  }

  try {
    const adminClient = createAdminClient();
    const tokenHash = await sha256Hex(sessionToken);

    const { data: session, error: sessionError } = await adminClient
      .from('party_display_sessions')
      .select('id, party_id, token_hash, display_map_id, display_image_url, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle<SessionRow>();

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message });
    }

    if (!session) {
      return jsonResponse(404, { error: 'Display session not found.' });
    }

    if (session.revoked_at) {
      return jsonResponse(410, { error: 'Display session has been revoked.' });
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return jsonResponse(410, { error: 'Display session has expired.' });
    }

    void adminClient
      .from('party_display_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id);

    const [{ data: party, error: partyError }, { data: map, error: mapError }, { data: encounter, error: encounterError }, { data: slotRows, error: slotsError }] = await Promise.all([
      adminClient
        .from('parties')
        .select('id, name')
        .eq('id', session.party_id)
        .maybeSingle<{ id: string; name: string }>(),
      session.display_map_id
        ? adminClient
            .from('party_maps')
            .select('image_url, grid_type, grid_size, grid_opacity, grid_offset_x, grid_offset_y, grid_color, grid_rotation')
            .eq('id', session.display_map_id)
            .eq('party_id', session.party_id)
            .maybeSingle<{
              image_url: string | null;
              grid_type: 'none' | 'square' | 'hex';
              grid_size: number;
              grid_opacity: number;
              grid_offset_x: number | null;
              grid_offset_y: number | null;
              grid_color: string | null;
              grid_rotation: number | null;
            }>()
        : adminClient
            .from('party_maps')
            .select('image_url, grid_type, grid_size, grid_opacity, grid_offset_x, grid_offset_y, grid_color, grid_rotation')
            .eq('party_id', session.party_id)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle<{
              image_url: string | null;
              grid_type: 'none' | 'square' | 'hex';
              grid_size: number;
              grid_opacity: number;
              grid_offset_x: number | null;
              grid_offset_y: number | null;
              grid_color: string | null;
              grid_rotation: number | null;
            }>(),
      adminClient
        .from('encounters')
        .select('name, current_round')
        .eq('party_id', session.party_id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ name: string | null; current_round: number | null }>(),
      adminClient
        .from('party_display_slots')
        .select('corner, character_id, rotation_deg, sort_order')
        .eq('session_id', session.id)
        .order('sort_order', { ascending: true })
        .returns<SlotRow[]>(),
    ]);

    if (partyError || !party) {
      return jsonResponse(500, { error: partyError?.message || 'Failed to load party.' });
    }

    if (mapError) {
      return jsonResponse(500, { error: mapError.message });
    }

    if (encounterError) {
      return jsonResponse(500, { error: encounterError.message });
    }

    if (slotsError) {
      return jsonResponse(500, { error: slotsError.message });
    }

    const slots = slotRows && slotRows.length > 0
      ? slotRows
      : getDefaultSlots().map((slot) => ({
          corner: slot.corner,
          character_id: slot.characterId,
          rotation_deg: slot.rotationDeg,
          sort_order: slot.sortOrder,
        }));

    const characterIds = slots.map((slot) => slot.character_id).filter(Boolean) as string[];
    const characterMap = new Map<string, CharacterRow>();

    if (characterIds.length > 0) {
      const { data: characters, error: charactersError } = await adminClient
        .from('characters')
        .select('id, name, portrait_url, current_hp, max_hp, current_wp, max_wp, conditions')
        .in('id', characterIds)
        .returns<CharacterRow[]>();

      if (charactersError) {
        return jsonResponse(500, { error: charactersError.message });
      }

      (characters || []).forEach((character) => {
        characterMap.set(character.id, character);
      });
    }

    return jsonResponse(200, {
      party: {
        id: party.id,
        name: party.name,
      },
      displayImageUrl: session.display_image_url ?? null,
      map: map
        ? {
            imageUrl: map.image_url,
            gridType: map.grid_type,
            gridSize: map.grid_size,
            gridOpacity: map.grid_opacity,
            gridOffsetX: map.grid_offset_x ?? 0,
            gridOffsetY: map.grid_offset_y ?? 0,
            gridColor: map.grid_color ?? '#000000',
            gridRotation: map.grid_rotation ?? 0,
          }
        : null,
      encounter: {
        isActive: Boolean(encounter),
        name: encounter?.name ?? null,
        round: encounter?.current_round ?? null,
      },
      slots: slots.map((slot) => {
        const character = slot.character_id ? characterMap.get(slot.character_id) : null;
        return {
          corner: slot.corner,
          rotationDeg: slot.rotation_deg ?? 0,
          sortOrder: slot.sort_order,
          character: character
            ? {
                id: character.id,
                name: character.name ?? 'Unnamed Character',
                portraitUrl: character.portrait_url,
                currentHp: character.current_hp ?? 0,
                maxHp: character.max_hp ?? 0,
                currentWp: character.current_wp ?? 0,
                maxWp: character.max_wp ?? 0,
                conditions: character.conditions ?? {},
              }
            : null,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error loading display state.';
    return jsonResponse(500, { error: message });
  }
});
