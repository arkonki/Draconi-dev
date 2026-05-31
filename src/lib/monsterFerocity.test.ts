import { describe, expect, it } from 'vitest';
import {
  MONSTER_FEROCITY_PC_COUNT_MINUS_ONE,
  coerceFixedMonsterFerocity,
  isPcCountMinusOneFerocity,
  resolveMonsterFerocity,
} from './monsterFerocity';

describe('monster ferocity helpers', () => {
  it('keeps fixed numeric ferocity values at a minimum of 1', () => {
    expect(coerceFixedMonsterFerocity(3)).toBe(3);
    expect(coerceFixedMonsterFerocity(0)).toBe(1);
    expect(coerceFixedMonsterFerocity('2')).toBe(2);
  });

  it('recognizes the dynamic PC-count ferocity label', () => {
    expect(isPcCountMinusOneFerocity(MONSTER_FEROCITY_PC_COUNT_MINUS_ONE)).toBe(true);
    expect(isPcCountMinusOneFerocity('No. of PCs - 1 (min. 1)')).toBe(true);
    expect(isPcCountMinusOneFerocity('No. of PCs−1 (min. 1)')).toBe(true);
  });

  it('resolves the dynamic ferocity rule with a minimum of 1', () => {
    expect(resolveMonsterFerocity(MONSTER_FEROCITY_PC_COUNT_MINUS_ONE, 5)).toBe(4);
    expect(resolveMonsterFerocity(MONSTER_FEROCITY_PC_COUNT_MINUS_ONE, 1)).toBe(1);
  });

  it('falls back to 1 for unknown ferocity values', () => {
    expect(resolveMonsterFerocity(undefined, 4)).toBe(1);
    expect(resolveMonsterFerocity('something unexpected', 4)).toBe(1);
  });
});
