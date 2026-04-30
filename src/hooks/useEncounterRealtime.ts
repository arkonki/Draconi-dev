import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useRealtimeChannel } from './useRealtimeChannel';

export function useEncounterRealtime(encounterId: string | null, partyId: string | null) {
  const queryClient = useQueryClient();
  const encounterBindings = useMemo(() => (
    encounterId
      ? [
          {
            bindingId: 'encounter',
            event: '*' as const,
            schema: 'public' as const,
            table: 'encounters',
            filter: `id=eq.${encounterId}`,
          },
          {
            bindingId: 'combatants',
            event: '*' as const,
            schema: 'public' as const,
            table: 'encounter_combatants',
            filter: `encounter_id=eq.${encounterId}`,
          },
        ]
      : []
  ), [encounterId]);

  useRealtimeChannel({
    key: `encounter_room:${encounterId ?? 'inactive'}`,
    scope: partyId ? `party:${partyId}` : undefined,
    bindings: encounterBindings,
    enabled: Boolean(encounterId),
    fallbackRefetchMs: 15000,
    onEvent: async (bindingId) => {
      if (!encounterId) {
        return;
      }

      if (bindingId === 'encounter') {
        await queryClient.invalidateQueries({ queryKey: ['encounterDetails', encounterId] });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['encounterCombatants', encounterId] });
    },
    onReconnect: async () => {
      if (!encounterId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounterDetails', encounterId] }),
        queryClient.invalidateQueries({ queryKey: ['encounterCombatants', encounterId] }),
      ]);
    },
  });
}
