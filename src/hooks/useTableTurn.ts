import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchActiveEncounterForParty, fetchEncounterCombatants } from '../lib/api/encounters';
import { queryKeys } from '../lib/queryKeys';
import { buildTableTurn, type TableTurn } from '../lib/tableTurn';
import { useEncounterRealtime } from './useEncounterRealtime';
import type { TableItem } from '../types/virtualTable';

/** Whose turn it is in the active encounter, matched to the tokens on the table. */
export function useTableTurn(partyId: string, items: TableItem[], isGm: boolean): TableTurn & { round: number | null; active: boolean } {
  const { data: encounter } = useQuery({
    queryKey: queryKeys.activeEncounter(partyId),
    queryFn: () => fetchActiveEncounterForParty(partyId),
    // An encounter starting or ending is not announced on its own channel, so look now and then.
    refetchInterval: 10_000,
  });
  const encounterId = encounter?.id ?? null;
  useEncounterRealtime(encounterId, partyId);

  const { data: combatants = [] } = useQuery({
    queryKey: queryKeys.encounterCombatants(encounterId),
    queryFn: () => fetchEncounterCombatants(encounterId!),
    enabled: Boolean(encounterId),
  });

  const turn = useMemo(() => buildTableTurn(encounterId ? combatants : [], items, isGm), [combatants, encounterId, items, isGm]);
  return { ...turn, round: encounter?.current_round ?? null, active: Boolean(encounterId) };
}
