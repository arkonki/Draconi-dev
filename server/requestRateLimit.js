import { HttpError } from './http.js';

const WINDOW_MS = 60_000;
const MAX_TRACKED_USERS = 10_000;

/**
 * How many data requests one signed-in person may make in a minute; 0 turns the limit off. The default is far above
 * what the app itself sends (dragging a token is the busiest thing it does, a few requests a second), so it only
 * stops a runaway script or a client stuck in a loop from taking the database away from everyone else.
 */
export function dataRateLimit(env = process.env) {
  const raw = env.DATA_RATE_LIMIT_PER_MINUTE;
  if (raw === undefined || raw === '') return 1_200;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('DATA_RATE_LIMIT_PER_MINUTE must be an integer between 0 and 1000000');
  }
  return value;
}

const LIMIT = dataRateLimit();
const windows = new Map();

function prune(now) {
  if (windows.size < MAX_TRACKED_USERS) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
  // Still full of live entries: drop the oldest so memory stays bounded.
  while (windows.size >= MAX_TRACKED_USERS) windows.delete(windows.keys().next().value);
}

/** Counts one data request for this person and refuses it once they are over the limit for the current minute. */
export function assertDataRateAllowed(user, now = Date.now(), limit = LIMIT) {
  if (limit === 0 || !user?.id) return;
  let entry = windows.get(user.id);
  if (!entry || entry.resetAt <= now) {
    prune(now);
    entry = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(user.id, entry);
  }
  entry.count += 1;
  if (entry.count <= limit) return;
  const error = new HttpError(429, 'Too many requests. Try again in a moment.', 'RATE_LIMITED');
  error.headers = { 'retry-after': String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))) };
  throw error;
}

export function resetDataRateLimit() {
  windows.clear();
}
