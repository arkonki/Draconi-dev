// Pure scheduling rules for automatic backups. No I/O, so they are unit tested without a server.
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The most recent moment the daily backup was due: today's slot if it has passed, otherwise yesterday's. */
export function latestSlotAtOrBefore(now, hourUtc) {
  const date = new Date(now);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hourUtc);
  return today <= now ? today : today - DAY_MS;
}

/** The next moment a backup is due, strictly after `now`. */
export function nextSlotAfter(now, hourUtc) {
  return latestSlotAtOrBefore(now, hourUtc) + DAY_MS;
}

/** True when a scheduled backup should already have happened but none has been made since. */
export function isOverdue(lastBackupAt, now, hourUtc) {
  if (!lastBackupAt) return true;
  return Date.parse(lastBackupAt) < latestSlotAtOrBefore(now, hourUtc);
}

const SAFETY_MARGIN_BYTES = 256 * 1024 * 1024;

/**
 * A backup is a full copy, so refuse to start one that could fill the disk. `expectedBytes` is the size of the
 * previous set (zero when there is none yet).
 */
export function hasRoomForBackup(freeBytes, expectedBytes) {
  if (freeBytes == null) return true; // free space could not be read; do not block the backup on that
  return freeBytes >= expectedBytes * 2 + SAFETY_MARGIN_BYTES;
}
