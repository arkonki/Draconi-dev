import { pool } from './db.js';
import { HttpError } from './http.js';
import {
  beginApplicationRequest,
  endApplicationRequest,
  maintenanceStatus,
} from './recovery.js';

const HOUSEKEEPING_LOCK = 'dragonbane_housekeeping';
const STARTUP_DELAY_MS = 30_000;

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const config = Object.freeze({
  intervalMinutes: integerSetting('HOUSEKEEPING_INTERVAL_MINUTES', 360, 0, 10_080),
  expiredSessionRetentionHours: integerSetting('EXPIRED_SESSION_RETENTION_HOURS', 24, 0, 8_760),
  changeEventRetentionDays: integerSetting('CHANGE_EVENT_RETENTION_DAYS', 14, 1, 365),
  batchSize: integerSetting('HOUSEKEEPING_BATCH_SIZE', 1_000, 1, 50_000),
  maxBatches: integerSetting('HOUSEKEEPING_MAX_BATCHES', 20, 1, 100),
});

let timer = null;
let activeRun = null;
let nextRunAt = null;
let schedulerStarted = false;
const state = {
  running: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastReason: null,
  lastResult: null,
  lastError: null,
};

function requireAdmin(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required');
}

async function deleteInBatches(client, statement, retention) {
  let deleted = 0;
  let batches = 0;
  let lastBatchSize = 0;

  do {
    const result = await client.query(statement, [retention, config.batchSize]);
    lastBatchSize = result.rowCount || 0;
    deleted += lastBatchSize;
    batches += 1;
  } while (lastBatchSize === config.batchSize && batches < config.maxBatches);

  return {
    deleted,
    batches,
    reachedLimit: lastBatchSize === config.batchSize && batches === config.maxBatches,
  };
}

async function performCleanup(reason, failIfLocked) {
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [HOUSEKEEPING_LOCK],
    );
    locked = lockResult.rows[0].acquired;
    if (!locked) {
      if (failIfLocked) throw new HttpError(409, 'Housekeeping is already running on another API instance');
      return { reason, skipped: 'another API instance holds the housekeeping lock' };
    }

    const sessions = await deleteInBatches(client, `
      WITH candidates AS (
        SELECT token_hash
        FROM app_sessions
        WHERE expires_at < now() - ($1::integer * interval '1 hour')
        ORDER BY expires_at
        LIMIT $2
      )
      DELETE FROM app_sessions AS sessions
      USING candidates
      WHERE sessions.token_hash = candidates.token_hash
    `, config.expiredSessionRetentionHours);

    const changeEvents = await deleteInBatches(client, `
      WITH candidates AS (
        SELECT id
        FROM app_change_events
        WHERE created_at < now() - ($1::integer * interval '1 day')
        ORDER BY created_at
        LIMIT $2
      )
      DELETE FROM app_change_events AS events
      USING candidates
      WHERE events.id = candidates.id
    `, config.changeEventRetentionDays);

    return {
      reason,
      deletedSessions: sessions.deleted,
      deletedChangeEvents: changeEvents.deleted,
      sessionBatches: sessions.batches,
      changeEventBatches: changeEvents.batches,
      backlogRemaining: sessions.reachedLimit || changeEvents.reachedLimit,
    };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [HOUSEKEEPING_LOCK]);
    client.release();
  }
}

async function beginRun(reason, failIfBusy = false) {
  if (activeRun) {
    if (failIfBusy) throw new HttpError(409, 'Housekeeping is already running');
    return null;
  }

  state.running = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastReason = reason;
  state.lastResult = null;
  state.lastError = null;
  const execution = performCleanup(reason, failIfBusy);
  activeRun = execution;

  try {
    const result = await execution;
    state.lastResult = result;
    state.lastCompletedAt = new Date().toISOString();
    return result;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    state.lastCompletedAt = new Date().toISOString();
    throw error;
  } finally {
    state.running = false;
    if (activeRun === execution) activeRun = null;
  }
}

async function pendingCounts() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM app_sessions
       WHERE expires_at < now() - ($1::integer * interval '1 hour')) AS expired_sessions,
      (SELECT COUNT(*) FROM app_change_events
       WHERE created_at < now() - ($2::integer * interval '1 day')) AS change_events
  `, [config.expiredSessionRetentionHours, config.changeEventRetentionDays]);
  return {
    expiredSessions: Number(rows[0].expired_sessions),
    changeEvents: Number(rows[0].change_events),
  };
}

function schedule(delay) {
  if (!schedulerStarted || config.intervalMinutes === 0) {
    nextRunAt = null;
    return;
  }
  nextRunAt = new Date(Date.now() + delay).toISOString();
  timer = setTimeout(async () => {
    timer = null;
    nextRunAt = null;
    if (!maintenanceStatus().active) {
      beginApplicationRequest();
      try {
        await beginRun('scheduled');
      } catch (error) {
        console.error('Scheduled housekeeping failed:', error);
      } finally {
        endApplicationRequest();
      }
    }
    schedule(config.intervalMinutes * 60_000);
  }, delay);
  timer.unref();
}

export function startHousekeeping() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  schedule(STARTUP_DELAY_MS);
}

export async function stopHousekeeping() {
  schedulerStarted = false;
  if (timer) clearTimeout(timer);
  timer = null;
  nextRunAt = null;
  if (activeRun) await activeRun.catch(() => {});
}

export async function housekeepingStatus(user) {
  requireAdmin(user);
  return {
    enabled: config.intervalMinutes > 0,
    config,
    ...state,
    nextRunAt,
    pending: await pendingCounts(),
  };
}

export async function runHousekeepingNow(user) {
  requireAdmin(user);
  return beginRun('manual', true);
}
