import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  corsHeaders,
  createAdminClient,
  createDisplayToken,
  getDefaultSlots,
  getSessionExpiryIso,
  jsonResponse,
  loadLatestSlots,
  requireUser,
  sha256Hex,
  verifyPartyOwner,
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
        expires_at: expiresAt,
      })
      .select('id, party_id, expires_at, revoked_at, created_at, last_seen_at')
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
