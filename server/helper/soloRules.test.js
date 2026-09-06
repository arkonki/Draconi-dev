// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  advanceThreatState,
  findTableEntry,
  resolveFortune,
  resolveExplorationFind,
  resolveInspiration,
  resolveSoloSkillCheck,
} from './soloRules.js';

const fortuneEntries = [
  { min: 1, max: 1, values: { yes_no: 'extreme no', quality: 'flawed' } },
  { min: 2, max: 3, values: { yes_no: 'no', quality: 'mundane' } },
  { min: 4, max: 5, values: { yes_no: 'yes', quality: 'fine' } },
  { min: 6, max: 6, values: { yes_no: 'extreme yes', quality: 'precious' } },
];

function fixedRolls(...values) {
  let index = 0;
  return () => values[index++];
}

describe('Solo rule resolution', () => {
  it('uses one die for an even Fortune question', () => {
    expect(resolveFortune({ category: 'yes_no', tilt: 'even', entries: fortuneEntries }, fixedRolls(4)))
      .toMatchObject({ expression: '1d6', dice: [4], keptValues: [4], value: 'yes', extreme: false });
  });

  it('keeps the lower die for unlikely questions and retains both raw dice', () => {
    expect(resolveFortune({ category: 'quality', tilt: 'unlikely', entries: fortuneEntries }, fixedRolls(6, 1)))
      .toMatchObject({ dice: [6, 1], keptIndices: [1], keptValues: [1], value: 'flawed', extreme: true });
  });

  it('keeps the higher die for likely questions', () => {
    expect(resolveFortune({ category: 'yes_no', tilt: 'likely', entries: fortuneEntries }, fixedRolls(2, 6)))
      .toMatchObject({ dice: [2, 6], keptIndices: [1], keptValues: [6], value: 'extreme yes', extreme: true });
  });

  it('resolves either ranged or positional table entries', () => {
    expect(findTableEntry(fortuneEntries, 3)).toEqual(fortuneEntries[1]);
    expect(findTableEntry(['first', 'second'], 2)).toBe('second');
  });

  it('rolls only the selected Inspiration columns', () => {
    const tables = {
      action: { tableKey: 'inspiration_action', version: 'generic-v1', sourceKind: 'generic', dieSides: 20, entries: ['seek'] },
      thing: { tableKey: 'inspiration_thing', version: 'generic-v1', sourceKind: 'generic', dieSides: 20, entries: ['secret'] },
    };
    expect(resolveInspiration({ columns: ['action', 'thing'], tables }, fixedRolls(1, 1))).toEqual({
      expression: '2d20',
      dice: [1, 1],
      keptIndices: [0, 1],
      keptValues: [1, 1],
      phrase: 'seek secret',
      results: [
        { column: 'action', roll: 1, keyword: 'seek', tableKey: 'inspiration_action', tableVersion: 'generic-v1', sourceKind: 'generic' },
        { column: 'thing', roll: 1, keyword: 'secret', tableKey: 'inspiration_thing', tableVersion: 'generic-v1', sourceKind: 'generic' },
      ],
    });
  });

  it('resolves Dragonbane skill outcomes including dragon and demon', () => {
    expect(resolveSoloSkillCheck({ target: 12 }, fixedRolls(1))).toMatchObject({ roll: 1, outcome: 'dragon' });
    expect(resolveSoloSkillCheck({ target: 12 }, fixedRolls(12))).toMatchObject({ roll: 12, outcome: 'success' });
    expect(resolveSoloSkillCheck({ target: 12 }, fixedRolls(13))).toMatchObject({ roll: 13, outcome: 'failure' });
    expect(resolveSoloSkillCheck({ target: 12 }, fixedRolls(20))).toMatchObject({ roll: 20, outcome: 'demon' });
  });

  it('keeps a treasure result and performs its bonus reroll', () => {
    const entries = [
      { min: 1, max: 9, key: 'supplies', label: 'Useful supplies', kind: 'supplies' },
      { min: 10, max: 10, key: 'treasure', label: 'Treasure', kind: 'treasure', reroll: true },
    ];
    expect(resolveExplorationFind(entries, fixedRolls(10, 4))).toMatchObject({
      expression: '2d10',
      dice: [10, 4],
      keptValues: [10, 4],
      rerollLimitReached: false,
      results: [
        { roll: 10, key: 'treasure', reroll: true },
        { roll: 4, key: 'supplies', reroll: false },
      ],
    });
  });

  it('caps recursive exploration rerolls', () => {
    const entries = [{ min: 1, max: 10, key: 'again', label: 'Again', reroll: true }];
    expect(resolveExplorationFind(entries, fixedRolls(10, 10, 10), 3)).toMatchObject({
      dice: [10, 10, 10],
      rerollLimitReached: true,
    });
  });

  it('advances a threat by one or two without exceeding six', () => {
    expect(advanceThreatState({ counter: 2, recurring: false, status: 'active' }, 2)).toMatchObject({
      previousCounter: 2,
      reachedCounter: 4,
      counter: 4,
      triggered: false,
      status: 'active',
    });
  });

  it('triggers a one-time threat at six', () => {
    expect(advanceThreatState({ counter: 5, recurring: false, status: 'active' }, 2)).toMatchObject({
      appliedAmount: 1,
      reachedCounter: 6,
      counter: 6,
      triggered: true,
      status: 'triggered',
    });
  });

  it('resets a recurring threat to one after triggering', () => {
    expect(advanceThreatState({ counter: 5, recurring: true, status: 'active' }, 1)).toMatchObject({
      reachedCounter: 6,
      counter: 1,
      triggered: true,
      status: 'active',
    });
  });
});
