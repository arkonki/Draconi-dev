import { tokenFor } from './tableTurn';
import { FEAR_STATUS_EFFECT, POISONED_STATUS_EFFECT } from './encounterStatusEffects';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

/** The six Dragonbane conditions a character can have. */
export const CHARACTER_CONDITIONS = ['exhausted', 'sickly', 'dazed', 'angry', 'scared', 'disheartened'] as const;
/** What the combat page lets a GM put on a monster. */
export const MONSTER_CONDITIONS = [POISONED_STATUS_EFFECT, FEAR_STATUS_EFFECT] as const;

const baseName = (name: string) => name.replace(/ \(Act \d+\)$/, '').trim().toLowerCase();

/** The combatant in the running encounter that a token stands for, or null when it is not in the fight. */
export function combatantForToken(item: TableItem, combatants: readonly EncounterCombatant[], items: readonly TableItem[]): EncounterCombatant | null {
  if (item.character_id) return combatants.find((combatant) => combatant.character_id === item.character_id) ?? null;
  return combatants.find((combatant) => !combatant.character_id && tokenFor(combatant, items as TableItem[])?.id === item.id) ?? null;
}

/** A monster that acts twice a round is two combatants; a change to its hit points or effects applies to both. */
export function siblingCombatants(target: EncounterCombatant, combatants: readonly EncounterCombatant[]): EncounterCombatant[] {
  if (!target.monster_id) return [target];
  return combatants.filter((combatant) => combatant.monster_id === target.monster_id && baseName(combatant.display_name) === baseName(target.display_name));
}

/** The damage number the combat rules expect for a change in hit points: negative heals. */
export const damageForChange = (delta: number) => -Math.trunc(delta);
