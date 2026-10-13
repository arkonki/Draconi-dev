import type { EncounterCombatant } from '../types/encounter';
import type { NewTableItem, TableItem } from '../types/virtualTable';

const baseName = (name: string) => name.replace(/ \(Act \d+\)$/, '').trim();

/**
 * Tokens still needed for an encounter: one per character and one per monster. A monster that acts twice a round
 * is two combatants but one creature, so it gets one token. Creatures that already have a token are skipped.
 */
export function tokensNeededForEncounter(combatants: EncounterCombatant[], items: TableItem[]): NewTableItem[] {
  const needed: NewTableItem[] = [];
  const seenCreatures = new Set<string>();
  for (const combatant of combatants) {
    if (combatant.character_id) {
      if (!items.some((item) => item.character_id === combatant.character_id)) {
        if (!needed.some((entry) => entry.character_id === combatant.character_id)) needed.push({ kind: 'character', character_id: combatant.character_id });
      }
      continue;
    }
    const label = baseName(combatant.display_name);
    const key = `${combatant.monster_id ?? 'none'}:${label.toLowerCase()}`;
    if (seenCreatures.has(key)) continue;
    seenCreatures.add(key);
    // Only an identically named token counts, so Goblin 2 is still added when only Goblin 1 is on the map.
    if (items.some((item) => item.kind !== 'character' && item.monster_id === combatant.monster_id && item.label.trim().toLowerCase() === label.toLowerCase())) continue;
    needed.push({ kind: 'monster', ...(combatant.monster_id ? { monster_id: combatant.monster_id } : {}), label });
  }
  return needed;
}
