import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';
import { invalidateAccessContextCache } from './data.js';
import { pool, withTransaction } from './db.js';
import { HttpError } from './http.js';

const ROLES = ['player', 'dm', 'admin'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rows these tables hold for a user are protected by RESTRICT foreign keys, so they must be handed to
// someone else before the account can be removed.
const RESTRICTED_CONTENT = [
  ['game_sessions', 'created_by'],
  ['game_session_checkpoints', 'created_by'],
  ['campaign_time_roll_reminders', 'created_by'],
  ['solo_npcs', 'created_by'],
  ['solo_treasure_draws', 'created_by'],
];
// Content that would otherwise be deleted with the account but is worth keeping for the campaign.
const KEEPABLE_CONTENT = [
  ['compendium', 'created_by'],
  ['compendium_templates', 'created_by'],
  ['party_display_sessions', 'created_by'],
];

function requireAdmin(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required', 'ADMIN_REQUIRED');
}

function requireUuid(value, label = 'user') {
  if (!UUID.test(String(value || ''))) throw new HttpError(400, `Invalid ${label} id`, 'INVALID_ID');
}

export function normalizeUserChanges(input = {}) {
  const changes = {};
  if (input.email !== undefined) {
    const email = String(input.email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Email address is invalid', 'INVALID_EMAIL');
    changes.email = email;
  }
  if (input.username !== undefined) {
    const username = String(input.username).trim();
    if (username.length < 3 || username.length > 50) {
      throw new HttpError(400, 'Username must contain between 3 and 50 characters', 'INVALID_USERNAME');
    }
    changes.username = username;
  }
  for (const key of ['first_name', 'last_name']) {
    if (input[key] !== undefined) {
      const value = input[key] === null ? '' : String(input[key]).trim();
      if (value.length > 100) throw new HttpError(400, `${key.replace('_', ' ')} is too long`, 'INVALID_NAME');
      changes[key] = value || null;
    }
  }
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`, 'INVALID_ROLE');
    changes.role = input.role;
  }
  if (input.is_active !== undefined) {
    if (typeof input.is_active !== 'boolean') throw new HttpError(400, 'is_active must be true or false', 'INVALID_STATUS');
    changes.is_active = input.is_active;
  }
  return changes;
}

// An administrator may not lock the system out of administration: at least one other active admin
// must remain whenever an admin is demoted, deactivated or deleted.
export function lastAdminProblem(target, changes, otherActiveAdmins) {
  const isActiveAdmin = target.role === 'admin' && target.is_active;
  const staysActiveAdmin = (changes.role === undefined ? target.role : changes.role) === 'admin'
    && (changes.is_active === undefined ? target.is_active : changes.is_active);
  return isActiveAdmin && !staysActiveAdmin && otherActiveAdmins === 0;
}

async function audit(client, actor, action, target, details = {}) {
  await client.query(
    `INSERT INTO admin_audit_log (actor_id, actor_email, action, target_user_id, target_email, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actor.id, actor.email, action, target?.id || null, target?.email || null, JSON.stringify(details)],
  );
}

async function loadTarget(client, id, { lock = false } = {}) {
  requireUuid(id);
  const { rows } = await client.query(`SELECT * FROM users WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
  return rows[0];
}

// Serialises concurrent administrator changes so two admins cannot demote each other at once.
async function otherActiveAdmins(client, targetId) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = true AND id <> $1 FOR UPDATE`,
    [targetId],
  );
  return rows.length;
}

async function revokeAccess(client, userId) {
  const sessions = await client.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM oauth_access_tokens WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM oauth_refresh_tokens WHERE user_id = $1', [userId]);
  return sessions.rowCount;
}

const SUMMARY_COLUMNS = `u.id, u.email, u.username, u.first_name, u.last_name, u.role, u.is_active,
  u.created_at, u.last_login_at`;

export async function listUsers(actor) {
  requireAdmin(actor);
  const { rows } = await pool.query(
    `SELECT ${SUMMARY_COLUMNS},
       EXISTS (SELECT 1 FROM app_credentials c WHERE c.user_id = u.id) AS has_password,
       (SELECT count(*) FROM characters c WHERE c.user_id = u.id)::int AS character_count,
       (SELECT count(*) FROM parties p WHERE p.created_by = u.id)::int AS owned_campaigns,
       (SELECT count(*) FROM campaign_memberships m WHERE m.user_id = u.id)::int AS campaign_count,
       (SELECT count(*) FROM app_sessions s WHERE s.user_id = u.id AND s.expires_at > now())::int AS active_sessions,
       (SELECT max(s.last_seen_at) FROM app_sessions s WHERE s.user_id = u.id) AS last_seen_at
     FROM users u
     ORDER BY u.created_at DESC`,
  );
  return { users: rows };
}

export async function userImpact(actor, id, client = pool) {
  requireAdmin(actor);
  const target = await loadTarget(client, id);
  const count = async (text, values = [id]) => (await client.query(text, values)).rows[0].count;

  const ownedCampaigns = (await client.query(
    `SELECT p.id, p.name,
       (SELECT count(*) FROM campaign_memberships m WHERE m.party_id = p.id AND m.user_id <> p.created_by)::int AS other_members
     FROM parties p WHERE p.created_by = $1 ORDER BY p.name`,
    [id],
  )).rows;

  const restricted = {};
  for (const [table, column] of RESTRICTED_CONTENT) {
    restricted[table] = await count(`SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`);
  }
  const keepable = {};
  for (const [table, column] of KEEPABLE_CONTENT) {
    keepable[table] = await count(`SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`);
  }

  const impact = {
    user: { id: target.id, email: target.email, username: target.username, role: target.role, is_active: target.is_active },
    characters: await count('SELECT count(*)::int AS count FROM characters WHERE user_id = $1'),
    notes: await count('SELECT count(*)::int AS count FROM notes WHERE user_id = $1'),
    messages: await count('SELECT count(*)::int AS count FROM messages WHERE user_id = $1'),
    campaign_memberships: await count('SELECT count(*)::int AS count FROM campaign_memberships WHERE user_id = $1'),
    owned_campaigns: ownedCampaigns,
    restricted_content: restricted,
    keepable_content: keepable,
  };
  impact.needs_transfer = ownedCampaigns.length > 0 || Object.values(restricted).some((value) => value > 0);
  return impact;
}

export async function updateUser(actor, id, input) {
  requireAdmin(actor);
  const changes = normalizeUserChanges(input);
  if (Object.keys(changes).length === 0) throw new HttpError(400, 'No changes were supplied', 'NO_CHANGES');

  const updated = await withTransaction(async (client) => {
    const target = await loadTarget(client, id, { lock: true });
    const touchesAccess = changes.role !== undefined || changes.is_active !== undefined;
    if (target.id === actor.id && touchesAccess && (
      (changes.role !== undefined && changes.role !== target.role)
      || (changes.is_active !== undefined && changes.is_active !== target.is_active)
    )) {
      throw new HttpError(409, 'You cannot change your own role or deactivate your own account.', 'SELF_PROTECTION');
    }
    if (touchesAccess && target.role === 'admin' && lastAdminProblem(target, changes, await otherActiveAdmins(client, target.id))) {
      throw new HttpError(409, 'This is the last active administrator. Promote someone else first.', 'LAST_ADMIN');
    }

    const keys = Object.keys(changes);
    const assignments = keys.map((key, index) => `${key} = $${index + 1}`);
    const values = keys.map((key) => changes[key]);
    if (changes.is_active !== undefined) assignments.push(`account_status = '${changes.is_active ? 'active' : 'suspended'}'`);
    let row;
    try {
      row = (await client.query(
        `UPDATE users SET ${assignments.join(', ')}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, id],
      )).rows[0];
    } catch (error) {
      if (error?.code === '23505') {
        throw new HttpError(409, error.constraint === 'users_email_key' ? 'That email is already in use' : 'That username is already taken', 'DUPLICATE');
      }
      throw error;
    }

    let revoked = 0;
    if (changes.is_active === false) revoked = await revokeAccess(client, id);
    const before = Object.fromEntries(keys.map((key) => [key, target[key]]));
    await audit(client, actor, changes.is_active === false ? 'user.deactivate' : changes.is_active === true && !target.is_active ? 'user.reactivate' : 'user.update', row, {
      before, after: changes, sessionsRevoked: revoked,
    });
    return row;
  });
  invalidateAccessContextCache();
  return { user: updated };
}

export function generateTemporaryPassword() {
  // 16 characters from a URL-safe alphabet: easy to copy, ~96 bits of entropy.
  return randomBytes(12).toString('base64url');
}

export async function resetPassword(actor, id, { password } = {}) {
  requireAdmin(actor);
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    throw new HttpError(400, 'Password must contain at least 8 characters', 'WEAK_PASSWORD');
  }
  const temporaryPassword = password || generateTemporaryPassword();
  const hash = hashPassword(temporaryPassword);
  const revoked = await withTransaction(async (client) => {
    const target = await loadTarget(client, id, { lock: true });
    const hadCredentials = (await client.query('SELECT 1 FROM app_credentials WHERE user_id = $1', [id])).rowCount > 0;
    await client.query(
      `INSERT INTO app_credentials (user_id, password_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
      [id, hash],
    );
    const count = await revokeAccess(client, id);
    await audit(client, actor, 'user.reset_password', target, { generated: !password, hadCredentials, sessionsRevoked: count });
    return count;
  });
  return { password: temporaryPassword, generated: !password, sessionsRevoked: revoked };
}

export async function revokeUserSessions(actor, id) {
  requireAdmin(actor);
  return withTransaction(async (client) => {
    const target = await loadTarget(client, id);
    const revoked = await revokeAccess(client, id);
    await audit(client, actor, 'user.revoke_sessions', target, { sessionsRevoked: revoked });
    return { sessionsRevoked: revoked };
  });
}

export async function deleteUser(actor, id, { confirmEmail, transferTo } = {}) {
  requireAdmin(actor);
  requireUuid(id);
  if (transferTo !== undefined && transferTo !== null) requireUuid(transferTo, 'transfer target');

  const result = await withTransaction(async (client) => {
    const target = await loadTarget(client, id, { lock: true });
    if (target.id === actor.id) throw new HttpError(409, 'You cannot delete your own account.', 'SELF_PROTECTION');
    if (String(confirmEmail || '').trim().toLowerCase() !== target.email.toLowerCase()) {
      throw new HttpError(400, 'Type the user\'s email address to confirm the deletion.', 'CONFIRMATION_MISMATCH');
    }
    if (target.role === 'admin' && lastAdminProblem(target, { is_active: false }, await otherActiveAdmins(client, target.id))) {
      throw new HttpError(409, 'This is the last active administrator and cannot be deleted.', 'LAST_ADMIN');
    }

    const impact = await userImpact(actor, id, client);
    let heir = null;
    if (transferTo) {
      if (transferTo === id) throw new HttpError(400, 'Content cannot be transferred to the user being deleted', 'INVALID_TRANSFER');
      heir = (await client.query('SELECT id, email, is_active FROM users WHERE id = $1', [transferTo])).rows[0];
      if (!heir || !heir.is_active) throw new HttpError(400, 'The transfer target must be an existing, active user', 'INVALID_TRANSFER');
    }
    if (impact.needs_transfer && !heir) {
      throw new HttpError(409, 'This user owns campaigns or campaign content. Choose who should take it over.', 'TRANSFER_REQUIRED', );
    }

    const transferred = {};
    if (heir) {
      // The parties_ensure_campaign_owner trigger makes the new creator the owner. The departing owner's
      // own membership must go first: it still says "owner", and the database refuses any change to an
      // owner row that does not belong to the campaign creator (the invited_by SET NULL on delete is one).
      const parties = await client.query('UPDATE parties SET created_by = $1 WHERE created_by = $2 RETURNING id', [heir.id, id]);
      const partyIds = parties.rows.map((row) => row.id);
      if (partyIds.length > 0) {
        await client.query('DELETE FROM campaign_memberships WHERE user_id = $1 AND party_id = ANY($2::uuid[])', [id, partyIds]);
      }
      transferred.campaigns = parties.rowCount;
      for (const [table, column] of [...RESTRICTED_CONTENT, ...KEEPABLE_CONTENT]) {
        const moved = await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [heir.id, id]);
        if (moved.rowCount) transferred[table] = moved.rowCount;
      }
    }

    await audit(client, actor, 'user.delete', target, {
      username: target.username,
      role: target.role,
      transferredTo: heir ? heir.email : null,
      transferred,
      removed: {
        characters: impact.characters,
        notes: impact.notes,
        messages: impact.messages,
        campaign_memberships: impact.campaign_memberships,
      },
    });
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    return { deleted: { id: target.id, email: target.email, username: target.username }, transferred, removed: impact };
  });
  invalidateAccessContextCache();
  return result;
}

export async function listAuditLog(actor, { limit = 100, userId = null } = {}) {
  requireAdmin(actor);
  const bounded = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const filter = userId && UUID.test(userId) ? 'WHERE target_user_id = $2' : '';
  const { rows } = await pool.query(
    `SELECT id, created_at, actor_id, actor_email, action, target_user_id, target_email, details
     FROM admin_audit_log ${filter} ORDER BY created_at DESC, id DESC LIMIT $1`,
    filter ? [bounded, userId] : [bounded],
  );
  return { entries: rows };
}
