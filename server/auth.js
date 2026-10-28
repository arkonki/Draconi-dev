import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './db.js';
import { assertSafeBootstrapPassword } from './configCheck.js';
import { getBearerToken, HttpError } from './http.js';
import { requestEmailChange, sendVerificationEmail } from './accountEmails.js';
import { emitAlert } from './alertBus.js';
import { TERMS_VERSION } from './legal.js';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from './loginRateLimit.js';
import { mailEnabled } from './mailer.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);
const SESSION_TOUCH_INTERVAL_SECONDS = Number(process.env.SESSION_TOUCH_INTERVAL_SECONDS || 300);

if (!Number.isInteger(SESSION_TOUCH_INTERVAL_SECONDS) || SESSION_TOUCH_INTERVAL_SECONDS < 0 || SESSION_TOUCH_INTERVAL_SECONDS > 86_400) {
  throw new Error('SESSION_TOUCH_INTERVAL_SECONDS must be an integer between 0 and 86400');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function encodeScryptPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must contain at least 8 characters');
  }
  return encodeScryptPassword(password);
}

export function verifyPassword(password, encoded) {
  if (/^\$2[aby]\$\d{2}\$/.test(String(encoded || ''))) {
    try {
      return bcrypt.compareSync(String(password || ''), encoded);
    } catch {
      return false;
    }
  }
  const [algorithm, salt, expectedHex] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: { provider: 'local' },
    user_metadata: {
      username: row.username,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createSession(client, user) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await client.query(
    'INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), user.id, expiresAt],
  );
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: SESSION_DAYS * 86_400,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    refresh_token: token,
    user: publicUser(user),
  };
}

export async function currentUser(request, required = true) {
  const token = getBearerToken(request);
  return authenticateAccessToken(token, required);
}

export async function authenticateAccessToken(token, required = true) {
  if (!token) {
    if (required) throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
    return null;
  }
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT u.*,
       (s.last_seen_at IS NULL OR s.last_seen_at < now() - ($2::integer * interval '1 second')) AS session_touch_due
     FROM app_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = true`,
    [tokenHash, SESSION_TOUCH_INTERVAL_SECONDS],
  );
  if (!rows[0]) {
    if (required) throw new HttpError(401, 'Session has expired', 'SESSION_EXPIRED');
    return null;
  }
  const user = rows[0];
  const touchDue = user.session_touch_due;
  delete user.session_touch_due;
  if (SESSION_TOUCH_INTERVAL_SECONDS > 0 && touchDue) {
    await pool.query(
      `UPDATE app_sessions
       SET last_seen_at = now()
       WHERE token_hash = $1
         AND (last_seen_at IS NULL OR last_seen_at < now() - ($2::integer * interval '1 second'))`,
      [tokenHash, SESSION_TOUCH_INTERVAL_SECONDS],
    );
  }
  return user;
}

export async function verifyUserPassword(userId, password) {
  const { rows } = await pool.query('SELECT password_hash FROM app_credentials WHERE user_id = $1', [userId]);
  return Boolean(rows[0] && verifyPassword(String(password || ''), rows[0].password_hash));
}

export async function authenticateCredentials(email, password) {
  const { rows } = await pool.query(
    `SELECT u.*, c.password_hash FROM users u
     JOIN app_credentials c ON c.user_id = u.id
     WHERE lower(u.email) = $1 AND u.is_active = true`,
    [normalizeEmail(email)],
  );
  const user = rows[0];
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) return null;

  await withTransaction(async (client) => {
    if (!String(user.password_hash).startsWith('scrypt$')) {
      await client.query(
        'UPDATE app_credentials SET password_hash = $1, updated_at = now() WHERE user_id = $2',
        [encodeScryptPassword(String(password || '')), user.id],
      );
    }
    await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  });
  return user;
}

export async function signIn({ email, password }) {
  const user = await authenticateCredentials(email, password);
  if (!user) {
    throw new HttpError(400, 'Invalid login credentials', 'INVALID_CREDENTIALS');
  }
  if (user.is_email_verified === false) {
    throw new HttpError(403, 'Confirm your email address first. Check your inbox for the confirmation link.', 'EMAIL_NOT_VERIFIED');
  }
  const session = await withTransaction((client) => createSession(client, user));
  return { user: publicUser(user), session };
}

export function resolveSignUpRole(actor, requestedRole, registrationAllowed) {
  if (!actor) {
    if (!registrationAllowed) {
      throw new HttpError(
        403,
        'Public registration is disabled. Ask an administrator to create the account.',
        'REGISTRATION_DISABLED',
      );
    }
    return 'player';
  }

  if (actor.role !== 'admin') {
    throw new HttpError(403, 'Administrator access is required', 'ADMIN_REQUIRED');
  }

  return ['player', 'dm', 'admin'].includes(requestedRole) ? requestedRole : 'player';
}

/** How many accounts the site may have before its own sign-up closes; 0 means no limit. Admins can always add more. */
export function maxUsers(env = process.env) {
  const value = Number(env.MAX_USERS ?? 50);
  return Number.isInteger(value) && value >= 0 ? value : 50;
}

/** Whether self-service sign-up still has room, counting every account the site has. */
export async function registrationPlaces(client = pool) {
  const limit = maxUsers();
  if (limit === 0) return { limit: null, full: false };
  const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
  return { limit, full: rows[0].n >= limit };
}

export async function signUp(actor, { email, password, options = {} }) {
  const registrationAllowed = process.env.ALLOW_REGISTRATION === 'true';
  const requestedRole = options?.data?.role;
  const role = resolveSignUpRole(actor, requestedRole, registrationAllowed);

  const normalizedEmail = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new HttpError(400, 'Email address is invalid', 'INVALID_EMAIL');
  }

  // Someone signing up on their own must agree to the terms and privacy policy; accounts an administrator creates are exempt.
  if (!actor && options?.data?.acceptTerms !== true) {
    throw new HttpError(400, 'Agree to the terms and privacy policy to create an account.', 'TERMS_REQUIRED');
  }
  const username = String(options?.data?.username || normalizedEmail.split('@')[0]).trim();
  if (username.length < 3 || username.length > 50) {
    throw new HttpError(400, 'Username must contain between 3 and 50 characters', 'INVALID_USERNAME');
  }

  // Anyone signing up on their own must prove they own the address first, whenever email is set up.
  // Accounts an administrator creates, and servers without email, are usable immediately.
  const needsVerification = !actor && mailEnabled();
  const user = await withTransaction(async (client) => {
    if (!actor) {
      // One sign-up at a time past this point, so two people cannot both take the last place.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('draconi_signup_places'))");
      if ((await registrationPlaces(client)).full) {
        throw new HttpError(403, 'All places on this site are taken for now, so new accounts cannot be created.', 'REGISTRATION_FULL');
      }
    }
    const result = await client.query(
      `INSERT INTO users (email, username, role, is_email_verified, terms_accepted_at, terms_version)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [normalizedEmail, username, role, !needsVerification, actor ? null : new Date(), actor ? null : TERMS_VERSION],
    );
    await client.query(
      'INSERT INTO app_credentials (user_id, password_hash) VALUES ($1, $2)',
      [result.rows[0].id, hashPassword(password)],
    );
    return result.rows[0];
  });

  if (!actor) emitAlert('user_registered', { username: user.username, email: user.email });
  if (needsVerification) {
    await sendVerificationEmail(user);
    return { user: publicUser(user), session: null, verificationRequired: true };
  }
  // An admin creating another user must keep the existing admin session.
  const session = actor ? null : await withTransaction((client) => createSession(client, user));
  return { user: publicUser(user), session };
}

export async function signOut(request) {
  const token = getBearerToken(request);
  if (token) await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [hashToken(token)]);
}

// Changing the password or the email address needs the current password as well as a session, so a stolen or
// forgotten-open session cannot take the account over. Wrong guesses count against the same limit as sign-in.
async function requireCurrentPassword(request, user, currentPassword) {
  assertLoginAllowed(request, user.email);
  if (!(await verifyUserPassword(user.id, currentPassword))) {
    recordLoginFailure(request, user.email);
    throw new HttpError(403, 'Your current password is not correct.', 'CURRENT_PASSWORD_INVALID');
  }
  clearLoginFailures(request, user.email);
}

export async function updateAuthUser(request, changes) {
  const user = await currentUser(request);
  const wantsPassword = Boolean(changes.password);
  const newEmail = changes.email === undefined ? null : normalizeEmail(changes.email);
  if (!wantsPassword && newEmail === null) throw new HttpError(400, 'No supported account changes were supplied');
  if (newEmail !== null && !/^\S+@\S+\.\S+$/.test(newEmail)) throw new HttpError(400, 'Email address is invalid');
  await requireCurrentPassword(request, user, changes.currentPassword);

  let emailChangePending = null;
  if (wantsPassword) {
    const passwordHash = hashPassword(changes.password);
    await withTransaction(async (client) => {
      await client.query('UPDATE app_credentials SET password_hash = $1, updated_at = now() WHERE user_id = $2', [passwordHash, user.id]);
      // Every other device is signed out; this one stays.
      await client.query('DELETE FROM app_sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, hashToken(getBearerToken(request))]);
    });
  }
  if (newEmail !== null && newEmail !== normalizeEmail(user.email)) {
    const taken = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [newEmail, user.id]);
    if (taken.rows[0]) throw new HttpError(409, 'That email address is already used by another account.', 'EMAIL_TAKEN');
    if (mailEnabled()) {
      // The address changes only once the new mailbox has confirmed it.
      await requestEmailChange(user, newEmail);
      emailChangePending = newEmail;
    } else {
      await pool.query('UPDATE users SET email = $1 WHERE id = $2', [newEmail, user.id]);
    }
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
  return { user: publicUser(rows[0]), emailChangePending };
}

export async function sessionForRequest(request) {
  const user = await currentUser(request, false);
  if (!user) return null;
  const token = getBearerToken(request);
  const { rows } = await pool.query(
    'SELECT expires_at FROM app_sessions WHERE token_hash = $1',
    [hashToken(token)],
  );
  const expiresAt = new Date(rows[0].expires_at);
  return {
    access_token: token,
    refresh_token: token,
    token_type: 'bearer',
    expires_in: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    user: publicUser(user),
  };
}

export async function bootstrapAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@example.com');
  const password = process.env.ADMIN_PASSWORD || 'change-me-now';
  const username = process.env.ADMIN_USERNAME || 'admin';
  // Only for a database that has no administrator yet. Recreating this account whenever its email is
  // missing would silently resurrect an administrator that was deliberately deleted, with a password
  // taken from the environment file.
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND is_active = true) AS has_admin,
            EXISTS (SELECT 1 FROM users WHERE lower(email) = $1) AS email_taken`,
    [email],
  );
  if (rows[0].has_admin || rows[0].email_taken) return;
  assertSafeBootstrapPassword(password);
  await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (email, username, role, is_email_verified)
       VALUES ($1, $2, 'admin', true) RETURNING id`,
      [email, username],
    );
    await client.query(
      'INSERT INTO app_credentials (user_id, password_hash) VALUES ($1, $2)',
      [result.rows[0].id, hashPassword(password)],
    );
  });
  console.log(`Created bootstrap administrator ${email}`);
}
