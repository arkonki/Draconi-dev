import { useQuery } from '@tanstack/react-query';
import { fetchHeroicAbilities } from '../lib/api/abilities';
import { Ability } from '../types/character';

/**
 * Hook to fetch all heroic abilities.
 * Filtering based on character kin/profession should happen in the component using this hook.
 *
 * @param characterAbilityIds - Optional array of ability IDs the character already possesses (for potential future filtering/logic).
 */
export function useCharacterAbilities(characterAbilityIds?: (number | string)[]) {
  // The query key can include character-specific info if needed later,
  // but for now, we fetch all abilities.
  const queryKey = ['heroicAbilities', characterAbilityIds];

  const queryFn = async (): Promise<Ability[]> => {
    // Fetch all abilities
    const allAbilities = await fetchHeroicAbilities();

    // Potential future client-side filtering based on characterAbilityIds or other criteria
    // For now, return all fetched abilities.
    return allAbilities;
  };

  return useQuery<Ability[], Error>({
    queryKey: queryKey,
    queryFn: queryFn,
    staleTime: 15 * 60 * 1000, // Cache abilities for 15 minutes
    // Add other react-query options as needed (e.g., enabled, select)
  });
}
