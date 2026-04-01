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

const buildPartyChatUrl = (partyId: string) => `/party/${partyId}?tab=chat`;

function truncateBody(body: string): string {
  return body.length > 100 ? `${body.substring(0, 100)}...` : body;
}

export function NotificationController() {
  const { user } = useAuth();
  const { playSound, sendDesktopNotification } = useNotifications();

  useEffect(() => {
    if (!user) {
      return;
    }

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

          playSound('notification');

          let title = 'New Message';
          let body = newMessage.content;
          const targetUrl = buildPartyChatUrl(newMessage.party_id);

          const pokeMatch = newMessage.content.match(/<<<POKE:([^>]+)>>>/);
          if (pokeMatch) {
            const targetId = pokeMatch[1];
            if (targetId === user.id) {
              await sendDesktopNotification({
                title: '👉 YOU WERE POKED!',
                body: 'Someone is trying to get your attention.',
                type: 'message',
                url: targetUrl,
                tag: `party-chat-${newMessage.party_id}`,
              });
            }
            return;
          }

          const noteMatch = newMessage.content.match(/<<<NOTE:([^:]+):([^>]+)>>>/);
          const compendiumMatch = newMessage.content.match(/<<<COMPENDIUM:([^:]+):([^>]+)>>>/);
          const isRoll = newMessage.content.startsWith('🎲');

          if (noteMatch) {
            title = 'New Note Shared';
            body = newMessage.content.replace(/<<<NOTE:[^>]+>>>/, '').trim();
          } else if (compendiumMatch) {
            title = 'Compendium Entry Shared';
            body = newMessage.content.replace(/<<<COMPENDIUM:[^>]+>>>/, '').trim();
          } else if (isRoll) {
            title = 'Dice Roll';
            body = newMessage.content.replace(/\*\*/g, '').replace('🎲', '').trim();
          }

          await sendDesktopNotification({
            title,
            body: truncateBody(body),
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
