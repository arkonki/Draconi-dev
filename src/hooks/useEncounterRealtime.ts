import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useEncounterRealtime(encounterId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!encounterId) {
      return;
    }

    const channels: RealtimeChannel[] = [];

    // Channel for the encounter itself (e.g., status, current_round changes)
    const encounterChannel = supabase
      .channel(`encounter:${encounterId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'encounters',
          filter: `id=eq.${encounterId}`,
        },
        (payload) => {
          console.log('Encounter updated:', payload);
          queryClient.invalidateQueries({ queryKey: ['encounterDetails', encounterId] });
          // Also invalidate list of encounters for the party if the status changes significantly
          // queryClient.invalidateQueries({ queryKey: ['encounters', payload.old?.party_id] });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to encounter:${encounterId}`);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Encounter channel error for ${encounterId}:`, err);
        }
      });
    channels.push(encounterChannel);

    // Channel for combatants in this encounter
    const combatantsChannel = supabase
      .channel(`encounter_combatants:${encounterId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'encounter_combatants',
          filter: `encounter_id=eq.${encounterId}`,
        },
        (payload) => {
          console.log('Encounter combatants changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['encounterCombatants', encounterId] });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to encounter_combatants:${encounterId}`);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Encounter combatants channel error for ${encounterId}:`, err);
        }
      });
    channels.push(combatantsChannel);
    
		return () => {
      console.log(`Unsubscribing from encounter channels for ${encounterId}`);
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [encounterId, queryClient]);
}
