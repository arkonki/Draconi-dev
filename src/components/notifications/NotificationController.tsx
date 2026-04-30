import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { useNotifications } from '../../contexts/useNotifications';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';

type MessagePayload = {
  id: string;
  party_id: string;
  user_id: string;
  content: string;
};

type EncounterPayload = {
  id: string;
  party_id: string;
  name: string;
  status: 'planning' | 'active' | 'completed';
  current_round: number;
};

type PartySummary = {
  id: string;
  name: string;
};

type SenderSummary = {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

const buildPartyChatUrl = (partyId: string, messageId?: string) =>
  messageId ? `/party/${partyId}?tab=chat&messageId=${messageId}` : `/party/${partyId}?tab=chat`;
const buildPartyEncounterUrl = (partyId: string) => `/party/${partyId}?tab=encounter`;

function isViewingActivePartyChat(partyId: string): boolean {
  if (document.visibilityState !== 'visible') {
    return false;
  }

  const rawContext = sessionStorage.getItem('active_chat_context');
  if (!rawContext) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawContext) as { partyId?: string; active?: boolean };
    return parsed.partyId === partyId && parsed.active === true;
  } catch {
    return false;
  }
}

function isViewingActivePartyEncounter(partyId: string): boolean {
  if (document.visibilityState !== 'visible') {
    return false;
  }

  const rawContext = sessionStorage.getItem('active_encounter_context');
  if (!rawContext) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawContext) as { partyId?: string; active?: boolean };
    return parsed.partyId === partyId && parsed.active === true;
  } catch {
    return false;
  }
}

function formatSenderName(sender: SenderSummary | null): string {
  if (!sender) {
    return 'Someone';
  }

  const fullName = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim();
  return fullName || sender.username || 'Someone';
}

function cleanMessagePreview(content: string): string {
  return content
    .replace(/<<<[^>]+>>>/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateBody(body: string): string {
  return body.length > 120 ? `${body.substring(0, 120)}...` : body;
}

function buildNotificationCopy(message: MessagePayload, senderName: string, partyName: string) {
  const pokeMatch = message.content.match(/<<<POKE:([^>]+)>>>/);
  if (pokeMatch) {
    return {
      title: `${senderName} poked you in ${partyName}`,
      body: 'Open party chat to respond.',
    };
  }

  const noteMatch = message.content.match(/<<<NOTE:([^:]+):([^>]+)>>>/);
  if (noteMatch) {
    return {
      title: `${senderName} shared a note in ${partyName}`,
      body: noteMatch[2],
    };
  }

  const compendiumMatch = message.content.match(/<<<COMPENDIUM:([^:]+):([^>]+)>>>/);
  if (compendiumMatch) {
    return {
      title: `${senderName} shared a compendium entry in ${partyName}`,
      body: compendiumMatch[2],
    };
  }

  if (message.content.startsWith('🎲')) {
    return {
      title: `${senderName} rolled dice in ${partyName}`,
      body: truncateBody(cleanMessagePreview(message.content)),
    };
  }

  return {
    title: `${senderName} in ${partyName}`,
    body: truncateBody(cleanMessagePreview(message.content) || 'Sent a new message.'),
  };
}

function buildEncounterNotificationCopy(encounter: EncounterPayload, partyName: string) {
  const round = encounter.current_round || 1;
  const encounterName = encounter.name?.trim();

  return {
    title: `Combat started in ${partyName}`,
    body: encounterName
      ? `${encounterName} is now active. Round ${round} is underway.`
      : `A combat encounter is now active. Round ${round} is underway.`,
  };
}

export function NotificationController() {
  const { user } = useAuth();
  const { playSound, sendDesktopNotification } = useNotifications();
  const partyCacheRef = useRef(new Map<string, string>());
  const senderCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    partyCacheRef.current.clear();
    senderCacheRef.current.clear();
  }, [user?.id]);

  const resolvePartyName = async (partyId: string): Promise<string> => {
    const cached = partyCacheRef.current.get(partyId);
    if (cached) {
      return cached;
    }

    const { data } = await supabase
      .from('parties')
      .select('id, name')
      .eq('id', partyId)
      .maybeSingle();

    const name = (data as PartySummary | null)?.name || 'Party Chat';
    partyCacheRef.current.set(partyId, name);
    return name;
  };

  const resolveSenderName = async (userId: string): Promise<string> => {
    const cached = senderCacheRef.current.get(userId);
    if (cached) {
      return cached;
    }

    const { data } = await supabase
      .from('users')
      .select('username, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    const senderName = formatSenderName((data as SenderSummary | null) ?? null);
    senderCacheRef.current.set(userId, senderName);
    return senderName;
  };

  const notificationBindings = useMemo(() => (
    user
      ? [
          {
            bindingId: 'message-insert',
            event: 'INSERT' as const,
            schema: 'public' as const,
            table: 'messages',
          },
          {
            bindingId: 'encounter-insert',
            event: 'INSERT' as const,
            schema: 'public' as const,
            table: 'encounters',
          },
          {
            bindingId: 'encounter-update',
            event: 'UPDATE' as const,
            schema: 'public' as const,
            table: 'encounters',
          },
          {
            bindingId: 'party-member-insert',
            event: 'INSERT' as const,
            schema: 'public' as const,
            table: 'party_members',
            filter: `user_id=eq.${user.id}`,
          },
        ]
      : []
  ), [user]);

  useRealtimeChannel({
    key: 'global-notifications',
    bindings: notificationBindings,
    enabled: Boolean(user),
    reportToSync: false,
    fallbackRefetchMs: 30000,
    onEvent: async (bindingId, payload) => {
      if (!user) {
        return;
      }

      if (bindingId === 'message-insert') {
        const newMessage = payload.new as MessagePayload;

        if (newMessage.user_id === user.id || isViewingActivePartyChat(newMessage.party_id)) {
          return;
        }

        playSound('notification');

        const targetUrl = buildPartyChatUrl(newMessage.party_id, newMessage.id);
        const [partyName, senderName] = await Promise.all([
          resolvePartyName(newMessage.party_id),
          resolveSenderName(newMessage.user_id),
        ]);

        const pokeMatch = newMessage.content.match(/<<<POKE:([^>]+)>>>/);
        if (pokeMatch) {
          const targetId = pokeMatch[1];
          if (targetId === user.id) {
            await sendDesktopNotification({
              title: `${senderName} poked you in ${partyName}`,
              body: 'Open party chat to respond.',
              type: 'message',
              url: targetUrl,
              tag: `party-chat-${newMessage.party_id}`,
            });
          }
          return;
        }

        const { title, body } = buildNotificationCopy(newMessage, senderName, partyName);
        await sendDesktopNotification({
          title,
          body,
          type: 'message',
          url: targetUrl,
          tag: `party-chat-${newMessage.party_id}`,
        });
        return;
      }

      if (bindingId === 'party-member-insert') {
        playSound('notification');
        await sendDesktopNotification({
          title: 'Party Invite',
          body: 'You have been added to a new adventure party!',
          type: 'invite',
          url: '/adventure-party',
          tag: 'party-invite',
        });
        return;
      }

      const encounter = payload.new as EncounterPayload;
      const previousEncounter = bindingId === 'encounter-update' ? payload.old as EncounterPayload | null : null;

      if (encounter.status !== 'active' || previousEncounter?.status === 'active' || isViewingActivePartyEncounter(encounter.party_id)) {
        return;
      }

      playSound('notification');
      const partyName = await resolvePartyName(encounter.party_id);
      const { title, body } = buildEncounterNotificationCopy(encounter, partyName);

      await sendDesktopNotification({
        title,
        body,
        type: 'encounter',
        url: buildPartyEncounterUrl(encounter.party_id),
        tag: `party-encounter-${encounter.party_id}`,
      });
    },
  });

  return null;
}
