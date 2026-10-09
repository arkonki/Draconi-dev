export const CONDITIONS = [
  { key: 'exhausted', label: 'Exhausted', attribute: 'STR' },
  { key: 'sickly', label: 'Sickly', attribute: 'CON' },
  { key: 'dazed', label: 'Dazed', attribute: 'AGL' },
  { key: 'angry', label: 'Angry', attribute: 'INT' },
  { key: 'scared', label: 'Scared', attribute: 'WIL' },
  { key: 'disheartened', label: 'Disheartened', attribute: 'CHA' },
] as const;

export type ConditionKey = typeof CONDITIONS[number]['key'];

/** Active conditions of a player character, e.g. ["Dazed", "Scared"]. */
export function activeConditionLabels(conditions: Record<string, boolean> | undefined | null): string[] {
  return CONDITIONS.filter(({ key }) => conditions?.[key]).map(({ label }) => label);
}


