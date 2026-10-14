import { describe, expect, it } from 'vitest';
import { combatantForToken, damageForChange, siblingCombatants } from './tableQuickStatus';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

const item = (overrides: Partial<TableItem>): TableItem => ({
  id: 'i', party_id: 'p', map_id: 'm', kind: 'monster', label: 'Goblin', image_url: null, character_id: null, monster_id: null,
  x: 0.5, y: 0.5, size: 1, color: '#000', visible: true, locked: false, sort_order: 0, created_at: '', updated_at: '', ...overrides,
});
const combatant = (overrides: Partial<EncounterCombatant>): EncounterCombatant => ({
  id: 'c', encounter_id: 'e', character_id: null, monster_id: 'gob', is_player_character: false, display_name: 'Goblin',
  current_hp: 4, max_hp: 8, current_wp: null, max_wp: null, status_effects: [], initiative_roll: null, is_active_turn: false,
  has_acted: false, created_at: '', updated_at: '', ...overrides,
});

describe('table quick status', () => {
  const hero = item({ id: 'hero-token', kind: 'character', character_id: 'hero', label: 'Hero' });
  const goblin = item({ id: 'gob-token', monster_id: 'gob' });
  const fight = [combatant({ id: 'a' }), combatant({ id: 'b', display_name: 'Goblin (Act 2)' }), combatant({ id: 'h', character_id: 'hero', monster_id: null, is_player_character: true, display_name: 'Hero' })];

  it('finds the combatant behind a token', () => {
    expect(combatantForToken(hero, fight, [hero, goblin])?.id).toBe('h');
    expect(combatantForToken(goblin, fight, [hero, goblin])?.id).toBe('a');
    expect(combatantForToken(goblin, [], [goblin])).toBeNull();
  });

  it('treats a monster that acts twice as one creature', () => {
    expect(siblingCombatants(fight[0], fight).map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(siblingCombatants(fight[2], fight).map((entry) => entry.id)).toEqual(['h']);
  });

  it('turns a change in hit points into the damage the rules use', () => {
    expect(damageForChange(-3)).toBe(3);
    expect(damageForChange(5)).toBe(-5);
  });
});
