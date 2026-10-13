import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllEncountersForParty, fetchEncounterCombatants } from '../lib/api/encounters';
import { queryKeys } from '../lib/queryKeys';
import { useEncounterRealtime } from './useEncounterRealtime';
import { tokensNeededForEncounter } from '../lib/tableEncounter';
import type { NewTableItem, TableItem } from '../types/virtualTable';

/** The encounter being prepared or run (a running one wins), and the tokens it still needs on the table. GM only. */
export function useTableEncounter(partyId: string, items: TableItem[], enabled: boolean) {
  const encounters = useQuery({
    queryKey: queryKeys.encounters(partyId),
    queryFn: () => fetchAllEncountersForParty(partyId),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const encounter = useMemo(
    () => encounters.data?.find((entry) => entry.status === 'active') ?? encounters.data?.find((entry) => entry.status === 'planning') ?? null,
    [encounters.data],
  );
  const encounterId = encounter?.id ?? null;
  useEncounterRealtime(enabled ? encounterId : null, partyId);

  const combatants = useQuery({
    queryKey: queryKeys.encounterCombatants(encounterId),
    queryFn: () => fetchEncounterCombatants(encounterId!),
    enabled: enabled && Boolean(encounterId),
  });

  const missing: NewTableItem[] = useMemo(
    () => (combatants.data ? tokensNeededForEncounter(combatants.data, items) : []),
    [combatants.data, items],
  );

  return {
    encounter: encounter ? { id: encounter.id, name: encounter.name, status: encounter.status } : null,
    combatantCount: combatants.data?.length ?? 0,
    missing,
  };
}
