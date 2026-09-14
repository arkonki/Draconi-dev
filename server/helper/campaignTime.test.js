import { describe, expect, it } from 'vitest';
import { elapsedSecondsFromLegacyTimeTracker } from './campaignTime.js';

describe('legacy campaign time tracker conversion', () => {
  it('loads the start of the current legacy day', () => {
    expect(elapsedSecondsFromLegacyTimeTracker({ current_day: 9, grid_state: {} }))
      .toBe(8 * 24 * 60 * 60);
  });

  it('loads the latest marked quarter hour from the current day', () => {
    expect(elapsedSecondsFromLegacyTimeTracker({
      current_day: 3,
      grid_state: {
        1: { stretches: ['X', 'R', null, null] },
        2: { stretches: ['T', null, null, null] },
      },
    })).toBe((2 * 24 * 60 * 60) + (5 * 15 * 60));
  });

  it('does not count unmarked gaps as additional elapsed time', () => {
    expect(elapsedSecondsFromLegacyTimeTracker({
      current_day: 1,
      grid_state: { 1: { stretches: [null, 'X', null, null] } },
    })).toBe(2 * 15 * 60);
  });
});
