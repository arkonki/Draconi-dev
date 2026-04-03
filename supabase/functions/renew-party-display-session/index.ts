import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders, createAdminClient, getSessionExpiryIso, jsonResponse, requireUser } from '../_shared/projector.ts';

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

  const { sessionId } = await request.json().catch(() => ({ sessionId: null }));
  if (!sessionId || typeof sessionId !== 'string') {
    return jsonResponse(400, { error: 'sessionId is required.' });
  }

  try {
    const adminClient = createAdminClient();
    const { data: session, error: sessionError } = await adminClient
      .from('party_display_sessions')
      .select('id, created_by, revoked_at')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; created_by: string; revoked_at: string | null }>();

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message });
    }

    if (!session || session.created_by !== authResult.user.id) {
      return jsonResponse(403, { error: 'Only the session owner can renew the display session.' });
    }

    if (session.revoked_at) {
      return jsonResponse(400, { error: 'Revoked sessions cannot be renewed.' });
    }

    const expiresAt = getSessionExpiryIso();
    const { data: renewedSession, error: renewError } = await adminClient
      .from('party_display_sessions')
      .update({ expires_at: expiresAt })
      .eq('id', sessionId)
      .select('id, party_id, expires_at, revoked_at, created_at, last_seen_at')
      .single();

    if (renewError || !renewedSession) {
      return jsonResponse(500, { error: renewError?.message || 'Failed to renew display session.' });
    }

    return jsonResponse(200, { session: renewedSession });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error renewing display session.';
    return jsonResponse(500, { error: message });
  }
});
