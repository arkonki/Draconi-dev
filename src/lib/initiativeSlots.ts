import type { EncounterCombatant } from '../types/encounter';
import { characterHasSoloAbility } from './soloAbilities';

export interface InitiativeAction {
  combatant: EncounterCombatant;
  initiative: number | null;
}

export function initiativeSlotsFor(combatant: EncounterCombatant): Array<number | null> {
  const stored = Array.isArray(combatant.initiative_slots)
    ? combatant.initiative_slots.filter((value) => Number.isInteger(value) && value >= 1 && value <= 10)
    : [];
  if (stored.length > 0) return [...new Set(stored)].sort((left, right) => left - right);
  return [combatant.initiative_roll ?? null];
}

export function completedInitiativeSlotsFor(combatant: EncounterCombatant): number[] {
  return Array.isArray(combatant.completed_initiative_slots)
    ? [...new Set(combatant.completed_initiative_slots)]
    : [];
}

export function pendingInitiativeSlotsFor(combatant: EncounterCombatant): Array<number | null> {
  if (combatant.has_acted) return [];
  const completed = new Set(completedInitiativeSlotsFor(combatant));
  return initiativeSlotsFor(combatant).filter((slot) => slot === null || !completed.has(slot));
}

export function nextInitiativeActions(combatants: EncounterCombatant[]): InitiativeAction[] {
  return combatants
    .flatMap((combatant) => pendingInitiativeSlotsFor(combatant).map((initiative) => ({ combatant, initiative })))
    .filter(({ combatant }) => !(combatant.monster_id && combatant.current_hp <= 0))
    .sort((left, right) => {
      const leftValue = left.initiative ?? Number.MAX_SAFE_INTEGER;
      const rightValue = right.initiative ?? Number.MAX_SAFE_INTEGER;
      if (leftValue !== rightValue) return leftValue - rightValue;
      return left.combatant.display_name.localeCompare(right.combatant.display_name);
    });
}

export function usesArmyOfOne(combatant: EncounterCombatant, combatants: EncounterCombatant[]) {
  const playerCharacters = combatants.filter((entry) => entry.is_player_character && entry.current_hp > 0);
  return playerCharacters.length === 1
    && playerCharacters[0].id === combatant.id
    && characterHasSoloAbility(combatant.character?.heroic_ability, 'armyOfOne');
}

export function completeCurrentInitiativeSlot(combatant: EncounterCombatant) {
  const pending = pendingInitiativeSlotsFor(combatant);
  const current = pending[0];
  if (current === undefined) {
    return { completed_initiative_slots: completedInitiativeSlotsFor(combatant), has_acted: true };
  }
  if (current === null) return { completed_initiative_slots: [], has_acted: true };
  const completed = [...completedInitiativeSlotsFor(combatant), current];
  return {
    completed_initiative_slots: [...new Set(completed)],
    has_acted: pending.length <= 1,
  };
}
