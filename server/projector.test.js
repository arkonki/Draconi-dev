// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergeProjectorCharacterState } from './projector.js';

const character = {
  current_hp: 12,
  max_hp: 14,
  current_wp: 8,
  max_wp: 10,
  conditions: {
    exhausted: true,
    angry: false,
  },
};

describe('projector encounter synchronization', () => {
  it('uses active encounter vitals and merges poison and fear', () => {
    expect(mergeProjectorCharacterState(character, {
      current_hp: 5,
      max_hp: 14,
      current_wp: 3,
      max_wp: 10,
      status_effects: ['Poisoned', { name: 'Fear' }, { name: 'Hidden Effect' }],
    })).toEqual({
      currentHp: 5,
      maxHp: 14,
      currentWp: 3,
      maxWp: 10,
      conditions: {
        exhausted: true,
        angry: false,
        poisoned: true,
        fear: true,
      },
    });
  });

  it('falls back to character vitals when no active combatant exists', () => {
    expect(mergeProjectorCharacterState(character, null)).toEqual({
      currentHp: 12,
      maxHp: 14,
      currentWp: 8,
      maxWp: 10,
      conditions: {
        exhausted: true,
        angry: false,
      },
    });
  });
});
