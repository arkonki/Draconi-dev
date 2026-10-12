import { describe, expect, it } from 'vitest';
import { hasRoomForBackup, isOverdue, latestSlotAtOrBefore, nextSlotAfter } from './backupSchedule.js';

const at = (iso) => Date.parse(iso);

describe('backup slots', () => {
  it('finds the latest slot that has already passed', () => {
    expect(latestSlotAtOrBefore(at('2026-10-09T10:00:00Z'), 2)).toBe(at('2026-10-09T02:00:00Z'));
    expect(latestSlotAtOrBefore(at('2026-10-09T01:59:00Z'), 2)).toBe(at('2026-10-08T02:00:00Z'));
    expect(latestSlotAtOrBefore(at('2026-10-09T02:00:00Z'), 2)).toBe(at('2026-10-09T02:00:00Z'));
  });

  it('finds the next slot, rolling over month and year ends', () => {
    expect(nextSlotAfter(at('2026-10-09T10:00:00Z'), 2)).toBe(at('2026-10-10T02:00:00Z'));
    expect(nextSlotAfter(at('2026-12-31T23:00:00Z'), 2)).toBe(at('2027-01-01T02:00:00Z'));
    expect(nextSlotAfter(at('2026-10-09T02:00:00Z'), 2)).toBe(at('2026-10-10T02:00:00Z'));
  });
});

describe('isOverdue', () => {
  const now = at('2026-10-09T10:00:00Z');

  it('is overdue when nothing was ever made', () => {
    expect(isOverdue(null, now, 2)).toBe(true);
  });

  it('is not overdue once today’s slot has produced a backup', () => {
    expect(isOverdue('2026-10-09T02:05:00Z', now, 2)).toBe(false);
  });

  it('is overdue when the last backup predates the latest slot', () => {
    expect(isOverdue('2026-10-08T02:05:00Z', now, 2)).toBe(true);
  });

  it('does not count a morning restart before the slot as overdue after yesterday’s backup', () => {
    expect(isOverdue('2026-10-08T02:05:00Z', at('2026-10-09T01:00:00Z'), 2)).toBe(false);
  });
});

describe('hasRoomForBackup', () => {
  const gib = 1024 ** 3;
  it('wants twice the last set plus a margin free', () => {
    expect(hasRoomForBackup(1 * gib, 0.16 * gib)).toBe(true);
    expect(hasRoomForBackup(0.6 * gib, 0.16 * gib)).toBe(true);
    expect(hasRoomForBackup(0.5 * gib, 0.16 * gib)).toBe(false);
    expect(hasRoomForBackup(0.5 * gib, 0.4 * gib)).toBe(false);
  });

  it('does not block when free space is unknown', () => {
    expect(hasRoomForBackup(null, 5 * gib)).toBe(true);
  });
});
