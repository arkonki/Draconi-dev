import { createHash, randomBytes } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { clientAddress, HttpError } from './http.js';
import { mailEnabled, sendMail } from './mailer.js';

const VERIFY_HOURS = 24;
const RESET_HOURS = 1;
const REQUEST_WINDOW_MS = 3_600_000;
const MAX_REQUESTS_PER_EMAIL = Number(process.env.EMAIL_MAX_REQUESTS_PER_ADDRESS_HOUR || 5);
const MAX_REQUESTS_PER_ADDRESS = Number(process.env.EMAIL_MAX_REQUESTS_PER_IP_HOUR || 20);
const MAX_TRACKED_KEYS = 10_000;
const requests = new Map();

const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function appName() {
  return process.env.APP_NAME || 'Dragonbane Character Manager';
}

function baseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
}

export function resetRequestLimits() {
  requests.clear();
}

// Counts a request against both the email address and the caller's address and refuses it when either is over its hourly allowance.
function takeRequestSlot(request, email, now = Date.now()) {
  if (requests.size >= MAX_TRACKED_KEYS) {
    for (const [key, entry] of requests) if (entry.resetAt <= now) requests.delete(key);
    while (requests.size >= MAX_TRACKED_KEYS) requests.delete(requests.keys().next().value);
  }
  const limits = [[`email:${email}`, MAX_REQUESTS_PER_EMAIL], [`address:${clientAddress(request)}`, MAX_REQUESTS_PER_ADDRESS]];
  let retryAfter = 0;
  const entries = limits.map(([key, max]) => {
    let entry = requests.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + REQUEST_WINDOW_MS };
      requests.set(key, entry);
    }
    if (entry.count >= max) retryAfter = Math.max(retryAfter, Math.ceil((entry.resetAt - now) / 1000));
    return entry;
  });
  if (retryAfter) {
    const error = new HttpError(429, 'Too many email requests. Try again later.', 'RATE_LIMITED');
    error.headers = { 'retry-after': String(retryAfter) };
    throw error;
  }
  entries.forEach((entry) => { entry.count += 1; });
}

async function issueToken(client, userId, purpose, hours) {
  // Expired links are cleaned up whenever a new one is issued; a new link replaces any earlier unused one.
  await client.query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '1 day'");
  await client.query('DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  const token = randomBytes(32).toString('base64url');
  await client.query(
    `INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at)
     VALUES ($1, $2, $3, now() + ($4::integer * interval '1 hour'))`,
    [hashToken(token), userId, purpose, hours],
  );
  return token;
}

export function verificationEmail(user, token) {
  const link = `${baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const name = user.username || 'adventurer';
  return {
    subject: `Confirm your email for ${appName()}`,
    text: `Hello ${name},\n\nConfirm your email address to finish creating your ${appName()} account:\n\n${link}\n\nThe link works for ${VERIFY_HOURS} hours. If you did not sign up, you can ignore this message.\n`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Confirm your email address to finish creating your ${escapeHtml(appName())} account:</p><p><a href="${link}">Confirm my email</a></p><p>The link works for ${VERIFY_HOURS} hours. If you did not sign up, you can ignore this message.</p>`,
  };
}

export function passwordResetEmail(user, token) {
  const link = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const name = user.username || 'adventurer';
  return {
    subject: `Reset your ${appName()} password`,
    text: `Hello ${name},\n\nSomeone asked to reset the password for your ${appName()} account. Choose a new one here:\n\n${link}\n\nThe link works once, for ${RESET_HOURS} hour. If you did not ask for this, ignore this message; your password stays as it is.\n`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>Someone asked to reset the password for your ${escapeHtml(appName())} account.</p><p><a href="${link}">Choose a new password</a></p><p>The link works once, for ${RESET_HOURS} hour. If you did not ask for this, ignore this message; your password stays as it is.</p>`,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

// Mail problems are logged, never shown to the caller, so the response cannot reveal whether an address has an account.
async function deliver(message, to) {
  try {
    await sendMail({ ...message, to });
  } catch (error) {
    console.error(`Unable to send email to an account address: ${error.message}`);
  }
}

export async function sendVerificationEmail(user) {
  if (!mailEnabled()) return false;
  const token = await withTransaction((client) => issueToken(client, user.id, 'verify_email', VERIFY_HOURS));
  await deliver(verificationEmail(user, token), user.email);
  return true;
}

export async function requestPasswordReset(request, { email }) {
  const normalized = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new HttpError(400, 'Email address is invalid', 'INVALID_EMAIL');
  if (!mailEnabled()) throw new HttpError(503, 'Password reset by email is not available on this server. Ask an administrator.', 'EMAIL_DISABLED');
  takeRequestSlot(request, normalized);
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1 AND is_active = true', [normalized]);
  if (rows[0]) {
    const token = await withTransaction((client) => issueToken(client, rows[0].id, 'reset_password', RESET_HOURS));
    await deliver(passwordResetEmail(rows[0], token), rows[0].email);
  }
  return { ok: true };
}

export async function resendVerification(request, { email }) {
  const normalized = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new HttpError(400, 'Email address is invalid', 'INVALID_EMAIL');
  if (!mailEnabled()) throw new HttpError(503, 'Email is not available on this server. Ask an administrator.', 'EMAIL_DISABLED');
  takeRequestSlot(request, normalized);
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE lower(email) = $1 AND is_active = true AND is_email_verified = false',
    [normalized],
  );
  if (rows[0]) await sendVerificationEmail(rows[0]);
  return { ok: true };
}

async function consumeToken(client, token, purpose) {
  const { rows } = await client.query(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(token), purpose],
  );
  if (!rows[0]) throw new HttpError(400, 'This link is invalid or has expired. Request a new one.', 'TOKEN_INVALID');
  return rows[0].user_id;
}

export async function verifyEmail({ token }) {
  if (typeof token !== 'string' || !token) throw new HttpError(400, 'This link is invalid or has expired. Request a new one.', 'TOKEN_INVALID');
  await withTransaction(async (client) => {
    const userId = await consumeToken(client, token, 'verify_email');
    await client.query('UPDATE users SET is_email_verified = true WHERE id = $1', [userId]);
  });
  return { ok: true };
}

// `hashPassword` is passed in by auth.js (which owns the password rules) to avoid a circular import.
export async function resetPassword({ token, password }, hashPassword) {
  if (typeof token !== 'string' || !token) throw new HttpError(400, 'This link is invalid or has expired. Request a new one.', 'TOKEN_INVALID');
  const passwordHash = hashPassword(password);
  await withTransaction(async (client) => {
    const userId = await consumeToken(client, token, 'reset_password');
    await client.query('UPDATE app_credentials SET password_hash = $1, updated_at = now() WHERE user_id = $2', [passwordHash, userId]);
    // Whoever knew the old password must not stay signed in, and other pending links are void.
    await client.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
    await client.query("DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = 'reset_password'", [userId]);
    // Opening an emailed link proves the mailbox is theirs.
    await client.query('UPDATE users SET is_email_verified = true WHERE id = $1', [userId]);
  });
  return { ok: true };
}
