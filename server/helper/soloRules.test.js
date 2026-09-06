// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  advanceSoloInjuryRecovery,
  advanceThreatState,
  findTableEntry,
  resolveFortune,
  resolveExplorationFind,
  resolveInspiration,
  resolveNarrativeDamage,
  resolveSevereInjury,
  resolveSoloCriticalEffect,
  resolveSoloDyingAction,
  resolveSoloInjuryTreatment,
  resolveSoloRest,
  resolveSoloSkillCheck,
} from './soloRules.js';

const fortuneEntries = [
  { min: 1, max: 1, values: { yes_no: 'extreme no', quality: 'flawed' } },
  { min: 2, max: 3, values: { yes_no: 'no', quality: 'mundane' } },
  { min: 4, max: 5, values: { yes_no: 'yes', quality: 'fine' } },
  { min: 6, max: 6, values: { yes_no: 'extreme yes', quality: 'precious' } },
];

const injuryEntries = [
  { min: 1, max: 10, key: 'broken_nose', name: 'Broken nose', effect: 'Bane on Awareness.', healing_dice: { count: 1, sides: 6 } },
  { min: 11, max: 20, key: 'gouged_eye', name: 'Gouged eye', effect: 'Spot Hidden is reduced.', permanent: true },
];

const damageEntries = [
  { min: 1, max: 2, key: 'slight', label: 'Slight', damage_dice: { count: 1, sides: 6 } },
  { min: 3, max: 5, key: 'moderate', label: 'Moderate', damage_dice: { count: 2, sides: 6 } },
  { min: 6, max: 6, key: 'severe', label: 'Severe', damage_dice: { count: 2, sides: 10 } },
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

  it('keeps the lower d20 for a boon and the higher d20 for a bane', () => {
    expect(resolveSoloSkillCheck({ target: 12, modifier: 'boon' }, fixedRolls(17, 6))).toEqual({
      expression: '2d20',
      dice: [17, 6],
      keptIndices: [1],
      keptValues: [6],
      roll: 6,
      target: 12,
      modifier: 'boon',
      outcome: 'success',
    });
    expect(resolveSoloSkillCheck({ target: 12, modifier: 'bane' }, fixedRolls(4, 20))).toMatchObject({
      dice: [4, 20], keptIndices: [1], keptValues: [20], roll: 20, outcome: 'demon',
    });
  });

  it('returns a transparent d6 prompt for a Solo Dragon or Demon', () => {
    expect(resolveSoloCriticalEffect([
      { min: 1, max: 3, key: 'opening', label: 'A useful opening' },
      { min: 4, max: 6, key: 'greater_result', label: 'A greater result' },
    ], fixedRolls(5))).toEqual({
      expression: '1d6',
      dice: [5],
      keptIndices: [0],
      keptValues: [5],
      roll: 5,
      key: 'greater_result',
      label: 'A greater result',
    });
  });

  it('resolves round and ordinary stretch rest recovery', () => {
    expect(resolveSoloRest({ restType: 'round' }, fixedRolls(4))).toMatchObject({
      expression: '1d6', dice: [4], hpRecovery: 0, wpRecovery: 4, fullRecovery: false,
    });
    expect(resolveSoloRest({ restType: 'stretch' }, fixedRolls(3, 5))).toMatchObject({
      expression: '2d6', dice: [3, 5], hpRecovery: 3, wpRecovery: 5,
    });
  });

  it('uses a successful Healing test to restore 2d6 HP during a stretch rest', () => {
    expect(resolveSoloRest(
      { restType: 'stretch', useHealing: true, healingTarget: 12 },
      fixedRolls(8, 4, 6, 2),
    )).toMatchObject({
      expression: '1d20 + 3d6',
      dice: [8, 4, 6, 2],
      healingCheck: { roll: 8, target: 12, outcome: 'success' },
      hpRecovery: 10,
      wpRecovery: 2,
    });
  });

  it('keeps the normal 1d6 HP recovery when a solo Healing test fails', () => {
    expect(resolveSoloRest(
      { restType: 'stretch', useHealing: true, healingTarget: 12 },
      fixedRolls(17, 4, 2),
    )).toMatchObject({
      expression: '1d20 + 2d6',
      dice: [17, 4, 2],
      healingCheck: { outcome: 'failure' },
      hpRecovery: 4,
      wpRecovery: 2,
    });
  });

  it('resolves a shift rest as full recovery without inventing a dice roll', () => {
    expect(resolveSoloRest({ restType: 'shift' })).toEqual({
      expression: null,
      dice: [],
      keptIndices: [],
      keptValues: [],
      healingCheck: null,
      hpRecovery: null,
      wpRecovery: null,
      fullRecovery: true,
    });
  });

  it('halves remaining severe-injury recovery after successful medical care', () => {
    expect(resolveSoloInjuryTreatment(
      { healingTarget: 12, remainingHealingShifts: 21 },
      fixedRolls(9),
    )).toMatchObject({
      check: { roll: 9, target: 12, outcome: 'success' },
      succeeded: true,
      previousRemainingHealingShifts: 21,
      remainingHealingShifts: 11,
      shiftsReduced: 10,
    });
  });

  it('does not shorten recovery after failed medical care', () => {
    expect(resolveSoloInjuryTreatment(
      { healingTarget: 12, remainingHealingShifts: 12 },
      fixedRolls(18),
    )).toMatchObject({
      check: { outcome: 'failure' },
      succeeded: false,
      remainingHealingShifts: 12,
      shiftsReduced: 0,
    });
  });

  it('advances temporary injury recovery in exact six-hour shifts', () => {
    expect(advanceSoloInjuryRecovery({ remainingHealingShifts: 2 })).toEqual({
      previousRemainingHealingShifts: 2,
      remainingHealingShifts: 1,
      elapsedShifts: 1,
      healed: false,
    });
    expect(advanceSoloInjuryRecovery({ remainingHealingShifts: 1 })).toMatchObject({
      remainingHealingShifts: 0,
      healed: true,
    });
  });

  it('counts Dragon and Demon death rolls twice', () => {
    expect(resolveSoloDyingAction(
      { action: 'death_roll', target: 12, passed: 0, failed: 0, injuryEntries },
      fixedRolls(1),
    )).toMatchObject({ deathRolls: { passed: 2, failed: 0 }, dead: false, recoveredHp: 0 });
    expect(resolveSoloDyingAction(
      { action: 'death_roll', target: 12, passed: 0, failed: 1, injuryEntries },
      fixedRolls(20),
    )).toMatchObject({ deathRolls: { passed: 0, failed: 3 }, dead: true, recoveredHp: 0 });
  });

  it('recovers D6 HP and resolves a severe injury on the third death-roll success', () => {
    expect(resolveSoloDyingAction(
      { action: 'death_roll', target: 12, passed: 2, failed: 1, injuryEntries },
      fixedRolls(8, 5, 4, 3),
    )).toMatchObject({
      expression: '1d20 + 1d6 + 1d20 + 1d6',
      dice: [8, 5, 4, 3],
      deathRolls: { passed: 3, failed: 1 },
      recoveredHp: 5,
      injury: { key: 'broken_nose', healingDays: 3 },
    });
  });

  it('allows an unbaned self-rally check without recovering HP', () => {
    expect(resolveSoloDyingAction(
      { action: 'self_rally', target: 11, passed: 1, failed: 0, injuryEntries },
      fixedRolls(9),
    )).toMatchObject({ check: { outcome: 'success' }, rallied: true, recoveredHp: 0 });
  });

  it('lets a successful life-saving Healing check recover the solo hero', () => {
    expect(resolveSoloDyingAction(
      { action: 'life_saving_healing', target: 13, passed: 0, failed: 2, injuryEntries },
      fixedRolls(12, 6, 15),
    )).toMatchObject({
      dice: [12, 6, 15],
      check: { outcome: 'success' },
      recoveredHp: 6,
      injury: { key: 'gouged_eye', permanent: true, healingDays: null },
    });
  });

  it('resolves unknown and chosen narrative damage severity', () => {
    expect(resolveNarrativeDamage(
      { severity: 'unknown', entries: damageEntries },
      fixedRolls(4, 3, 5),
    )).toMatchObject({ severityRoll: 4, severity: 'moderate', damageExpression: '2d6', damage: 8, dice: [4, 3, 5] });
    expect(resolveNarrativeDamage(
      { severity: 'severe', entries: damageEntries },
      fixedRolls(7, 9),
    )).toMatchObject({ severityRoll: null, severity: 'severe', damageExpression: '2d10', damage: 16, dice: [7, 9] });
  });

  it('records injury healing-time dice separately', () => {
    expect(resolveSevereInjury(injuryEntries, fixedRolls(2, 6))).toMatchObject({
      tableRoll: 2, dice: [2, 6], healingExpression: '1d6 days', healingDays: 6,
    });
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
