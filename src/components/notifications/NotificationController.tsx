import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

export function NotificationController() {
  const { user } = useAuth();
  const { playSound, sendDesktopNotification } = useNotifications();

  useEffect(() => {
    if (!user) return;

    // Create a single channel for all notifications
    const channel = supabase
      .channel('global-notifications')
      
      // --- LISTENER 1: CHAT MESSAGES ---
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;

          // 1. Don't notify if I sent the message myself
          if (newMessage.user_id === user.id) return;

          // 2. Play Sound (You can make this conditional based on type if you add more sounds)
          playSound('notification');

          // 3. Prepare Notification Text
          let title = 'New Message';
          let body = newMessage.content;
          
          // --- PARSING SPECIAL TAGS ---

          // A. Check for Poke: <<<POKE:TARGET_ID>>>
          const pokeMatch = newMessage.content.match(/<<<POKE:([^>]+)>>>/);
          
          if (pokeMatch) {
            const targetId = pokeMatch[1];
            
            // Only notify me if I am the one being poked
            if (targetId === user.id) {
               await sendDesktopNotification(
                 '👉 YOU WERE POKED!',
                 'Someone is trying to get your attention.',
                 'message'
               );
            }
            // If I'm not the target, I don't need a desktop notification for a poke
            return; 
          }

          // B. Check for Note Tag: <<<NOTE:ID:TITLE>>>
          const noteMatch = newMessage.content.match(/<<<NOTE:([^:]+):([^>]+)>>>/);
          
          // C. Check for Dice Roll
          const isRoll = newMessage.content.startsWith('🎲');

          if (noteMatch) {
            title = 'New Note Shared';
            // Clean up body: Remove tag, just show the description
            body = newMessage.content.replace(/<<<NOTE:[^>]+>>>/, '').trim();
          } else if (isRoll) {
            title = 'Dice Roll';
            // Clean up common markdown from roll to make it readable in plain text
            body = newMessage.content.replace(/\*\*/g, '').replace('🎲', '').trim();
          }

          // Truncate long bodies for the popup
          if (body.length > 100) {
            body = body.substring(0, 100) + '...';
          }

          // 4. Show Desktop Popup
          await sendDesktopNotification(
            title,
            body,
            'message'
          );
        }
      )

      // --- LISTENER 2: PARTY INVITES ---
      // Listen for new rows in party_members assigned to me
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'party_members', 
          filter: `user_id=eq.${user.id}` // Only listen for invites sent TO ME
        },
        async (payload) => {
          // Verify status if your schema uses it (e.g. status === 'pending')
          // const newMemberRow = payload.new as any;
          // if (newMemberRow.status !== 'pending') return;

          playSound('notification');
          
          await sendDesktopNotification(
            'Party Invite',
            'You have been added to a new adventure party!',
            'invite'
          );
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, playSound, sendDesktopNotification]);

  return null; // Headless component
}