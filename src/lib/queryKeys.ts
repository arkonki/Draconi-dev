export const QUERY_STALE_TIME = {
  live: 15_000,
  standard: 60_000,
  reference: 15 * 60_000,
} as const;

export const queryKeys = {
  parties: ['parties'] as const,
  party: (partyId: string | undefined | null) => ['party', partyId] as const,
  availableCharacters: ['availableCharacters'] as const,
  character: (characterId: string | undefined | null) => ['character', characterId] as const,
  messages: (partyId?: string | null) => (
    partyId ? ['messages', partyId] as const : ['messages'] as const
  ),
  campaignTime: (partyId: string | undefined | null) => ['campaign-time', partyId] as const,
  timeTracker: (partyId: string | undefined | null) => ['timeTracker', partyId] as const,
  encounters: (partyId: string | undefined | null) => ['allEncounters', partyId] as const,
  encounter: (encounterId: string | undefined | null) => ['encounterDetails', encounterId] as const,
  encounterCombatants: (encounterId: string | undefined | null) => ['encounterCombatants', encounterId] as const,
  activeEncounter: (partyId: string | undefined | null) => ['activeEncounter', partyId] as const,
  partyMaps: (partyId: string | undefined | null) => ['party-maps', partyId] as const,
  mapPins: (mapId: string | undefined | null) => ['map-pins', mapId] as const,
  mapDrawings: (mapId: string | undefined | null) => ['map-drawings', mapId] as const,
  displaySession: (partyId: string | undefined | null) => ['party-display-session', partyId] as const,
  displaySlots: (sessionId: string | undefined | null) => ['party-display-slots', sessionId] as const,
  projectorImages: (partyId: string | undefined | null) => ['party-projector-images', partyId] as const,
  gameItems: ['gameItems'] as const,
  monsters: ['allMonsters'] as const,
  heroicAbilities: ['heroicAbilities'] as const,
  magicSchools: ['magicSchools'] as const,
  professions: ['professions'] as const,
  bioData: ['bioData'] as const,
} as const;
