import { readdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { emitAlert } from './alertBus.js';
import { pool } from './db.js';
import { HttpError } from './http.js';
import {
  BACKUP_ROOT,
  beginApplicationRequest,
  createAutomaticBackup,
  endApplicationRequest,
  maintenanceStatus,
} from './recovery.js';
import { AUTOMATIC_BACKUP_PATTERN, pruneAutomaticBackups } from './backupRetention.js';
import { hasRoomForBackup, isOverdue, nextSlotAfter } from './backupSchedule.js';

const LOCK = 'dragonbane_automatic_backup';
const STARTUP_DELAY_MS = 2 * 60_000;
const RETRY_DELAY_MS = 30 * 60_000;
const MAX_RETRIES = 3;

function booleanSetting(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (['true', '1', 'yes', 'on'].includes(raw.toLowerCase())) return true;
  if (['false', '0', 'no', 'off'].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export const automaticBackupConfig = Object.freeze({
  enabled: booleanSetting('AUTO_BACKUP_ENABLED', true),
  hourUtc: integerSetting('AUTO_BACKUP_HOUR_UTC', 2, 0, 23),
  keep: integerSetting('AUTO_BACKUP_KEEP', 7, 1, 60),
});

function requireAdmin(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required', 'ADMIN_REQUIRED');
}

let timer = null;
let activeRun = null;
let started = false;
let retries = 0;
const state = {
  nextRunAt: null,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastReason: null,
  lastResult: null,
  lastError: null,
};

async function automaticSets() {
  let entries;
  try {
    entries = await readdir(BACKUP_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const sets = [];
  for (const entry of entries) {
    if (!entry.isFile() || !AUTOMATIC_BACKUP_PATTERN.test(entry.name)) continue;
    const details = await stat(path.join(BACKUP_ROOT, entry.name));
    sets.push({ filename: entry.name, size: details.size, createdAt: details.mtime.toISOString() });
  }
  return sets.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function freeBytes() {
  try {
    const info = await statfs(BACKUP_ROOT);
    return info.bavail * info.bsize;
  } catch {
    return null;
  }
}

/** A restart in the middle of a backup leaves a half-written file behind; clear out any that are clearly abandoned. */
async function removeAbandonedPartials() {
  try {
    for (const entry of await readdir(BACKUP_ROOT, { withFileTypes: true })) {
      if (!entry.isFile() || !/^dragonbane-auto-.*\.tar\.gz\.partial$/.test(entry.name)) continue;
      const fullPath = path.join(BACKUP_ROOT, entry.name);
      if (Date.now() - (await stat(fullPath)).mtimeMs > 6 * 3_600_000) await rm(fullPath, { force: true });
    }
  } catch {
    // Housekeeping only; never let it stop a backup.
  }
}

async function performBackup() {
  await removeAbandonedPartials();
  const sets = await automaticSets();
  if (!hasRoomForBackup(await freeBytes(), sets[0]?.size ?? 0)) {
    throw new Error('Not enough free disk space for another backup. Free some space or lower AUTO_BACKUP_KEEP.');
  }
  const startedAt = Date.now();
  const backup = await createAutomaticBackup();
  const pruned = await pruneAutomaticBackups(BACKUP_ROOT, { keep: automaticBackupConfig.keep });
  return { ...backup, durationMs: Date.now() - startedAt, prunedCount: pruned.prunable, prunedBytes: pruned.bytes };
}

// A scheduled run is not part of any web request, so it counts itself as the one active request the backup tolerates.
// A run started from the admin page is already inside a request and must not be counted twice, or it would wait forever.
async function run(reason, { failIfBusy = false } = {}) {
  if (activeRun) {
    if (failIfBusy) throw new HttpError(409, 'An automatic backup is already running', 'BACKUP_RUNNING');
    return null;
  }
  const client = await pool.connect();
  let locked = false;
  state.lastStartedAt = new Date().toISOString();
  state.lastReason = reason;
  const execution = (async () => {
    // Only one API instance may back up at a time.
    locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [LOCK])).rows[0].acquired;
    if (!locked) {
      if (failIfBusy) throw new HttpError(409, 'Another API instance is making a backup', 'BACKUP_RUNNING');
      return null;
    }
    const standalone = reason === 'scheduled';
    if (standalone) beginApplicationRequest();
    try {
      return await performBackup();
    } finally {
      if (standalone) endApplicationRequest();
    }
  })();
  activeRun = execution;
  try {
    const result = await execution;
    if (result) {
      state.lastResult = result;
      state.lastError = null;
      retries = 0;
      console.log(`Automatic backup ${result.filename} created (${(result.size / 1_048_576).toFixed(1)} MB, ${result.prunedCount} old set(s) removed).`);
    }
    return result;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    emitAlert('backup_failed', { message: state.lastError });
    throw error;
  } finally {
    state.lastCompletedAt = new Date().toISOString();
    activeRun = null;
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK]).catch(() => {});
    client.release();
  }
}

function schedule(delay) {
  if (!started || !automaticBackupConfig.enabled) {
    state.nextRunAt = null;
    return;
  }
  state.nextRunAt = new Date(Date.now() + delay).toISOString();
  timer = setTimeout(async () => {
    timer = null;
    state.nextRunAt = null;
    let retryDelay = null;
    try {
      if (maintenanceStatus().active) throw new Error('The server was busy with another maintenance task.');
      await run('scheduled');
    } catch (error) {
      console.error('Scheduled backup failed:', error instanceof Error ? error.message : error);
      if (retries < MAX_RETRIES) {
        retries += 1;
        retryDelay = RETRY_DELAY_MS;
      } else {
        retries = 0;
      }
    }
    // Worked out after the run so the time it took does not push the next slot later.
    schedule(retryDelay ?? nextSlotAfter(Date.now(), automaticBackupConfig.hourUtc) - Date.now());
  }, delay);
  timer.unref();
}

export async function startAutomaticBackups() {
  if (started || !automaticBackupConfig.enabled) return;
  started = true;
  // A server that was down or restarting at the usual hour still gets today's backup, shortly after it starts.
  const newest = (await automaticSets().catch(() => []))[0];
  const overdue = isOverdue(newest?.createdAt, Date.now(), automaticBackupConfig.hourUtc);
  schedule(overdue ? STARTUP_DELAY_MS : nextSlotAfter(Date.now(), automaticBackupConfig.hourUtc) - Date.now());
}

export async function stopAutomaticBackups() {
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  state.nextRunAt = null;
  if (activeRun) await activeRun.catch(() => {});
}

export async function automaticBackupStatus(user) {
  requireAdmin(user);
  const sets = await automaticSets();
  return {
    enabled: automaticBackupConfig.enabled,
    hourUtc: automaticBackupConfig.hourUtc,
    keep: automaticBackupConfig.keep,
    running: activeRun !== null,
    ...state,
    sets: { count: sets.length, bytes: sets.reduce((sum, set) => sum + set.size, 0), newest: sets[0] ?? null },
  };
}

/** Makes an automatic-series backup right now (for example before something risky). It still obeys the retention. */
export async function runAutomaticBackupNow(user) {
  requireAdmin(user);
  return run('manual', { failIfBusy: true });
}
