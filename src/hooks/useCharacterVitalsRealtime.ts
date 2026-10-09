import { useMemo } from 'react';
import { useCharacterSheetStore } from '../stores/characterSheetStore';
import { useRealtimeChannel } from './useRealtimeChannel';

/** Keeps an open character sheet in step with hit points, death rolls and conditions changed by someone else. */
export function useCharacterVitalsRealtime(characterId: string | null, partyId: string | null) {
  const bindings = useMemo(() => (
    characterId
      ? [{
          bindingId: 'character-vitals',
          event: '*' as const,
          schema: 'public' as const,
          table: 'characters',
          filter: `id=eq.${characterId}`,
        }]
      : []
  ), [characterId]);

  useRealtimeChannel({
    key: `character_vitals:${characterId ?? 'inactive'}`,
    scope: partyId ? `party:${partyId}` : undefined,
    bindings,
    enabled: Boolean(characterId),
    fallbackRefetchMs: 0,
    onEvent: async () => { await useCharacterSheetStore.getState().refreshVitals(); },
    onReconnect: async () => { await useCharacterSheetStore.getState().refreshVitals(); },
  });
}
