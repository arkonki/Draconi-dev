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

    console.log(`Setting up realtime subscription for encounter: ${encounterId}`);

    const channel = supabase
      .channel(`encounter_room:${encounterId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to ALL events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'encounters',
          filter: `id=eq.${encounterId}`,
        },
        (payload) => {
          console.log('Realtime: Encounter updated', payload);
          // Immediately invalidate to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['encounterDetails', encounterId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'encounter_combatants',
          filter: `encounter_id=eq.${encounterId}`,
        },
        (payload) => {
          console.log('Realtime: Combatants updated', payload);
          // Immediately invalidate to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['encounterCombatants', encounterId] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Connected to realtime for encounter ${encounterId}`);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error(`Realtime connection error for encounter ${encounterId}`);
        }
        if (status === 'TIMED_OUT') {
          console.error(`Realtime connection timed out for encounter ${encounterId}`);
        }
      });

    return () => {
      console.log(`Cleaning up realtime for encounter ${encounterId}`);
      supabase.removeChannel(channel);
    };
  }, [encounterId, queryClient]);
}
