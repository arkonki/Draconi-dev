import { describe, expect, it } from 'vitest';
import { rollDiceExpression } from './diceExpression';

describe('rollDiceExpression', () => {
  it('rolls a light-source check', () => {
    expect(rollDiceExpression('1d8', () => 0)).toEqual({
      expression: '1d8', dice: [1], modifier: 0, total: 1,
    });
  });

  it('supports the reminder expression modifier contract', () => {
    expect(rollDiceExpression('2d6 + 3', () => 0.5)).toEqual({
      expression: '2d6 + 3', dice: [4, 4], modifier: 3, total: 11,
    });
  });

  it('rejects unsupported expressions', () => {
    expect(rollDiceExpression('roll something')).toBeNull();
  });
});
