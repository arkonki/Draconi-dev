import { describe, expect, it } from 'vitest';
import { formatCampaignClock } from './campaignTimeFormat';

describe('formatCampaignClock', () => {
  it('shows the current campaign day after nine completed days', () => {
    expect(formatCampaignClock(9 * 24 * 60 * 60)).toEqual({
      day: 10,
      shift: 'Morning',
      time: '00:00',
    });
  });

  it('includes the time within the current campaign day', () => {
    expect(formatCampaignClock((2 * 24 * 60 * 60) + (19 * 60 * 60) + (8 * 60) + 4)).toEqual({
      day: 3,
      shift: 'Night',
      time: '19:08',
    });
  });

  it('normalizes invalid or negative elapsed time', () => {
    expect(formatCampaignClock(-20)).toMatchObject({ day: 1, time: '00:00' });
  });

  it.each([
    [6, 'Morning'],
    [7, 'Day'],
    [12, 'Day'],
    [13, 'Evening'],
    [18, 'Evening'],
    [19, 'Night'],
  ] as const)('maps %i:00 to the Time page shift %s', (hour, shift) => {
    expect(formatCampaignClock(hour * 60 * 60).shift).toBe(shift);
  });
});
