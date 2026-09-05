import { describe, expect, it } from 'vitest';
import { resolveDiceRoll } from './resolveDiceRoll';

describe('resolveDiceRoll', () => {
  it('resolves a normal skill check against its target', () => {
    expect(resolveDiceRoll({
      dicePool: ['d20'],
      results: [{ type: 'd20', value: 12 }],
      rollMode: 'skillCheck',
      targetValue: 13,
    })).toMatchObject({ selectedValue: 12, finalOutcome: 12, isSuccess: true, isCritical: false });
  });

  it('recognizes Dragon and Demon results', () => {
    const dragon = resolveDiceRoll({
      dicePool: ['d20'],
      results: [{ type: 'd20', value: 1 }],
      rollMode: 'skillCheck',
      targetValue: 10,
    });
    const demon = resolveDiceRoll({
      dicePool: ['d20'],
      results: [{ type: 'd20', value: 20 }],
      rollMode: 'skillCheck',
      targetValue: 10,
    });

    expect(dragon).toMatchObject({ selectedValue: 1, finalOutcome: 'Dragon!', isSuccess: true, isCritical: true });
    expect(demon).toMatchObject({ selectedValue: 20, finalOutcome: 'Demon!', isSuccess: false, isCritical: true });
  });

  it('selects the lowest d20 for a boon and highest for a bane', () => {
    const options = {
      dicePool: ['d20'] as const,
      results: [{ type: 'd20' as const, value: 14 }],
      modifierResults: [
        { type: 'd20' as const, value: 6 },
        { type: 'd20' as const, value: 18 },
      ],
      rollMode: 'skillCheck' as const,
      targetValue: 10,
    };

    expect(resolveDiceRoll({ ...options, dicePool: [...options.dicePool], isBoonActive: true }))
      .toMatchObject({ selectedValue: 6, isSuccess: true });
    expect(resolveDiceRoll({ ...options, dicePool: [...options.dicePool], isBaneActive: true }))
      .toMatchObject({ selectedValue: 18, isSuccess: false });
  });

  it('sums a multi-die pool', () => {
    expect(resolveDiceRoll({
      dicePool: ['d6', 'd6', 'd4'],
      results: [
        { type: 'd6', value: 4 },
        { type: 'd6', value: 2 },
        { type: 'd4', value: 3 },
      ],
      rollMode: 'generic',
    })).toMatchObject({ selectedValue: 9, finalOutcome: 9 });
  });

  it('uses roll-over rules for advancement', () => {
    expect(resolveDiceRoll({
      dicePool: ['d20'],
      results: [{ type: 'd20', value: 15 }],
      rollMode: 'advancementRoll',
      targetValue: 14,
    })).toMatchObject({ selectedValue: 15, isSuccess: true, isCritical: false });
  });
});
