import { describe, expect, it } from 'vitest';
import { inferMonsterAttackTableDie, rollMonsterAttackTable } from './monsterAttackTable';

describe('monster attack table helpers', () => {
  it('infers a d4 table when the highest attack roll is 4 or lower', () => {
    expect(inferMonsterAttackTableDie([
      { roll_values: '1' },
      { roll_values: '2-3' },
      { roll_values: '4' },
    ])).toBe('d4');
  });

  it('infers a d6 table when the highest attack roll is 6 or when no rolls are defined', () => {
    expect(inferMonsterAttackTableDie([
      { roll_values: '1-2' },
      { roll_values: '3-4' },
      { roll_values: '5-6' },
    ])).toBe('d6');
    expect(inferMonsterAttackTableDie([{ roll_values: '' }, { roll_values: undefined }])).toBe('d6');
  });

  it('infers a d8 table when the highest attack roll is 8', () => {
    expect(inferMonsterAttackTableDie([
      { roll_values: '1-2' },
      { roll_values: '3-4' },
      { roll_values: '5-6' },
      { roll_values: '7-8' },
    ])).toBe('d8');
  });

  it('rolls within the inferred table die range', () => {
    expect(rollMonsterAttackTable([{ roll_values: '1-4' }], () => 0)).toEqual({ die: 'd4', roll: 1 });
    expect(rollMonsterAttackTable([{ roll_values: '1-8' }], () => 0.99)).toEqual({ die: 'd8', roll: 8 });
  });
});
