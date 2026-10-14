// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { describeEvent, describeRoll, pushableChecks, rollLines, unresolvedChecks } from './soloNarratorRolls.js';

const check = (overrides = {}, result = {}) => ({
  id: 'r1',
  purpose: 'Solo skill: Sneaking',
  result: {
    action: 'solo_check', checkType: 'skill', checkName: 'Sneaking', target: 12, modifier: 'normal',
    check: { expression: '1d20', dice: [15], roll: 15, target: 12, modifier: 'normal', outcome: 'failure' },
    outcome: 'failure', requiresFailForward: true, context: 'Slip past the guard', ...result,
  },
  ...overrides,
});

describe('how the narrator is told about dice', () => {
  it('writes a skill check with what was rolled, the target and the outcome, in the first words', () => {
    const line = describeRoll(check());
    expect(line.startsWith('Sneaking skill check (Slip past the guard): rolled 15 against 12 → FAILURE.')).toBe(true);
    expect(line).toContain('Not settled yet: the player can push it once');
  });

  it('keeps the outcome even though the raw result is long', () => {
    expect(JSON.stringify(check().result).indexOf('"outcome"')).toBeGreaterThan(160);
    expect(rollLines([check()]).join('\n')).toContain('FAILURE');
  });

  it('explains a boon or a bane by the dice kept', () => {
    const boon = check({}, { modifier: 'boon', check: { dice: [4, 17], roll: 4, target: 12, modifier: 'boon', outcome: 'success' }, requiresFailForward: false });
    expect(describeRoll(boon)).toContain('rolled 4, the lower of 4 and 17 because of a boon against 12 → SUCCESS');
    const bane = check({}, { modifier: 'bane', check: { dice: [4, 17], roll: 17, target: 12, modifier: 'bane', outcome: 'failure' } });
    expect(describeRoll(bane)).toContain('the higher of 4 and 17 because of a bane');
  });

  it('names a Dragon and a Demon, a critical effect and an advancement mark', () => {
    const dragon = check({}, { check: { dice: [1], roll: 1, target: 12, outcome: 'dragon' }, requiresFailForward: false, criticalEffect: { label: 'Extra swift' }, advancementMark: { added: true } });
    const line = describeRoll(dragon);
    expect(line).toContain('DRAGON (a critical success)');
    expect(line).toContain('Critical effect: Extra swift.');
    expect(line).toContain('Sneaking was marked for advancement.');
    expect(describeRoll(check({}, { check: { dice: [20], roll: 20, target: 12, outcome: 'demon' } }))).toContain('DEMON (a critical failure)');
  });

  it('finds the checks that are still unsettled, and those that can still be pushed', () => {
    const failed = check();
    const settled = check({ id: 'r2', consequence: { selectedDescription: 'The guard notices.' } });
    const pushedSource = check({ id: 'r3' });
    const push = check({ id: 'r4', previousRollId: 'r3' }, { action: 'solo_check_push', check: { dice: [3], roll: 3, target: 12, outcome: 'success' }, requiresFailForward: false });
    expect(unresolvedChecks([failed, settled, pushedSource, push]).map((roll) => roll.id)).toEqual(['r1']);
    expect(pushableChecks([failed, settled, pushedSource, push]).map((roll) => roll.id)).toEqual(['r1']);
    expect(describeRoll(settled)).toContain('Consequence taken: The guard notices.');
    expect(describeRoll(pushedSource, { pushed: new Set(['r3']) })).toContain('It was then pushed');
    expect(describeRoll(push)).toMatch(/^Pushed Sneaking skill check/);
  });

  it('says what is waiting on the player and that the consequence is not the narrator\'s to decide', () => {
    const text = rollLines([check()]).join('\n');
    expect(text).toContain('AWAITING THE PLAYER');
    expect(text).toContain('push it once or take a consequence');
    expect(rollLines([check({}, { check: { dice: [20], roll: 20, target: 12, outcome: 'demon' }, outcome: 'demon' })]).join('\n')).toContain('AWAITING THE PLAYER: the last failed check has no outcome in the story yet. Narrate the moment it goes wrong, then let the player take a consequence');
    expect(rollLines([check({}, { check: { dice: [5], roll: 5, target: 12, outcome: 'success' }, requiresFailForward: false })]).join('\n')).not.toContain('AWAITING');
  });

  it('writes the other kinds of roll in plain words', () => {
    expect(describeRoll({ id: 'f', purpose: 'Fortune: Is it safe?', result: { question: 'Is it safe?', value: 'no', extreme: true, tilt: 'unlikely' } })).toBe('Fortune, "Is it safe?": no (extreme), tilted unlikely.');
    expect(describeRoll({ id: 'i', purpose: 'Inspiration', result: { phrase: 'a hidden letter', context: 'what the cultist carries' } })).toBe('Inspiration (what the cultist carries): a hidden letter.');
    expect(describeRoll({ id: 's', purpose: 'Rest', result: { action: 'solo_rest', restType: 'stretch', hpRecoveryApplied: 3, wpRecoveryApplied: 2 } })).toBe('stretch rest: recovered 3 HP and 2 WP.');
    expect(describeRoll({ id: 'd', purpose: 'Solo narrative damage', result: { action: 'narrative_damage', severity: 'moderate', appliedDamage: 5, context: 'a fall' } })).toBe('Narrative damage (a fall): moderate severity, 5 damage taken.');
    expect(describeRoll({ id: 'x', purpose: 'Something new', result: { action: 'unknown_kind', note: 'hello' } })).toContain('Something new');
  });

  it('lists the newest rolls first and no more than asked', () => {
    const rolls = Array.from({ length: 8 }, (_, index) => ({ id: `q${index}`, purpose: `Roll ${index}`, result: { action: 'other' } }));
    const lines = rollLines(rolls, { limit: 5 }).filter((line) => line.startsWith('- '));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('Roll 0');
    expect(rollLines([])).toEqual([]);
  });

  it('writes events briefly, without ids, and leaves roll events to the roll lines', () => {
    const event = { type: 'solo.check_resolved', sourceType: 'user', payload: { rollId: 'r1', checkName: 'Sneaking', outcome: 'failure' } };
    expect(describeEvent(event)).toBe('solo.check_resolved: Sneaking check: FAILURE');
    expect(describeEvent(event, new Set(['r1']))).toBeNull();
    const other = describeEvent({ type: 'clue.found', sourceType: 'chatgpt', payload: { clueId: 'abc', reason: 'x', text: 'A torn map' } });
    expect(other).toBe('clue.found (from an AI assistant): {"text":"A torn map"}');
  });
});
