import { clientAddress, HttpError } from './http.js';

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_SECONDS || 900) * 1000;
const MAX_FAILURES_PER_ACCOUNT = Number(process.env.LOGIN_MAX_FAILURES_PER_ACCOUNT || 10);
const MAX_FAILURES_PER_ADDRESS = Number(process.env.LOGIN_MAX_FAILURES_PER_ADDRESS || 30);
const MAX_TRACKED_KEYS = 10_000;

const failures = new Map();

function activeEntry(key, now) {
  const entry = failures.get(key);
  if (entry && entry.resetAt <= now) {
    failures.delete(key);
    return null;
  }
  return entry || null;
}

function prune(now) {
  if (failures.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key);
  }
  // Still full of live entries: drop the oldest so memory stays bounded.
  while (failures.size >= MAX_TRACKED_KEYS) failures.delete(failures.keys().next().value);
}

function keysFor(request, email) {
  return {
    account: `account:${String(email || '').trim().toLowerCase()}`,
    address: `address:${clientAddress(request)}`,
  };
}

export function assertLoginAllowed(request, email, now = Date.now()) {
  const keys = keysFor(request, email);
  const account = activeEntry(keys.account, now);
  const address = activeEntry(keys.address, now);
  const blocked = (account && account.count >= MAX_FAILURES_PER_ACCOUNT)
    || (address && address.count >= MAX_FAILURES_PER_ADDRESS);
  if (!blocked) return;
  const resetAt = Math.max(
    account && account.count >= MAX_FAILURES_PER_ACCOUNT ? account.resetAt : 0,
    address && address.count >= MAX_FAILURES_PER_ADDRESS ? address.resetAt : 0,
  );
  const error = new HttpError(429, 'Too many failed sign-in attempts. Try again later.', 'RATE_LIMITED');
  error.headers = { 'retry-after': String(Math.max(1, Math.ceil((resetAt - now) / 1000))) };
  throw error;
}

export function recordLoginFailure(request, email, now = Date.now()) {
  prune(now);
  const keys = keysFor(request, email);
  for (const key of Object.values(keys)) {
    const entry = activeEntry(key, now);
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
}

export function clearLoginFailures(request, email) {
  failures.delete(keysFor(request, email).account);
}

export { clientAddress };

export function resetLoginRateLimit() {
  failures.clear();
}
