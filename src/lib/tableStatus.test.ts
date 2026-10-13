import { describe, expect, it } from 'vitest';
import { buildTokenStatuses, conditionBadge, hpColor, hpFraction } from './tableStatus';
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

describe('token status', () => {
  const hero = item({ id: 'hero-token', kind: 'character', character_id: 'hero', label: 'Hero' });
  const goblin = item({ id: 'gob-token', monster_id: 'gob' });
  const characters = [{ id: 'hero', current_hp: 7, max_hp: 10, conditions: { exhausted: true, dazed: false } }];
  const combatants = [combatant({ status_effects: [{ name: 'Prone' }] })];

  it('shows a character to everyone, with only the conditions that are on', () => {
    const player = buildTokenStatuses([hero, goblin], characters, combatants, false);
    expect(player.get('hero-token')).toEqual({ hp: 7, maxHp: 10, conditions: ['exhausted'], down: false });
    expect(player.has('gob-token')).toBe(false);
  });

  it('shows monsters to the GM only', () => {
    const gm = buildTokenStatuses([hero, goblin], characters, combatants, true);
    expect(gm.get('gob-token')).toEqual({ hp: 4, maxHp: 8, conditions: ['Prone'], down: false });
  });

  it('marks a creature at zero as down and ignores ones without hit points', () => {
    const down = buildTokenStatuses([hero], [{ id: 'hero', current_hp: 0, max_hp: 10 }], [], false);
    expect(down.get('hero-token')?.down).toBe(true);
    expect(buildTokenStatuses([hero], [{ id: 'hero', current_hp: 0, max_hp: 0 }], [], false).size).toBe(0);
  });

  it('does not double up a monster that acts twice', () => {
    const twice = [combatant({ id: 'a', current_hp: 4 }), combatant({ id: 'b', display_name: 'Goblin (Act 2)', current_hp: 1 })];
    expect(buildTokenStatuses([goblin], [], twice, true).get('gob-token')?.hp).toBe(4);
  });

  it('colours the bar by how much is left', () => {
    expect(hpFraction({ hp: 5, maxHp: 10 })).toBe(0.5);
    expect(hpFraction({ hp: 20, maxHp: 10 })).toBe(1);
    expect(hpColor(0.9)).toBe('#22c55e');
    expect(hpColor(0.4)).toBe('#f59e0b');
    expect(hpColor(0.1)).toBe('#ef4444');
    expect(conditionBadge('disheartened')).toBe('Di');
  });
});
