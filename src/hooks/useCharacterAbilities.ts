import { useQuery } from '@tanstack/react-query';
import { fetchHeroicAbilities } from '../lib/api/abilities';
import { Ability } from '../types/character';
import { QUERY_STALE_TIME, queryKeys } from '../lib/queryKeys';

/**
 * Hook to fetch all heroic abilities.
 * Filtering based on character kin/profession should happen in the component using this hook.
 *
 * @param characterAbilityIds - Optional array of ability IDs the character already possesses (for potential future filtering/logic).
 */
export function useCharacterAbilities() {
  return useQuery<Ability[], Error>({
    // The server response is the same for every character. Character-specific
    // filtering belongs in the consuming component so all sheets share one fetch.
    queryKey: queryKeys.heroicAbilities,
    queryFn: fetchHeroicAbilities,
    staleTime: QUERY_STALE_TIME.reference,
  });
}
