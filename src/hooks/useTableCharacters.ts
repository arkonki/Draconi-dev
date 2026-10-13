import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useRealtimeChannel } from './useRealtimeChannel';

export interface QuickCharacter {
  id: string;
  user_id: string;
  name: string;
  portrait_url: string | null;
  current_hp: number;
  max_hp: number;
  current_wp: number;
  max_wp: number;
  conditions: Record<string, boolean>;
  death_rolls_passed: number;
  death_rolls_failed: number;
  is_rallied: boolean;
}

const COLUMNS = 'id, user_id, name, portrait_url, current_hp, max_hp, current_wp, max_wp, conditions, death_rolls_passed, death_rolls_failed, is_rallied';

/** Live hit points, will, conditions and death rolls for the party's characters, for the bar at the bottom of the table. */
export function useTableCharacters(partyId: string, characterIds: string[]) {
  const queryClient = useQueryClient();
  const key = useMemo(() => ['table-characters', partyId, [...characterIds].sort().join(',')] as const, [partyId, characterIds]);

  const query = useQuery<QuickCharacter[]>({
    queryKey: key,
    enabled: characterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('characters').select(COLUMNS).in('id', characterIds);
      if (error) throw new Error(error.message || 'Could not load the characters');
      return (data ?? []) as QuickCharacter[];
    },
    staleTime: 5_000,
  });

  const bindings = useMemo(() => [
    { bindingId: 'characters', event: '*' as const, schema: 'public' as const, table: 'characters', filter: `party_id=eq.${partyId}` },
  ], [partyId]);

  useRealtimeChannel({
    key: `table_characters:${partyId}`,
    scope: `party:${partyId}`,
    bindings,
    enabled: characterIds.length > 0,
    fallbackRefetchMs: 30_000,
    onEvent: async () => { await queryClient.invalidateQueries({ queryKey: ['table-characters', partyId] }); },
    onReconnect: async () => { await queryClient.invalidateQueries({ queryKey: ['table-characters', partyId] }); },
  });

  return query.data ?? [];
}
