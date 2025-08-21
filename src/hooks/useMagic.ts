import { useQuery } from '@tanstack/react-query';
import {
  fetchGeneralSpells,
  fetchSpellsBySchool,
  fetchMagicSchools
} from '../lib/api/magic';
import { Spell, MagicSchool } from '../types/magic';

/**
 * Hook to fetch spells.
 * If schoolId is null, fetches general spells.
 * If schoolId is provided, fetches spells for that specific school.
 * If schoolId is undefined, the query is disabled.
 *
 * @param schoolId - The ID of the magic school, or null for general spells.
 */
export function useSpells(schoolId: number | string | null | undefined) {
  const isGeneral = schoolId === null;
  const queryKey = ['spells', schoolId ?? 'general']; // Unique key: ['spells', 'general'] or ['spells', schoolId]

  const queryFn = () => {
    if (isGeneral) {
      return fetchGeneralSpells();
    } else if (schoolId !== undefined && schoolId !== null) {
      // schoolId has a value (number or string)
      return fetchSpellsBySchool(schoolId);
    }
    // Should not happen if 'enabled' is used correctly, but return empty array as fallback
    return Promise.resolve([]);
  };

  return useQuery<Spell[], Error>({
    queryKey: queryKey,
    queryFn: queryFn,
    // Enable the query only if schoolId is null (for general) or a valid ID (number/string)
    // It's disabled if schoolId is undefined.
    enabled: schoolId !== undefined,
    staleTime: 5 * 60 * 1000, // Cache spells for 5 minutes
  });
}

/**
 * Hook to fetch all magic schools.
 */
export function useMagicSchools() {
  return useQuery<MagicSchool[], Error>({
    queryKey: ['magicSchools'],
    queryFn: fetchMagicSchools,
    staleTime: 15 * 60 * 1000, // Cache schools for 15 minutes
  });
}
