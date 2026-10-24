import { clientAddress, HttpError } from './http.js';

// Public sign-up is the one endpoint anybody can call, so it is limited three ways: a hidden form field that only
// bots fill in, a per-address hourly allowance, and a daily ceiling on new accounts that stops a flood even if it
// comes from many addresses. All counters are in memory, per API process.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_TRACKED_ADDRESSES = 10_000;
const perAddress = new Map();
let daily = { count: 0, resetAt: 0 };

const intSetting = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};

export function resetSignupGuard() {
  perAddress.clear();
  daily = { count: 0, resetAt: 0 };
}

/**
 * Throws when a public sign-up must be refused. Returns 'bot' when the hidden field was filled in, so the caller can
 * answer as if it worked without creating anything. Counts the attempt either way.
 */
export function checkSignup(request, body, now = Date.now()) {
  const maxPerAddress = intSetting('SIGNUP_MAX_PER_IP_HOUR', 5);
  const maxPerDay = intSetting('SIGNUP_MAX_PER_DAY', 200);

  if (String(body?.website ?? body?.options?.data?.website ?? '').trim() !== '') return 'bot';

  if (perAddress.size >= MAX_TRACKED_ADDRESSES) {
    for (const [key, entry] of perAddress) if (entry.resetAt <= now) perAddress.delete(key);
    while (perAddress.size >= MAX_TRACKED_ADDRESSES) perAddress.delete(perAddress.keys().next().value);
  }
  const key = clientAddress(request);
  let entry = perAddress.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + HOUR_MS };
    perAddress.set(key, entry);
  }
  if (daily.resetAt <= now) daily = { count: 0, resetAt: now + DAY_MS };

  if (maxPerAddress > 0 && entry.count >= maxPerAddress) {
    const error = new HttpError(429, 'Too many sign-up attempts from this address. Try again later.', 'RATE_LIMITED');
    error.headers = { 'retry-after': String(Math.ceil((entry.resetAt - now) / 1000)) };
    throw error;
  }
  if (maxPerDay > 0 && daily.count >= maxPerDay) {
    const error = new HttpError(503, 'New registrations are paused for today. Please try again tomorrow.', 'SIGNUPS_PAUSED');
    error.headers = { 'retry-after': String(Math.ceil((daily.resetAt - now) / 1000)) };
    throw error;
  }
  entry.count += 1;
  daily.count += 1;
  return 'ok';
}
