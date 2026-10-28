import { pool } from './db.js';
import { HttpError } from './http.js';
import { requireAdmin } from './adminUsers.js';
import { onAlert } from './alertBus.js';
import { mailEnabled, sendMail } from './mailer.js';

// Emails the administrators when something happens that they should know about. Urgent events go out at once (with a
// cooldown, so a repeating problem is one email that says how many more happened); routine ones are collected into a
// digest. Which events are on, and any extra recipients, are chosen in Settings and saved in app_settings.

const KEY = 'admin_alerts';
const REFRESH_MS = 60_000;

/** `mode`: 'immediate' sends right away (subject to `cooldownMinutes`); 'digest' waits for the next summary email. */
export const ALERT_EVENTS = Object.freeze([
  { id: 'deadlock', label: 'Database deadlock', description: 'The database stopped two requests from blocking each other.', mode: 'immediate', cooldownMinutes: 60, defaultEnabled: true },
  { id: 'backup_failed', label: 'Automatic backup failed', description: 'The daily recovery set could not be made.', mode: 'immediate', cooldownMinutes: 360, defaultEnabled: true },
  { id: 'attention', label: 'Health warning', description: 'The admin overview found a new warning or critical problem (old backups, low disk, slow site).', mode: 'immediate', cooldownMinutes: 30, defaultEnabled: true },
  { id: 'signups_paused', label: 'Sign-ups paused', description: 'The daily limit of new accounts was reached.', mode: 'immediate', cooldownMinutes: 360, defaultEnabled: true },
  { id: 'user_registered', label: 'New account', description: 'Someone registered.', mode: 'digest', defaultEnabled: true },
  { id: 'login_lockout', label: 'Sign-in lockout', description: 'An account or address was locked out after repeated wrong passwords.', mode: 'digest', defaultEnabled: true },
  { id: 'signup_blocked', label: 'Sign-up blocked', description: 'An address was stopped for too many sign-up attempts.', mode: 'digest', defaultEnabled: true },
  { id: 'account_deleted', label: 'Account deleted', description: 'Someone deleted their own account.', mode: 'digest', defaultEnabled: true },
  { id: 'server_started', label: 'Server started', description: 'The server (re)started, for example after a deployment.', mode: 'immediate', cooldownMinutes: 0, defaultEnabled: false },
]);
const EVENT_BY_ID = new Map(ALERT_EVENTS.map((event) => [event.id, event]));

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_EXTRA_RECIPIENTS = 10;
const MAX_DIGEST_LINES_PER_TYPE = 15;

const intSetting = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};

export function defaultAlertSettings() {
  return { enabled: true, events: Object.fromEntries(ALERT_EVENTS.map((event) => [event.id, event.defaultEnabled])), extraRecipients: [] };
}

/** Checks what the administrator sent and fills in defaults. Pure, so it is tested without a database. */
export function parseAlertSettings(body, current = defaultAlertSettings()) {
  const result = { enabled: current.enabled, events: { ...current.events }, extraRecipients: [...current.extraRecipients] };
  if (body?.enabled !== undefined) result.enabled = Boolean(body.enabled);
  if (body?.events !== undefined) {
    if (typeof body.events !== 'object' || body.events === null) throw new HttpError(400, 'Events must be an object of on/off values', 'INVALID_ALERTS');
    for (const [id, value] of Object.entries(body.events)) {
      if (!EVENT_BY_ID.has(id)) throw new HttpError(400, `Unknown alert event: ${id}`, 'INVALID_ALERTS');
      result.events[id] = Boolean(value);
    }
  }
  if (body?.extraRecipients !== undefined) {
    const list = Array.isArray(body.extraRecipients) ? body.extraRecipients : String(body.extraRecipients).split(/[\s,;]+/);
    const cleaned = [...new Set(list.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))];
    if (cleaned.length > MAX_EXTRA_RECIPIENTS) throw new HttpError(400, `At most ${MAX_EXTRA_RECIPIENTS} extra recipients`, 'INVALID_ALERTS');
    const bad = cleaned.find((address) => !EMAIL.test(address));
    if (bad) throw new HttpError(400, `That is not an email address: ${bad}`, 'INVALID_ALERTS');
    result.extraRecipients = cleaned;
  }
  return result;
}

const appName = () => process.env.APP_NAME || 'Dragonbane Character Manager';
const adminUrl = () => `${String(process.env.PUBLIC_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')}/settings`;

function describe(type, details) {
  switch (type) {
    case 'deadlock': return `Database deadlock. ${details.detail ? `PostgreSQL says: ${details.detail}` : ''}`.trim();
    case 'backup_failed': return `Automatic backup failed: ${details.message || 'unknown reason'}`;
    case 'attention': return (details.items || []).map((item) => `[${item.severity}] ${item.title}${item.detail ? ` - ${item.detail}` : ''}`).join('\n');
    case 'signups_paused': return 'New registrations are paused for the rest of the day (the daily limit was reached).';
    case 'user_registered': return `New account: ${details.username || '?'} <${details.email || '?'}>`;
    case 'login_lockout': return `Sign-in lockout for ${details.account || 'an address'}${details.address ? ` from ${details.address}` : ''}`;
    case 'signup_blocked': return `Sign-up attempts blocked from ${details.address || 'an address'}`;
    case 'account_deleted': return `Account deleted by its owner: ${details.username || '?'}`;
    case 'server_started': return details.version ? `The server started (version ${details.version}).` : 'The server started.';
    default: return type;
  }
}

/** Builds the email for one immediate event. */
export function immediateMessage(type, details, suppressed = 0) {
  const event = EVENT_BY_ID.get(type);
  const lines = [describe(type, details)];
  if (suppressed > 0) lines.push('', `${suppressed} more of the same kind happened since the last email of this type.`);
  lines.push('', `Admin panel: ${adminUrl()}`);
  return { subject: `[${appName()}] ${event?.label || type}`, text: lines.join('\n') };
}

/** Builds one summary email from the collected routine events. */
export function digestMessage(entries) {
  const byType = new Map();
  for (const entry of entries) {
    if (!byType.has(entry.type)) byType.set(entry.type, []);
    byType.get(entry.type).push(entry);
  }
  const sections = [];
  for (const [type, items] of byType) {
    const label = EVENT_BY_ID.get(type)?.label || type;
    const shown = items.slice(0, MAX_DIGEST_LINES_PER_TYPE).map((entry) => `  - ${entry.at.toISOString().slice(0, 16).replace('T', ' ')} UTC  ${describe(type, entry.details)}`);
    if (items.length > shown.length) shown.push(`  ... and ${items.length - shown.length} more`);
    sections.push(`${label} (${items.length})\n${shown.join('\n')}`);
  }
  return {
    subject: `[${appName()}] ${entries.length} event${entries.length === 1 ? '' : 's'} to review`,
    text: `${sections.join('\n\n')}\n\nAdmin panel: ${adminUrl()}`,
  };
}

/**
 * The notifier is a factory so tests can inject the clock, the settings, the recipients and the sender.
 * `deliver(message)` sends one email to every recipient and resolves when done.
 */
export function createNotifier({ now = () => Date.now(), settings, deliver, maxPerHour = intSetting('ADMIN_ALERT_MAX_PER_HOUR', 20) }) {
  const lastSent = new Map();
  const suppressed = new Map();
  let pending = [];
  let pendingKeys = new Set();
  let sentTimes = [];

  const underHourlyCap = () => {
    const cutoff = now() - 3_600_000;
    sentTimes = sentTimes.filter((time) => time > cutoff);
    return maxPerHour === 0 || sentTimes.length < maxPerHour;
  };
  const send = async (message) => {
    if (!underHourlyCap()) return false;
    sentTimes.push(now());
    await deliver(message);
    return true;
  };

  async function handle(type, details = {}, options = {}) {
    const event = EVENT_BY_ID.get(type);
    const current = settings();
    if (!event || !current.enabled || current.events[type] === false) return;
    if (event.mode === 'digest') {
      // The same subject (an account, an address) counts once per summary, however often it repeats.
      const key = options.key ? `${type}:${options.key}` : null;
      if (key && pendingKeys.has(key)) return;
      if (key) pendingKeys.add(key);
      pending.push({ type, details, at: new Date(now()) });
      return;
    }
    const cooldown = (event.cooldownMinutes ?? 0) * 60_000;
    const last = lastSent.get(type);
    if (cooldown > 0 && last !== undefined && now() - last < cooldown) {
      suppressed.set(type, (suppressed.get(type) || 0) + 1);
      return;
    }
    lastSent.set(type, now());
    const missed = suppressed.get(type) || 0;
    suppressed.delete(type);
    await send(immediateMessage(type, details, missed));
  }

  async function flushDigest() {
    if (pending.length === 0) return 0;
    const entries = pending;
    pending = [];
    pendingKeys = new Set();
    await send(digestMessage(entries));
    return entries.length;
  }

  return { handle, flushDigest, pendingCount: () => pending.length };
}

// --- The running service -----------------------------------------------------------------------------------------

let currentSettings = defaultAlertSettings();
let notifier = null;
let digestTimer = null;
let attentionTimer = null;
let refreshTimer = null;
let knownAttention = null;

async function readRow() {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  return rows[0]?.value ?? null;
}

export async function loadAlertSettings() {
  try {
    const row = await readRow();
    currentSettings = row ? parseAlertSettings(row) : defaultAlertSettings();
  } catch (error) {
    console.error(`Unable to load the alert settings: ${error.message}`);
  }
  return currentSettings;
}

async function adminRecipients() {
  const { rows } = await pool.query("SELECT email FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at");
  return [...new Set([...rows.map((row) => row.email), ...currentSettings.extraRecipients])];
}

async function deliverToAdmins(message) {
  if (!mailEnabled()) return;
  const recipients = await adminRecipients();
  if (recipients.length === 0) return;
  try {
    await sendMail({ to: recipients.join(', '), subject: message.subject, text: message.text });
  } catch (error) {
    console.error(`Unable to send an administrator alert: ${error.message}`);
  }
}

async function checkAttention() {
  try {
    const { adminOverview } = await import('./adminOverview.js');
    const { attention = [] } = await adminOverview({ role: 'admin' });
    const serious = attention.filter((item) => item.severity === 'warning' || item.severity === 'critical');
    const codes = new Set(serious.map((item) => item.code));
    // The first look after a start only records what is already wrong, so a restart does not repeat old news (critical ones still count).
    const fresh = serious.filter((item) => (knownAttention === null ? item.severity === 'critical' : !knownAttention.has(item.code)));
    knownAttention = codes;
    if (fresh.length > 0) await notifier.handle('attention', { items: fresh });
  } catch (error) {
    console.error(`Unable to check for health warnings: ${error.message}`);
  }
}

export function startAdminAlerts() {
  if (notifier) return;
  notifier = createNotifier({ settings: () => currentSettings, deliver: deliverToAdmins });
  onAlert((type, details, options) => notifier.handle(type, details, options));
  const digestMinutes = Math.max(1, intSetting('ADMIN_ALERT_DIGEST_MINUTES', 10));
  digestTimer = setInterval(() => { void notifier.flushDigest(); }, digestMinutes * 60_000);
  attentionTimer = setInterval(() => { void checkAttention(); }, 30 * 60_000);
  refreshTimer = setInterval(() => { void loadAlertSettings(); }, REFRESH_MS);
  for (const timer of [digestTimer, attentionTimer, refreshTimer]) timer.unref();
  setTimeout(() => { void checkAttention(); }, 120_000).unref();
}

export function stopAdminAlerts() {
  for (const timer of [digestTimer, attentionTimer, refreshTimer]) clearInterval(timer);
}

// --- Admin API --------------------------------------------------------------------------------------------------

export async function getAlertsAdminView(actor) {
  requireAdmin(actor);
  const row = await readRow();
  const settings = row ? parseAlertSettings(row) : defaultAlertSettings();
  return {
    enabled: settings.enabled,
    mailEnabled: mailEnabled(),
    extraRecipients: settings.extraRecipients,
    recipients: await adminRecipients().catch(() => []),
    digestMinutes: Math.max(1, intSetting('ADMIN_ALERT_DIGEST_MINUTES', 10)),
    events: ALERT_EVENTS.map((event) => ({ id: event.id, label: event.label, description: event.description, mode: event.mode, enabled: settings.events[event.id] !== false })),
  };
}

export async function saveAlertSettings(actor, body) {
  requireAdmin(actor);
  const row = await readRow();
  const parsed = parseAlertSettings(body, row ? parseAlertSettings(row) : defaultAlertSettings());
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [KEY, JSON.stringify(parsed), actor.id],
  );
  await loadAlertSettings();
  return getAlertsAdminView(actor);
}

let lastTest = 0;
/** Sends a sample alert to the current recipients straight away, so the setup can be checked. */
export async function sendTestAlert(actor, now = Date.now()) {
  requireAdmin(actor);
  if (!mailEnabled()) throw new HttpError(409, 'Email is not set up yet. Configure SMTP above first.', 'EMAIL_DISABLED');
  if (now - lastTest < 10_000) throw new HttpError(429, 'Wait a few seconds before sending another test.', 'RATE_LIMITED');
  lastTest = now;
  const recipients = await adminRecipients();
  if (recipients.length === 0) throw new HttpError(409, 'There is no one to send to.', 'NO_RECIPIENTS');
  try {
    await sendMail({
      to: recipients.join(', '),
      subject: `[${appName()}] Test alert`,
      text: `This is a test of administrator alerts, requested by ${actor.email}.\n\nIf you can read it, alerts reach you.\n\nAdmin panel: ${adminUrl()}`,
    });
  } catch (error) {
    throw new HttpError(502, `The email server refused or could not be reached: ${error.message}`, 'SMTP_FAILED');
  }
  return { ok: true, recipients };
}
