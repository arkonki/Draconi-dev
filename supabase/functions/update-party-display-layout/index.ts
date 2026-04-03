import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  normalizeSlots,
  requireUser,
} from '../_shared/projector.ts';

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

  const { sessionId, slots: rawSlots } = await request.json().catch(() => ({ sessionId: null, slots: null }));
  if (!sessionId || typeof sessionId !== 'string') {
    return jsonResponse(400, { error: 'sessionId is required.' });
  }

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

    return jsonResponse(200, { slots: updatedSlots || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error updating display layout.';
    return jsonResponse(500, { error: message });
  }
});
