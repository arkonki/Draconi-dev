import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders, createAdminClient, jsonResponse, requireUser } from '../_shared/projector.ts';

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
      .select('id, created_by')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; created_by: string }>();

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message });
    }

    if (!session || session.created_by !== authResult.user.id) {
      return jsonResponse(403, { error: 'Only the session owner can revoke the display session.' });
    }

    const { error: revokeError } = await adminClient
      .from('party_display_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (revokeError) {
      return jsonResponse(500, { error: revokeError.message });
    }

    return jsonResponse(200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error revoking display session.';
    return jsonResponse(500, { error: message });
  }
});
