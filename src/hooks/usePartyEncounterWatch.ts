import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeChannel } from './useRealtimeChannel';
import { queryKeys } from '../lib/queryKeys';

/**
 * Tells the table when an encounter is created, started or ended, so it does not have to keep asking. Starting or
 * ending a fight is a change to the encounter row, which the party's change stream already carries.
 */
export function usePartyEncounterWatch(partyId: string, enabled = true) {
  const queryClient = useQueryClient();
  const bindings = useMemo(() => [
    { bindingId: 'party-encounters', event: '*' as const, schema: 'public' as const, table: 'encounters', filter: `party_id=eq.${partyId}` },
  ], [partyId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.activeEncounter(partyId), exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters(partyId), exact: true }),
    ]);
  };

  useRealtimeChannel({
    key: `table_encounters:${partyId}`,
    scope: `party:${partyId}`,
    bindings,
    enabled,
    // Only used while the live connection is down.
    fallbackRefetchMs: 15_000,
    onEvent: async (_bindingId, payload) => {
      // A fight writes to its encounter row on every hit, so only start, end, create and delete are worth a reload.
      const row = payload.new as { id?: string; status?: string } | undefined;
      if (payload.eventType === 'UPDATE' && row?.id) {
        const active = queryClient.getQueryData<{ id: string } | null>(queryKeys.activeEncounter(partyId));
        if ((active?.id === row.id) === (row.status === 'active')) return;
      }
      await refresh();
    },
    onReconnect: refresh,
  });
}
