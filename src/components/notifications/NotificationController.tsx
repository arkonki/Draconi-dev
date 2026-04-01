import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { useNotifications } from '../../contexts/useNotifications';

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

  useEffect(() => {
    if (!user) {
      return;
    }

    const partyCache = new Map<string, string>();
    const senderCache = new Map<string, string>();

    const resolvePartyName = async (partyId: string): Promise<string> => {
      const cached = partyCache.get(partyId);
      if (cached) {
        return cached;
      }

      const { data } = await supabase
        .from('parties')
        .select('id, name')
        .eq('id', partyId)
        .maybeSingle();

      const name = (data as PartySummary | null)?.name || 'Party Chat';
      partyCache.set(partyId, name);
      return name;
    };

    const resolveSenderName = async (userId: string): Promise<string> => {
      const cached = senderCache.get(userId);
      if (cached) {
        return cached;
      }

      const { data } = await supabase
        .from('users')
        .select('username, first_name, last_name')
        .eq('id', userId)
        .maybeSingle();

      const senderName = formatSenderName((data as SenderSummary | null) ?? null);
      senderCache.set(userId, senderName);
      return senderName;
    };

    const channel = supabase
      .channel('global-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as MessagePayload;

          if (newMessage.user_id === user.id) {
            return;
          }

          if (isViewingActivePartyChat(newMessage.party_id)) {
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
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'encounters',
        },
        async (payload) => {
          const encounter = payload.new as EncounterPayload;

          if (encounter.status !== 'active') {
            return;
          }

          if (isViewingActivePartyEncounter(encounter.party_id)) {
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
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'encounters',
        },
        async (payload) => {
          const previousEncounter = payload.old as EncounterPayload | null;
          const encounter = payload.new as EncounterPayload;

          if (encounter.status !== 'active' || previousEncounter?.status === 'active') {
            return;
          }

          if (isViewingActivePartyEncounter(encounter.party_id)) {
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
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'party_members',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          playSound('notification');

          await sendDesktopNotification({
            title: 'Party Invite',
            body: 'You have been added to a new adventure party!',
            type: 'invite',
            url: '/adventure-party',
            tag: 'party-invite',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, playSound, sendDesktopNotification]);

  return null;
}
