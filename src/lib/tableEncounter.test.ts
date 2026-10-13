import { describe, expect, it } from 'vitest';
import { tokensNeededForEncounter } from './tableEncounter';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

const combatant = (overrides: Partial<EncounterCombatant>): EncounterCombatant => ({
  id: 'c', encounter_id: 'e', character_id: null, monster_id: null, is_player_character: false, display_name: 'X',
  current_hp: 10, max_hp: 10, current_wp: null, max_wp: null, status_effects: [], initiative_roll: null, is_active_turn: false,
  has_acted: false, created_at: '', updated_at: '', ...overrides,
});
const item = (overrides: Partial<TableItem>): TableItem => ({
  id: 'i', party_id: 'p', map_id: 'm', kind: 'prop', label: 'Marker', image_url: null, character_id: null, monster_id: null,
  x: 0.5, y: 0.5, size: 1, color: '#fff', visible: true, locked: false, sort_order: 0, created_at: '', updated_at: '', ...overrides,
});

describe('tokensNeededForEncounter', () => {
  const anna = combatant({ id: 'a', character_id: 'hero', is_player_character: true, display_name: 'Anna' });
  const goblin1 = combatant({ id: 'g1', monster_id: 'goblin', display_name: 'Goblin 1' });
  const goblin2 = combatant({ id: 'g2', monster_id: 'goblin', display_name: 'Goblin 2' });
  const wolfA = combatant({ id: 'w1', monster_id: 'wolf', display_name: 'Wolf (Act 1)' });
  const wolfB = combatant({ id: 'w2', monster_id: 'wolf', display_name: 'Wolf (Act 2)' });

  it('asks for one token per character and per creature', () => {
    expect(tokensNeededForEncounter([anna, goblin1, goblin2, wolfA, wolfB], [])).toEqual([
      { kind: 'character', character_id: 'hero' },
      { kind: 'monster', monster_id: 'goblin', label: 'Goblin 1' },
      { kind: 'monster', monster_id: 'goblin', label: 'Goblin 2' },
      { kind: 'monster', monster_id: 'wolf', label: 'Wolf' },
    ]);
  });

  it('skips creatures that already have a token', () => {
    const placed = [item({ id: 't1', kind: 'character', character_id: 'hero' }), item({ id: 't2', kind: 'monster', monster_id: 'goblin', label: 'Goblin 1' })];
    expect(tokensNeededForEncounter([anna, goblin1, goblin2], placed)).toEqual([{ kind: 'monster', monster_id: 'goblin', label: 'Goblin 2' }]);
  });

  it('needs nothing once everyone is on the map', () => {
    const placed = [
      item({ id: 't1', kind: 'character', character_id: 'hero' }),
      item({ id: 't2', kind: 'monster', monster_id: 'wolf', label: 'Wolf' }),
    ];
    expect(tokensNeededForEncounter([anna, wolfA, wolfB], placed)).toEqual([]);
  });

  it('handles a monster with no bestiary entry', () => {
    expect(tokensNeededForEncounter([combatant({ display_name: 'Mystery Beast' })], [])).toEqual([{ kind: 'monster', label: 'Mystery Beast' }]);
  });
});
