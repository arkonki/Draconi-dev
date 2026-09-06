import { describe, expect, it } from 'vitest';
import {
  parseTrustedDiceExpression,
  resolveTrustedManualRoll,
  resolveTrustedServerRoll,
} from './trustedRolls.js';

describe('trusted roll engine', () => {
  it('parses bounded canonical dice expressions', () => {
    expect(parseTrustedDiceExpression(' 2D6 + 3 ')).toEqual({
      expression: '2d6+3', count: 2, sides: 6, flatModifier: 3,
    });
    for (const invalid of ['', 'd20', '0d6', '21d6', '1d7', '1d20+1000', '1d20;drop table']) {
      expect(() => parseTrustedDiceExpression(invalid)).toThrow();
    }
  });

  it('uses a secure-injectable source and preserves every damage die', () => {
    const values = [4, 6];
    const result = resolveTrustedServerRoll({
      expression: '2d6+2', modifier: 'normal', rollKind: 'damage', targetValue: null,
    }, () => values.shift());
    expect(result).toMatchObject({
      expression: '2d6+2', dice: [4, 6], keptValues: [4, 6], total: 12, outcome: null,
    });
  });

  it('keeps the lower boon and higher bane and resolves Dragonbane outcomes', () => {
    expect(resolveTrustedManualRoll({
      expression: '1d20', modifier: 'boon', rollKind: 'check', targetValue: 12, dice: [18, 7],
    })).toMatchObject({ keptValue: 7, keptIndices: [1], outcome: 'success' });
    expect(resolveTrustedManualRoll({
      expression: '1d20', modifier: 'bane', rollKind: 'check', targetValue: 12, dice: [1, 20],
    })).toMatchObject({ keptValue: 20, keptIndices: [1], outcome: 'demon' });
  });

  it('requires exact, in-range manual dice and restricts boons and banes to 1d20', () => {
    expect(() => resolveTrustedManualRoll({
      expression: '2d6', modifier: 'normal', rollKind: 'generic', targetValue: null, dice: [4],
    })).toThrow('exactly 2');
    expect(() => resolveTrustedManualRoll({
      expression: '1d20', modifier: 'normal', rollKind: 'check', targetValue: 10, dice: [21],
    })).toThrow('1 to 20');
    expect(() => resolveTrustedManualRoll({
      expression: '2d6', modifier: 'boon', rollKind: 'generic', targetValue: null, dice: [1, 2],
    })).toThrow('only for an unmodified 1d20');
  });

  it('uses greater-than for advancement checks', () => {
    expect(resolveTrustedManualRoll({
      expression: '1d20', modifier: 'normal', rollKind: 'advancement', targetValue: 12, dice: [12],
    }).outcome).toBe('failure');
    expect(resolveTrustedManualRoll({
      expression: '1d20', modifier: 'normal', rollKind: 'advancement', targetValue: 12, dice: [13],
    }).outcome).toBe('success');
  });
});
