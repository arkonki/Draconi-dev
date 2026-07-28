// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  adjustInventory,
  applyDamage,
  healActor,
  removeCondition,
  spendWillpower,
  validateActorCanAct,
} from './rules.js';

function actor(overrides = {}) {
  return {
    id: '3ced9760-b661-4a31-b219-8a754e815b55',
    name: 'Alaric',
    currentHp: 10,
    maxHp: 14,
    currentWp: 8,
    maxWp: 8,
    conditions: [],
    inventory: [{
      id: '52e61370-9aaa-4332-b33d-78c534663bb1',
      name: 'Torch',
      quantity: 1,
    }],
    isAlive: true,
    ...overrides,
  };
}

describe('Dragonbane Helper rules', () => {
  it('rejects negative damage', () => {
    expect(() => applyDamage(actor(), -1)).toThrow(/whole number/i);
  });

  it('caps healing at maximum HP', () => {
    const resolution = healActor(actor({ currentHp: 12 }), 10);
    expect(resolution.actor.currentHp).toBe(14);
    expect(resolution.event.payload.applied).toBe(2);
  });

  it('does not allow WP to fall below zero', () => {
    expect(() => spendWillpower(actor({ currentWp: 2 }), 3)).toThrow(/enough WP/i);
  });

  it('requires a removed condition to exist', () => {
    expect(() => removeCondition(
      actor(),
      'be9d2046-0bda-4759-a7f5-47b4d8b7f70b',
    )).toThrow(/does not exist/i);
  });

  it('does not allow inventory quantity below zero', () => {
    expect(() => adjustInventory(
      actor(),
      '52e61370-9aaa-4332-b33d-78c534663bb1',
      -2,
    )).toThrow(/below zero/i);
  });

  it('does not allow a defeated actor to perform a normal action', () => {
    expect(() => validateActorCanAct(actor({ currentHp: 0, isAlive: false }))).toThrow(/defeated/i);
  });
});

