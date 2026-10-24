import { verifyUserPassword } from './auth.js';
import { pool, withTransaction } from './db.js';
import { HttpError } from './http.js';
import { audit, computeUserImpact } from './adminUsers.js';
import { invalidateAccessContextCache } from './data.js';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from './loginRateLimit.js';
import { removeObjects } from './storage.js';
import { legalContact } from './legal.js';

// A person's right to take their data with them and to leave: a download of everything the app holds about them,
// and deletion of their own account.

const PROFILE_COLUMNS = 'id, email, username, first_name, last_name, avatar_url, bio, role, created_at, last_login_at, terms_accepted_at, terms_version';
// Tables with a user_id column whose rows belong to the person. Secrets (password hash, the AI key) are never included.
const OWNED_TABLES = [
  ['characters', 'user_id'],
  ['notes', 'user_id'],
  ['messages', 'user_id'],
  ['campaign_memberships', 'user_id'],
  ['user_notification_settings', 'user_id'],
];
const CREATED_TABLES = [
  ['parties', 'created_by'],
  ['compendium', 'created_by'],
  ['game_sessions', 'created_by'],
];

export async function exportMyData(user) {
  const { rows } = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`, [user.id]);
  const data = { exportedAt: new Date().toISOString(), profile: rows[0] };
  for (const [table, column] of [...OWNED_TABLES, ...CREATED_TABLES]) {
    try {
      data[table] = (await pool.query(`SELECT * FROM ${table} WHERE ${column} = $1`, [user.id])).rows;
    } catch (error) {
      // A table this installation does not have is simply not part of the export.
      if (error.code !== '42P01' && error.code !== '42703') throw error;
    }
  }
  const { rows: images } = await pool.query('SELECT bucket, path, size, created_at FROM storage_objects WHERE owner_id = $1 ORDER BY created_at', [user.id]);
  data.uploaded_images = images.map((image) => ({ ...image, url: `/api/storage/public/${image.bucket}/${image.path}` }));
  return data;
}

export async function deleteMyAccount(request, user, { password } = {}) {
  assertLoginAllowed(request, user.email);
  if (!(await verifyUserPassword(user.id, password))) {
    recordLoginFailure(request, user.email);
    throw new HttpError(403, 'Your password is not correct.', 'CURRENT_PASSWORD_INVALID');
  }
  clearLoginFailures(request, user.email);
  const { contactEmail } = legalContact();
  const contact = contactEmail ? ` (${contactEmail})` : '';
  if (user.role === 'admin') {
    throw new HttpError(403, 'Administrator accounts must be removed by another administrator.', 'ADMIN_SELF_DELETE');
  }

  let imagePaths = [];
  const result = await withTransaction(async (client) => {
    const impact = await computeUserImpact(user.id, client);
    if (impact.needs_transfer) {
      throw new HttpError(409, `You own campaigns or campaign content that other people may rely on. Ask an administrator${contact} to hand them over first; then you can delete your account.`, 'TRANSFER_REQUIRED');
    }
    imagePaths = (await client.query("SELECT path FROM storage_objects WHERE bucket = 'images' AND owner_id = $1", [user.id])).rows.map((row) => row.path);
    await audit(client, user, 'user.self_delete', user, {
      username: user.username,
      removed: { characters: impact.characters, notes: impact.notes, messages: impact.messages, campaign_memberships: impact.campaign_memberships },
    });
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    return { deleted: true };
  });
  invalidateAccessContextCache();
  // The images people uploaded go with them. A failure here must not undo a deletion that already happened.
  if (imagePaths.length > 0) await removeObjects('images', imagePaths).catch((error) => console.error(`Unable to remove a deleted account's images: ${error.message}`));
  return result;
}
