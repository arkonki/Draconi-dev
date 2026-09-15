// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { projectResumeState } from './resumeProfiles.js';

const fullState = {
  schemaVersion: 'resume-state-v1',
  campaignRevision: 7,
  campaign: {
    id: 'campaign-1', name: 'Vale', status: 'active', revision: 7,
    currentScene: { location: 'Duplicate scene' },
    gameTime: { elapsedSeconds: 900 },
  },
  characters: [{ id: 'actor-1' }, { id: 'actor-2' }],
  focusCharacterId: 'actor-1',
  character: {
    id: 'actor-1', name: 'Rook', type: 'pc', hp: { current: 5, max: 10 },
    wp: { current: 3, max: 8 }, attributes: { STR: 14 }, skills: { Swords: 12 },
    conditions: [{ id: 'condition-1', key: 'angry', name: 'Angry', description: 'verbose' }],
    inventory: [{ id: 'item-1', name: 'Sword' }],
    weapons: [{ id: 'item-1', name: 'Sword' }],
    heldItems: [{ id: 'item-1', name: 'Sword' }],
    equipment: [{
      id: 'item-1', definitionId: 'definition-1', name: 'Sword', category: 'WEAPON',
      quantity: 1, description: 'Long catalog text', damage: 'D8', range: 'STR',
      placement: { carriedByActorId: 'actor-1', equipped: true, ownerId: 'actor-1' },
      state: { status: 'ready', broken: false },
      properties: { cost: '10 gold' },
    }],
  },
  focusCharacter: null,
  scene: { location: 'Tower', description: 'Rain', dangers: [] },
  session: {
    activeSession: { id: 'session-1', title: 'Storm', status: 'active', gmNotes: 'secret' },
    lastCheckpoint: { id: 'checkpoint-1', summary: 'Reached tower', scene: { location: 'Duplicate' } },
    unresolvedThreads: ['secret thread'],
  },
  combat: { id: 'combat-1', status: 'active', round: 2, activeActorId: 'actor-1', participants: [] },
  solo: null,
  rolls: {
    pending: [{ id: 'roll-pending', status: 'pending', purpose: 'Spot', context: 'verbose' }],
    recent: [
      { id: 'roll-pending', status: 'pending', purpose: 'Spot' },
      { id: 'roll-1', status: 'resolved', purpose: 'Climb', result: { total: 8 } },
      { id: 'roll-2', status: 'resolved', purpose: 'Evade', result: { total: 10 } },
    ],
  },
  gameTime: { elapsedSeconds: 900 },
  gmContext: { villain: 'secret' },
};

describe('resume response profiles', () => {
  it('preserves the complete v1 object for compatibility', () => {
    expect(projectResumeState(fullState, { detail: 'full' })).toBe(fullState);
  });

  it('returns a compact summary without duplicated state or GM context', () => {
    const result = projectResumeState(fullState, { detail: 'compact' });

    expect(result.schemaVersion).toBe('resume-state-v2');
    expect(result.profile).toBe('compact');
    expect(result.character).toMatchObject({ id: 'actor-1', hp: { current: 5, max: 10 } });
    expect(result.campaign).not.toHaveProperty('currentScene');
    expect(result.campaign).not.toHaveProperty('gameTime');
    expect(result).not.toHaveProperty('characters');
    expect(result).not.toHaveProperty('focusCharacter');
    expect(result).not.toHaveProperty('gmContext');
    expect(result.rolls).toEqual({
      pending: [expect.objectContaining({ id: 'roll-pending', purpose: 'Spot' })],
    });
  });

  it('returns one focused equipment list and bounded non-duplicated roll history', () => {
    const result = projectResumeState(fullState, { detail: 'focused', recentRollLimit: 1 });

    expect(result.character.equipment).toEqual([
      expect.objectContaining({ id: 'item-1', name: 'Sword', damage: 'D8', range: 'STR' }),
    ]);
    expect(result.character).not.toHaveProperty('inventory');
    expect(result.character).not.toHaveProperty('weapons');
    expect(result.character).not.toHaveProperty('heldItems');
    expect(result.character.equipment[0]).not.toHaveProperty('description');
    expect(result.rolls.pending).toHaveLength(1);
    expect(result.rolls.recent).toHaveLength(1);
    expect(result.rolls.recent[0].id).toBe('roll-1');
    expect(result.gmContext).toEqual({ villain: 'secret' });
  });
});
