import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTableItems, fetchTableMaps, fetchTableState, normalizeTableItem } from '../lib/api/virtualTable';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { PartyMap } from '../types/atlas';
import type { TableItem, TableState } from '../types/virtualTable';

export const tableKeys = {
  state: (partyId: string) => ['table-state', partyId] as const,
  maps: (partyId: string) => ['party-maps', partyId] as const,
  items: (mapId: string | null | undefined) => ['table-items', mapId] as const,
};

/**
 * Everything the shared table needs: which scene is live, the party's maps, and the tokens of the scene being
 * looked at. `viewMapId` lets the GM look at a scene players are not on yet.
 */
export function useVirtualTable(partyId: string, gmViewMapId: string | null) {
  const queryClient = useQueryClient();

  const stateQuery = useQuery<TableState | null>({
    queryKey: tableKeys.state(partyId),
    queryFn: () => fetchTableState(partyId),
    staleTime: 5_000,
  });
  const mapsQuery = useQuery<PartyMap[]>({
    queryKey: tableKeys.maps(partyId),
    queryFn: () => fetchTableMaps(partyId),
    staleTime: 15_000,
  });
  const liveMapId = stateQuery.data?.map_id ?? null;
  const viewMapId = gmViewMapId ?? liveMapId;
  const itemsQuery = useQuery<TableItem[]>({
    queryKey: tableKeys.items(viewMapId),
    queryFn: () => fetchTableItems(viewMapId!),
    enabled: Boolean(viewMapId),
    staleTime: 2_000,
  });

  const bindings = useMemo(() => [
    { bindingId: 'table-state', event: '*' as const, schema: 'public' as const, table: 'party_table_state', filter: `party_id=eq.${partyId}` },
    { bindingId: 'table-items', event: '*' as const, schema: 'public' as const, table: 'table_items', filter: `party_id=eq.${partyId}` },
    { bindingId: 'table-maps', event: '*' as const, schema: 'public' as const, table: 'party_maps', filter: `party_id=eq.${partyId}` },
  ], [partyId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tableKeys.state(partyId), exact: true }),
      queryClient.invalidateQueries({ queryKey: ['table-items'] }),
      queryClient.invalidateQueries({ queryKey: tableKeys.maps(partyId), exact: true }),
    ]);
  }, [partyId, queryClient]);

  useRealtimeChannel({
    key: `virtual_table:${partyId}`,
    scope: `party:${partyId}`,
    bindings,
    enabled: true,
    fallbackRefetchMs: 20_000,
    onEvent: async (bindingId, payload) => {
      if (bindingId === 'table-items') {
        // Tokens move several times a second while someone drags, so apply the change straight to the cache
        // instead of asking the server for the whole list again each time.
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : null) as TableItem | null;
        const previous = (payload.old && Object.keys(payload.old).length ? payload.old : null) as Partial<TableItem> | null;
        const mapId = row?.map_id ?? previous?.map_id;
        const cached = mapId ? queryClient.getQueryData<TableItem[]>(tableKeys.items(mapId)) : undefined;
        if (mapId && cached) {
          if (payload.eventType === 'DELETE' && previous?.id) {
            queryClient.setQueryData<TableItem[]>(tableKeys.items(mapId), cached.filter((item) => item.id !== previous.id));
            return;
          }
          if (row && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
            const incoming = normalizeTableItem(row);
            const exists = cached.some((item) => item.id === incoming.id);
            queryClient.setQueryData<TableItem[]>(
              tableKeys.items(mapId),
              exists ? cached.map((item) => (item.id === incoming.id ? incoming : item)) : [...cached, incoming],
            );
            return;
          }
        }
        await queryClient.invalidateQueries({ queryKey: ['table-items'] });
        return;
      }
      if (bindingId === 'table-state') {
        // A raised revision means something was taken away from players, so the token list must be reloaded.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: tableKeys.state(partyId), exact: true }),
          queryClient.invalidateQueries({ queryKey: ['table-items'] }),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: tableKeys.maps(partyId), exact: true });
      }
    },
    onReconnect: refreshAll,
  });

  return {
    state: stateQuery.data ?? null,
    liveMapId,
    viewMapId,
    maps: mapsQuery.data ?? [],
    items: itemsQuery.data ?? [],
    loading: stateQuery.isLoading || mapsQuery.isLoading,
    error: (stateQuery.error || mapsQuery.error || itemsQuery.error) as Error | null,
    refreshAll,
  };
}
