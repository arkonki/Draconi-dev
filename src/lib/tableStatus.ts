import { tokenFor } from './tableTurn';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

/** What a token shows about its creature: a hit-point bar, condition badges, and whether it is down. */
export interface TokenStatus {
  hp: number;
  maxHp: number;
  /** Names of the conditions or effects, e.g. "exhausted". */
  conditions: string[];
  down: boolean;
}

export interface VitalsSource {
  id: string;
  current_hp: number;
  max_hp: number;
  conditions?: Record<string, boolean> | null;
}

const activeConditions = (conditions: Record<string, boolean> | null | undefined) =>
  Object.entries(conditions ?? {}).filter(([, on]) => on === true).map(([name]) => name);

/**
 * Status for the tokens on the table. Characters are shown to everyone, as their hit points are already on
 * the party's bar. Monsters and NPCs come from the running encounter and only for the GM, so players never see
 * how hurt a creature is.
 */
export function buildTokenStatuses(
  items: readonly TableItem[],
  characters: readonly VitalsSource[],
  combatants: readonly EncounterCombatant[],
  isGm: boolean,
): Map<string, TokenStatus> {
  const statuses = new Map<string, TokenStatus>();
  const byCharacter = new Map(characters.map((character) => [character.id, character]));
  for (const item of items) {
    if (!item.character_id) continue;
    const character = byCharacter.get(item.character_id);
    if (!character || !(character.max_hp > 0)) continue;
    statuses.set(item.id, {
      hp: Math.max(0, character.current_hp),
      maxHp: character.max_hp,
      conditions: activeConditions(character.conditions),
      down: character.current_hp <= 0,
    });
  }
  if (isGm) {
    for (const combatant of combatants) {
      if (combatant.character_id || combatant.is_player_character) continue;
      const token = tokenFor(combatant, items as TableItem[]);
      // A creature that acts twice a round is two combatants; the first one found speaks for the token.
      if (!token || statuses.has(token.id) || !(combatant.max_hp > 0)) continue;
      statuses.set(token.id, {
        hp: Math.max(0, combatant.current_hp),
        maxHp: combatant.max_hp,
        conditions: (combatant.status_effects ?? []).map((effect) => effect.name).filter(Boolean),
        down: combatant.current_hp <= 0,
      });
    }
  }
  return statuses;
}

/** Share of hit points left, 0 to 1. */
export const hpFraction = (status: Pick<TokenStatus, 'hp' | 'maxHp'>) =>
  status.maxHp > 0 ? Math.min(1, Math.max(0, status.hp / status.maxHp)) : 0;

/** Green while healthy, amber when hurt, red when close to going down. */
export function hpColor(fraction: number): string {
  if (fraction > 0.5) return '#22c55e';
  if (fraction > 0.25) return '#f59e0b';
  return '#ef4444';
}

/** A short badge for a condition: the first two letters, capitalised. */
export const conditionBadge = (name: string) => name.trim().slice(0, 2).replace(/^./, (letter) => letter.toUpperCase());
