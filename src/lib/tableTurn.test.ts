import { describe, expect, it } from 'vitest';
import { buildTableTurn, tokenFor } from './tableTurn';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

const combatant = (overrides: Partial<EncounterCombatant>): EncounterCombatant => ({
  id: 'c', encounter_id: 'e', character_id: null, monster_id: null, is_player_character: false, display_name: 'X',
  current_hp: 10, max_hp: 10, current_wp: null, max_wp: null, status_effects: [], initiative_roll: 5, initiative_slots: [5],
  completed_initiative_slots: [], is_active_turn: false, has_acted: false, created_at: '', updated_at: '', ...overrides,
});

const item = (overrides: Partial<TableItem>): TableItem => ({
  id: 'i', party_id: 'p', map_id: 'm', kind: 'prop', label: 'Marker', image_url: null, character_id: null, monster_id: null,
  x: 0.5, y: 0.5, size: 1, color: '#fff', visible: true, locked: false, sort_order: 0, created_at: '', updated_at: '', ...overrides,
});

const anna = combatant({ id: 'a', character_id: 'hero', is_player_character: true, display_name: 'Anna', initiative_roll: 3, initiative_slots: [3] });
const wolf1 = combatant({ id: 'w1', monster_id: 'wolf', display_name: 'Wolf (Act 1)', initiative_roll: 1, initiative_slots: [1] });
const wolf2 = combatant({ id: 'w2', monster_id: 'wolf', display_name: 'Wolf (Act 2)', initiative_roll: 7, initiative_slots: [7] });
const annaToken = item({ id: 'ti-a', kind: 'character', label: 'Anna', character_id: 'hero' });
const wolfToken = item({ id: 'ti-w', kind: 'monster', label: 'Wolf', monster_id: 'wolf', visible: false });

describe('tokenFor', () => {
  it('matches characters by id and monsters by kind and name', () => {
    expect(tokenFor(anna, [annaToken, wolfToken])?.id).toBe('ti-a');
    expect(tokenFor(wolf1, [annaToken, wolfToken])?.id).toBe('ti-w');
    expect(tokenFor(combatant({ monster_id: 'ogre', display_name: 'Ogre' }), [annaToken, wolfToken])).toBeNull();
  });

  it('falls back to the only token of a kind when the names differ', () => {
    expect(tokenFor(combatant({ monster_id: 'wolf', display_name: 'Fang' }), [wolfToken])?.id).toBe('ti-w');
    expect(tokenFor(combatant({ monster_id: 'wolf', display_name: 'Fang' }), [wolfToken, { ...wolfToken, id: 'ti-w2', label: 'Wolf 2' }])).toBeNull();
  });
});

describe('buildTableTurn', () => {
  it('lists the actions in initiative order and marks the first as current', () => {
    const turn = buildTableTurn([anna, wolf2, wolf1], [annaToken, wolfToken], true);
    expect(turn.entries.map((entry) => [entry.label, entry.initiative, entry.isCurrent])).toEqual([
      ['Wolf', 1, true], ['Anna', 3, false], ['Wolf', 7, false],
    ]);
    expect([...turn.currentItemIds]).toEqual(['ti-w']);
  });

  it('keeps hidden monsters secret from players', () => {
    const turn = buildTableTurn([anna, wolf1], [annaToken, wolfToken], false);
    expect(turn.entries[0]).toMatchObject({ label: 'Unknown', concealed: true, itemId: null });
    expect(turn.currentItemIds.size).toBe(0);
    expect(turn.entries[1].label).toBe('Anna');
  });

  it('names a monster once its token is revealed', () => {
    const turn = buildTableTurn([wolf1], [{ ...wolfToken, visible: true }], false);
    expect(turn.entries[0]).toMatchObject({ label: 'Wolf', concealed: false, itemId: 'ti-w' });
  });

  it('skips defeated monsters and combatants that already acted', () => {
    const dead = combatant({ id: 'd', monster_id: 'wolf', display_name: 'Wolf', current_hp: 0, initiative_roll: 2, initiative_slots: [2] });
    const done = combatant({ id: 'x', character_id: 'hero', is_player_character: true, display_name: 'Anna', has_acted: true, initiative_roll: 4, initiative_slots: [4] });
    expect(buildTableTurn([dead, done], [annaToken], true).entries).toEqual([]);
  });

  it('shows nothing when there is no encounter', () => {
    expect(buildTableTurn([], [], true)).toEqual({ entries: [], currentItemIds: new Set() });
  });
});
