import { pool } from './db.js';
import { HttpError } from './http.js';
import { requireAdmin } from './adminUsers.js';
import { decryptSecret, encryptSecret, secretIsUsable } from './aiCrypto.js';
import { mailEnabled, mailSettings, mailSettingsFromEnv, sendMailWith, setStoredMailSettings } from './mailer.js';

// The outgoing email (SMTP) setup an administrator manages in the app. It is kept in app_settings under the key
// 'smtp', with the password encrypted, and takes precedence over the SMTP_* environment variables. Removing it
// falls back to the environment.

const KEY = 'smtp';
const HOST_PATTERN = /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$|^\[?[0-9A-Fa-f:.]+\]?$/;
const ADDRESS_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const TEST_WINDOW_MS = 600_000;
const MAX_TESTS_PER_WINDOW = 10;
const REFRESH_MS = 60_000;

const testAttempts = new Map();

const encryptionSecret = () => process.env.SETTINGS_ENCRYPTION_SECRET || process.env.AI_KEY_ENCRYPTION_SECRET;
export const smtpPasswordStorageAvailable = () => secretIsUsable(encryptionSecret());

/** The sender must be a plain address or `Name <address>`. */
export function validSender(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(?:"?([^"<>]{0,100})"?\s*)?<([^<>]+)>$/);
  return ADDRESS_PATTERN.test(match ? match[2].trim() : text) && !CONTROL_CHARACTERS.test(text);
}

/**
 * Checks what the administrator sent and merges it over the current settings. Pure, so it is tested without a
 * database. `password`: undefined keeps the current one, null or '' removes it, text replaces it.
 */
export function parseSmtpUpdate(body, current = {}) {
  const host = String(body?.host ?? '').trim();
  if (!HOST_PATTERN.test(host)) throw new HttpError(400, 'Enter the SMTP server name, such as smtp.example.com', 'INVALID_SMTP_HOST');
  const port = Number(body?.port ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new HttpError(400, 'The port must be a number from 1 to 65535', 'INVALID_SMTP_PORT');
  const from = String(body?.from ?? '').trim();
  if (!validSender(from)) throw new HttpError(400, 'Enter the sender as name@example.com or Name <name@example.com>', 'INVALID_SMTP_FROM');
  const user = String(body?.user ?? '').trim();
  if (user.length > 255 || CONTROL_CHARACTERS.test(user)) throw new HttpError(400, 'The login name is not valid', 'INVALID_SMTP_USER');

  let password = current.password ?? '';
  if (body?.password !== undefined) {
    password = body.password === null ? '' : String(body.password);
    if (password.length > 500 || CONTROL_CHARACTERS.test(password)) throw new HttpError(400, 'The password is not valid', 'INVALID_SMTP_PASSWORD');
  }
  return {
    host,
    port,
    secure: body?.secure === undefined ? port === 465 : Boolean(body.secure),
    requireTls: body?.requireTls === undefined ? true : Boolean(body.requireTls),
    user,
    from,
    password: user ? password : '',
  };
}

async function readRow() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = $1", [KEY]);
  return rows[0]?.value ?? null;
}

function openValue(value) {
  if (!value?.host) return null;
  const password = value.password ? decryptSecret(value.password, encryptionSecret()) : '';
  return { ...value, password: password ?? '', passwordUnreadable: Boolean(value.password) && password === null };
}

/** Loads the saved setup into the mailer. Called at start and then every minute, so another process's change is picked up. */
export async function loadStoredSmtp() {
  try {
    const stored = openValue(await readRow());
    setStoredMailSettings(stored);
    return stored;
  } catch (error) {
    console.error(`Unable to load the saved email settings: ${error.message}`);
    return null;
  }
}

export function startSmtpRefresh() {
  setInterval(() => { void loadStoredSmtp(); }, REFRESH_MS).unref();
}

function publicSettings(settings) {
  const { host, port, secure, requireTls, user, from } = settings;
  return { host, port, secure, requireTls, user, from };
}

export async function getSmtpAdminView(actor) {
  requireAdmin(actor);
  const stored = openValue(await readRow());
  const environment = mailSettingsFromEnv();
  const source = stored ? 'database' : (environment.host && environment.from ? 'environment' : 'none');
  const active = stored || environment;
  return {
    source,
    enabled: mailEnabled(),
    settings: publicSettings(active),
    passwordSet: Boolean(active.password) || Boolean(stored?.passwordUnreadable),
    passwordUnreadable: Boolean(stored?.passwordUnreadable),
    passwordStorageAvailable: smtpPasswordStorageAvailable(),
  };
}

export async function saveSmtp(actor, body) {
  requireAdmin(actor);
  const current = openValue(await readRow()) || {};
  const parsed = parseSmtpUpdate(body, current);
  if (parsed.password && body?.password !== undefined && !smtpPasswordStorageAvailable()) {
    throw new HttpError(409, 'The server has no encryption secret, so it cannot store an SMTP password. Set AI_KEY_ENCRYPTION_SECRET (at least 32 characters) on the server first.', 'ENCRYPTION_SECRET_MISSING');
  }
  // Keep the stored ciphertext when the password was not changed, so a missing secret never loses it.
  let passwordField = '';
  if (parsed.password) {
    passwordField = body?.password !== undefined ? encryptSecret(parsed.password, encryptionSecret()) : (await readRow())?.password ?? '';
  }
  const value = { ...parsed, password: passwordField };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [KEY, JSON.stringify(value), actor.id],
  );
  await loadStoredSmtp();
  return getSmtpAdminView(actor);
}

export async function clearSmtp(actor) {
  requireAdmin(actor);
  await pool.query('DELETE FROM app_settings WHERE key = $1', [KEY]);
  await loadStoredSmtp();
  return getSmtpAdminView(actor);
}

function takeTestSlot(actor, now = Date.now()) {
  const entry = testAttempts.get(actor.id);
  if (!entry || entry.resetAt <= now) {
    testAttempts.set(actor.id, { count: 1, resetAt: now + TEST_WINDOW_MS });
    return;
  }
  if (entry.count >= MAX_TESTS_PER_WINDOW) {
    const error = new HttpError(429, 'Too many test emails. Wait a few minutes.', 'RATE_LIMITED');
    error.headers = { 'retry-after': String(Math.ceil((entry.resetAt - now) / 1000)) };
    throw error;
  }
  entry.count += 1;
}

export function resetSmtpTestLimit() {
  testAttempts.clear();
}

/** Sends one message to the administrator's own address using the form values (or the saved setup when none are given). */
export async function sendSmtpTest(actor, body, send = sendMailWith) {
  requireAdmin(actor);
  takeTestSlot(actor);
  let settings;
  if (body?.settings) {
    const current = openValue(await readRow()) || mailSettingsFromEnv();
    settings = parseSmtpUpdate(body.settings, current);
  } else {
    settings = mailSettings();
    if (!settings.host || !settings.from) throw new HttpError(400, 'Email is not set up yet', 'EMAIL_DISABLED');
  }
  try {
    const info = await send(settings, {
      to: actor.email,
      subject: 'Test email from Dragonbane Character Manager',
      text: 'If you can read this, outgoing email works.',
    });
    return { ok: true, to: actor.email, response: String(info?.response || '') };
  } catch (error) {
    // The administrator needs the real reason (wrong password, TLS problem, refused connection) to fix the setup.
    throw new HttpError(502, `The email server refused or could not be reached: ${error.message}`, 'SMTP_FAILED');
  }
}
