import { describe, expect, it } from 'vitest';
import type { EncounterCombatant } from '../types/encounter';
import {
  completeCurrentInitiativeSlot,
  nextInitiativeActions,
  pendingInitiativeSlotsFor,
  usesArmyOfOne,
} from './initiativeSlots';

function combatant(overrides: Partial<EncounterCombatant>): EncounterCombatant {
  return {
    id: 'actor-1', encounter_id: 'combat-1', character_id: 'character-1', monster_id: null,
    is_player_character: true, display_name: 'Hero', current_hp: 10, max_hp: 10,
    current_wp: 10, max_wp: 10, status_effects: [], initiative_roll: 2,
    initiative_slots: [2, 8], completed_initiative_slots: [], is_active_turn: false,
    has_acted: false, created_at: '', updated_at: '',
    character: { current_hp: 10, max_hp: 10, current_wp: 10, max_wp: 10, heroic_ability: ['Army of One'] },
    ...overrides,
  };
}

describe('solo initiative slots', () => {
  it('keeps one actor in two distinct positions in the round', () => {
    const hero = combatant({});
    const foe = combatant({
      id: 'foe-1', character_id: null, monster_id: 'monster-1', is_player_character: false,
      display_name: 'Foe', initiative_roll: 5, initiative_slots: [5], character: undefined,
    });
    expect(nextInitiativeActions([foe, hero]).map(({ combatant: entry, initiative }) => [entry.id, initiative]))
      .toEqual([['actor-1', 2], ['foe-1', 5], ['actor-1', 8]]);
  });

  it('completes one slot without ending the Army of One actor round', () => {
    const hero = combatant({});
    expect(completeCurrentInitiativeSlot(hero)).toEqual({
      completed_initiative_slots: [2],
      has_acted: false,
    });
    expect(pendingInitiativeSlotsFor({ ...hero, completed_initiative_slots: [2] })).toEqual([8]);
  });

  it('requires exactly one living player character for Army of One', () => {
    const hero = combatant({});
    expect(usesArmyOfOne(hero, [hero])).toBe(true);
    expect(usesArmyOfOne(hero, [hero, combatant({ id: 'actor-2', character_id: 'character-2' })])).toBe(false);
  });
});
