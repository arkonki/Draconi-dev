import { describe, expect, it } from 'vitest';
import {
  formatItemAttackRange,
  isStrengthBasedItemRange,
  resolveItemAttackRange,
} from './itemRange';

describe('item attack range', () => {
  it('recognizes STR expressions case-insensitively and ignores whitespace', () => {
    expect(isStrengthBasedItemRange('STR')).toBe(true);
    expect(isStrengthBasedItemRange(' str ')).toBe(true);
    expect(isStrengthBasedItemRange('STRx2')).toBe(true);
    expect(isStrengthBasedItemRange('str x 2')).toBe(true);
    expect(isStrengthBasedItemRange('STR×2')).toBe(true);
    expect(isStrengthBasedItemRange('STR*2')).toBe(true);
    expect(isStrengthBasedItemRange('STR + 2')).toBe(false);
    expect(isStrengthBasedItemRange('STRx0')).toBe(false);
  });

  it('resolves STR to the attacking character Strength', () => {
    expect(resolveItemAttackRange('STR', 14)).toBe(14);
    expect(resolveItemAttackRange(' str ', '17')).toBe(17);
    expect(formatItemAttackRange('STR', 14)).toBe('14 (STR)');
  });

  it('applies STR multipliers', () => {
    expect(resolveItemAttackRange('STRx2', 14)).toBe(28);
    expect(resolveItemAttackRange('str x 3', '8')).toBe(24);
    expect(resolveItemAttackRange('STR×1.5', 12)).toBe(18);
    expect(resolveItemAttackRange('STR*.5', 10)).toBe(5);
    expect(formatItemAttackRange('STRx2', 14)).toBe('28 (STR×2)');
  });

  it('preserves fixed numeric and descriptive ranges', () => {
    expect(resolveItemAttackRange(20, 14)).toBe(20);
    expect(resolveItemAttackRange('10 meters', 14)).toBe('10 meters');
    expect(formatItemAttackRange('10 meters', 14)).toBe('10 meters');
  });

  it('keeps STR visible when character Strength is unavailable', () => {
    expect(resolveItemAttackRange('STR', undefined)).toBe('STR');
    expect(resolveItemAttackRange('STRx2', undefined)).toBe('STR×2');
    expect(formatItemAttackRange('STR', Number.NaN)).toBe('STR');
    expect(formatItemAttackRange('STR x 2', Number.NaN)).toBe('STR×2');
    expect(formatItemAttackRange(undefined, 14)).toBe('-');
  });
});
