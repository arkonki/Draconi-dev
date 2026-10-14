// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { monthRange, recentMonths } from './adminAiUsage.js';

describe('AI usage months', () => {
  const now = new Date('2026-10-14T12:00:00Z');

  it('turns a month into its first moment and the next one', () => {
    const range = monthRange('2026-12', now);
    expect(range.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(range.isCurrent).toBe(false);
  });

  it('defaults to the current month', () => {
    const range = monthRange(undefined, now);
    expect(range.month).toBe('2026-10');
    expect(range.isCurrent).toBe(true);
  });

  it('rejects anything that is not a month', () => {
    for (const bad of ['2026-13', '2026-00', 'October', '2026-1', '26-10', '2026-10-01']) expect(() => monthRange(bad, now)).toThrow(/month must look like/);
  });

  it('lists the recent months across a year boundary, newest first', () => {
    expect(recentMonths(4, new Date('2026-02-10T00:00:00Z'))).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(recentMonths(6, now)[0]).toBe('2026-10');
  });
});
