import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ChatMessageRow = {
  id: string;
  party_id: string;
  user_id: string;
  content: string;
};

type PartyRow = {
  id: string;
  name: string;
  created_by: string | null;
};

type PartyMemberRow = {
  user_id: string | null;
};

type UserRow = {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

type NotificationSettingsRow = {
  user_id: string;
  desktop_new_message: boolean;
};

type PushSubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: string | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildSenderName(user: UserRow | null, fallback = 'Someone'): string {
  if (!user) {
    return fallback;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return fullName || user.username || fallback;
}

function stripFormatting(text: string): string {
  return text
    .replace(/<<<[^>]+>>>/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNotificationBody(message: string, senderName: string): string {
  const pokeMatch = message.match(/<<<POKE:([^>]+)>>>/);
  if (pokeMatch) {
    return `${senderName} poked you in party chat.`;
  }

  const noteMatch = message.match(/<<<NOTE:([^:]+):([^>]+)>>>/);
  if (noteMatch) {
    return `${senderName} shared note "${noteMatch[2]}".`;
  }

  const compendiumMatch = message.match(/<<<COMPENDIUM:([^:]+):([^>]+)>>>/);
  if (compendiumMatch) {
    return `${senderName} shared "${compendiumMatch[2]}" from the compendium.`;
  }

  if (message.startsWith('🎲')) {
    return `${senderName} posted a dice roll.`;
  }

  const cleaned = stripFormatting(message);
  if (!cleaned) {
    return `${senderName} sent a new message.`;
  }

  return cleaned.length > 140 ? `${cleaned.slice(0, 140)}...` : cleaned;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(500, { error: 'Supabase environment variables are missing.' });
  }

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse(500, { error: 'VAPID environment variables are missing.' });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header.' });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(401, { error: 'Unauthorized.' });
  }

  const { messageId } = await request.json().catch(() => ({ messageId: null }));
  if (!messageId || typeof messageId !== 'string') {
    return jsonResponse(400, { error: 'messageId is required.' });
  }

  const { data: message, error: messageError } = await adminClient
    .from('messages')
    .select('id, party_id, user_id, content')
    .eq('id', messageId)
    .single<ChatMessageRow>();

  if (messageError || !message) {
    return jsonResponse(404, { error: 'Message not found.' });
  }

  if (message.user_id !== user.id) {
    return jsonResponse(403, { error: 'You can only dispatch push for your own message.' });
  }

  const { data: party, error: partyError } = await adminClient
    .from('parties')
    .select('id, name, created_by')
    .eq('id', message.party_id)
    .single<PartyRow>();

  if (partyError || !party) {
    return jsonResponse(404, { error: 'Party not found.' });
  }

  const { data: members, error: membersError } = await adminClient
    .from('party_members')
    .select('user_id')
    .eq('party_id', message.party_id)
    .returns<PartyMemberRow[]>();

  if (membersError) {
    return jsonResponse(500, { error: membersError.message });
  }

  const recipientIds = Array.from(
    new Set(
      [...(members || []).map((member) => member.user_id).filter(Boolean), party.created_by]
        .filter((recipientId): recipientId is string => Boolean(recipientId) && recipientId !== user.id)
    )
  );

  if (recipientIds.length === 0) {
    return jsonResponse(200, { sent: 0, skipped: 'no-recipients' });
  }

  const { data: senderProfile } = await adminClient
    .from('users')
    .select('username, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle<UserRow>();

  const { data: settingsRows, error: settingsError } = await adminClient
    .from('user_notification_settings')
    .select('user_id, desktop_new_message')
    .in('user_id', recipientIds)
    .returns<NotificationSettingsRow[]>();

  if (settingsError) {
    return jsonResponse(500, { error: settingsError.message });
  }

  const desktopDisabledRecipients = new Set(
    (settingsRows || [])
      .filter((row) => row.desktop_new_message === false)
      .map((row) => row.user_id)
  );

  const allowedRecipients = recipientIds.filter((recipientId) => !desktopDisabledRecipients.has(recipientId));
  if (allowedRecipients.length === 0) {
    return jsonResponse(200, { sent: 0, skipped: 'desktop-disabled' });
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, expiration_time')
    .in('user_id', allowedRecipients)
    .returns<PushSubscriptionRow[]>();

  if (subscriptionsError) {
    return jsonResponse(500, { error: subscriptionsError.message });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse(200, { sent: 0, skipped: 'no-subscriptions' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const senderName = buildSenderName(senderProfile, 'Someone');
  const payload = JSON.stringify({
    title: `${senderName} in ${party.name}`,
    body: buildNotificationBody(message.content, senderName),
    tag: `party-chat-${party.id}`,
    url: `/party/${party.id}?tab=chat`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: `/party/${party.id}?tab=chat` },
  });

  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expiration_time
            ? new Date(subscription.expiration_time).getTime()
            : null,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload
      );

      sent += 1;
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : undefined;

      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      } else {
        console.error('Push delivery failed:', error);
      }
    }
  }

  return jsonResponse(200, { sent, total: subscriptions.length });
});
