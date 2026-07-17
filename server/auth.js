import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { getBearerToken, HttpError } from './http.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must contain at least 8 characters');
  }
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, encoded) {
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
  if (!token) {
    if (required) throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
    return null;
  }
  const { rows } = await pool.query(
    `SELECT u.* FROM app_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = true`,
    [hashToken(token)],
  );
  if (!rows[0]) {
    if (required) throw new HttpError(401, 'Session has expired', 'SESSION_EXPIRED');
    return null;
  }
  await pool.query('UPDATE app_sessions SET last_seen_at = now() WHERE token_hash = $1', [hashToken(token)]);
  return rows[0];
}

export async function verifyUserPassword(userId, password) {
  const { rows } = await pool.query('SELECT password_hash FROM app_credentials WHERE user_id = $1', [userId]);
  return Boolean(rows[0] && verifyPassword(String(password || ''), rows[0].password_hash));
}

export async function signIn({ email, password }) {
  const { rows } = await pool.query(
    `SELECT u.*, c.password_hash FROM users u
     JOIN app_credentials c ON c.user_id = u.id
     WHERE lower(u.email) = $1 AND u.is_active = true`,
    [normalizeEmail(email)],
  );
  const user = rows[0];
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    throw new HttpError(400, 'Invalid login credentials', 'INVALID_CREDENTIALS');
  }
  const session = await withTransaction(async (client) => {
    await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    return createSession(client, user);
  });
  return { user: publicUser(user), session };
}

export async function signUp(actor, { email, password, options = {} }) {
  const registrationAllowed = process.env.ALLOW_REGISTRATION === 'true';
  if (!actor && !registrationAllowed) {
    throw new HttpError(403, 'Public registration is disabled. Ask an administrator to create the account.');
  }
  const requestedRole = options?.data?.role;
  const role = actor?.role === 'admin' && ['player', 'dm', 'admin'].includes(requestedRole)
    ? requestedRole
    : 'player';
  const username = String(options?.data?.username || normalizeEmail(email).split('@')[0]).trim();
  if (!username) throw new HttpError(400, 'Username is required');

  const user = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (email, username, role)
       VALUES ($1, $2, $3) RETURNING *`,
      [normalizeEmail(email), username, role],
    );
    await client.query(
      'INSERT INTO app_credentials (user_id, password_hash) VALUES ($1, $2)',
      [result.rows[0].id, hashPassword(password)],
    );
    return result.rows[0];
  });

  // An admin creating another user must keep the existing admin session.
  const session = actor ? null : await withTransaction((client) => createSession(client, user));
  return { user: publicUser(user), session };
}

export async function signOut(request) {
  const token = getBearerToken(request);
  if (token) await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function updateAuthUser(request, changes) {
  const user = await currentUser(request);
  if (changes.password) {
    await pool.query(
      'UPDATE app_credentials SET password_hash = $1, updated_at = now() WHERE user_id = $2',
      [hashPassword(changes.password), user.id],
    );
  }
  if (changes.email) {
    const email = normalizeEmail(changes.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Email address is invalid');
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email, user.id]);
  }
  if (!changes.password && !changes.email) throw new HttpError(400, 'No supported account changes were supplied');
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
  return publicUser(rows[0]);
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
  const { rows } = await pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (rows[0]) return;
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
