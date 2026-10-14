import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchActiveEncounterForParty, fetchEncounterCombatants } from '../lib/api/encounters';
import { queryKeys } from '../lib/queryKeys';
import { buildTableTurn, type TableTurn } from '../lib/tableTurn';
import { useEncounterRealtime } from './useEncounterRealtime';
import { usePartyEncounterWatch } from './usePartyEncounterWatch';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

/** Whose turn it is in the active encounter, matched to the tokens on the table. */
export function useTableTurn(partyId: string, items: TableItem[], isGm: boolean): TableTurn & { round: number | null; active: boolean; combatants: EncounterCombatant[] } {
  const { data: encounter } = useQuery({
    queryKey: queryKeys.activeEncounter(partyId),
    queryFn: () => fetchActiveEncounterForParty(partyId),
    // The encounter watch below announces a fight starting or ending; this slow look is only a safety net.
    refetchInterval: 90_000,
  });
  usePartyEncounterWatch(partyId);
  const encounterId = encounter?.id ?? null;
  useEncounterRealtime(encounterId, partyId);

  const { data: combatants = [] } = useQuery({
    queryKey: queryKeys.encounterCombatants(encounterId),
    queryFn: () => fetchEncounterCombatants(encounterId!),
    enabled: Boolean(encounterId),
  });

  const turn = useMemo(() => buildTableTurn(encounterId ? combatants : [], items, isGm), [combatants, encounterId, items, isGm]);
  return { ...turn, round: encounter?.current_round ?? null, active: Boolean(encounterId), combatants: encounterId ? combatants : [] };
}
