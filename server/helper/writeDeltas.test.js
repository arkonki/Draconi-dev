// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  actorChangesForOutput,
  actorStateForWrite,
  combatStateForWrite,
  compactWriteStateExcerpt,
} from './writeDeltas.js';

describe('compact write deltas', () => {
  it('projects actor mechanical events into field-level before/after changes', () => {
    expect(actorChangesForOutput('actor-1', [
      { type: 'actor.damage', payload: { before: 10, after: 7, amount: 3 } },
      { type: 'actor.spend_wp', payload: { before: 8, after: 6, amount: 2 } },
      { type: 'actor.condition_added', payload: { condition: { id: 'c-1', key: 'angry', name: 'Angry', description: 'long text' } } },
      { type: 'actor.inventory_adjusted', payload: { itemId: 'item-1', before: 3, after: 2 } },
    ])).toEqual([
      { actor_id: 'actor-1', field: 'hp.current', before: 10, after: 7 },
      { actor_id: 'actor-1', field: 'wp.current', before: 8, after: 6 },
      {
        actor_id: 'actor-1', field: 'conditions.angry', before: null,
        after: { id: 'c-1', key: 'angry', name: 'Angry' },
      },
      { actor_id: 'actor-1', field: 'equipment.item-1.quantity', before: 3, after: 2 },
    ]);
  });

  it('keeps post-write vitals and survival state without equipment duplication', () => {
    const actor = {
      id: 'actor-1', name: 'Rook', hp: { current: 2, max: 10 }, wp: { current: 4, max: 8 },
      conditions: [{ id: 'c-1', key: 'scared', name: 'Scared', description: 'verbose' }],
      deathRolls: { passed: 1, failed: 0 }, isRallied: false, lifeStatus: 'active',
      equipment: [{ id: 'item-1', name: 'Sword', description: 'verbose' }],
      inventory: [{ id: 'item-1', name: 'Sword' }],
    };

    expect(actorStateForWrite(actor)).toMatchObject({
      id: 'actor-1', hp: { current: 2, max: 10 }, deathRolls: { passed: 1, failed: 0 },
      conditions: [{ id: 'c-1', key: 'scared', name: 'Scared' }],
    });
    expect(actorStateForWrite(actor)).not.toHaveProperty('equipment');
    expect(compactWriteStateExcerpt({ actor, roll: { id: 'roll-1' } })).toEqual({
      actor: actorStateForWrite(actor), roll: { id: 'roll-1' },
    });
  });

  it('keeps the active turn but does not echo a large combat roster after writes', () => {
    const participants = Array.from({ length: 50 }, (_, index) => ({
      id: `participant-${index}`,
      actorId: `actor-${index}`,
      name: `Actor ${index}`,
      type: index === 0 ? 'pc' : 'monster',
      hp: { current: 10, max: 10 },
      wp: { current: 4, max: 4 },
      conditions: [],
      canAct: true,
      defeated: false,
      rallied: false,
      isActiveTurn: index === 0,
    }));
    const compact = combatStateForWrite({
      id: 'combat-1', status: 'active', round: 3, activeActorId: 'actor-0', participants,
    });

    expect(compact).toMatchObject({
      id: 'combat-1', status: 'active', round: 3, participantCount: 50,
      activeParticipant: { actorId: 'actor-0', hp: { current: 10, max: 10 } },
    });
    expect(compact).not.toHaveProperty('participants');
    expect(JSON.stringify(compact).length).toBeLessThan(1_000);
  });
});
