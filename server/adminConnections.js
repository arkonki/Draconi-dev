import { pool, withTransaction } from './db.js';
import { HttpError } from './http.js';
import { audit, requireAdmin } from './adminUsers.js';
import { PERSONAL_CLIENT_ID } from './connections.js';

// An administrator's view of every assistant (MCP client or personal token) that can act as a user, with the
// power to cut one off. Only the connection records are touched: nobody is signed out of the website, and no
// secret is ever shown. Every revocation is written to the administrator activity log.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (value) => (value ? new Date(value).toISOString() : null);

/** Whether a token that was never used shows its creation time as "last seen". */
const usedAt = (lastSeen, created) => (lastSeen && created && new Date(lastSeen).getTime() !== new Date(created).getTime() ? iso(lastSeen) : null);

export async function listAllConnections(actor) {
  requireAdmin(actor);
  const [apps, tokens] = await Promise.all([
    pool.query(
      `SELECT u.id AS user_id, u.username, u.email, c.client_id, c.client_name,
              array_agg(DISTINCT scope_name ORDER BY scope_name) AS scopes,
              min(g.created_at) AS connected_at, max(g.last_seen_at) AS last_used_at, max(g.expires_at) AS expires_at
       FROM (
         SELECT user_id, client_id, scope, created_at, last_seen_at, expires_at
         FROM oauth_access_tokens WHERE expires_at > now() AND client_id <> $1
         UNION ALL
         SELECT user_id, client_id, scope, created_at, NULL::timestamptz, expires_at
         FROM oauth_refresh_tokens WHERE expires_at > now() AND revoked_at IS NULL
       ) g
       JOIN oauth_clients c ON c.client_id = g.client_id
       JOIN users u ON u.id = g.user_id
       CROSS JOIN LATERAL unnest(g.scope) AS scope_name
       GROUP BY u.id, u.username, u.email, c.client_id, c.client_name
       ORDER BY max(g.expires_at) DESC`,
      [PERSONAL_CLIENT_ID],
    ),
    pool.query(
      `SELECT u.id AS user_id, u.username, u.email, substr(t.token_hash, 1, 16) AS id, t.label, t.scope,
              t.created_at, t.last_seen_at, t.expires_at
       FROM oauth_access_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.client_id = $1 AND t.expires_at > now()
       ORDER BY t.created_at DESC`,
      [PERSONAL_CLIENT_ID],
    ),
  ]);
  const connections = [
    ...apps.rows.map((row) => ({
      kind: 'app',
      userId: row.user_id,
      username: row.username,
      email: row.email,
      id: row.client_id,
      name: row.client_name,
      access: row.scopes.includes('draconi:write') ? 'write' : 'read',
      connectedAt: iso(row.connected_at),
      lastUsedAt: usedAt(row.last_used_at, row.connected_at),
      expiresAt: iso(row.expires_at),
    })),
    ...tokens.rows.map((row) => ({
      kind: 'token',
      userId: row.user_id,
      username: row.username,
      email: row.email,
      id: row.id,
      name: row.label || 'Unnamed token',
      access: row.scope.includes('draconi:write') ? 'write' : 'read',
      connectedAt: iso(row.created_at),
      lastUsedAt: usedAt(row.last_seen_at, row.created_at),
      expiresAt: iso(row.expires_at),
    })),
  ];
  return { connections };
}

async function loadUser(client, userId) {
  if (!UUID.test(String(userId || ''))) throw new HttpError(400, 'Invalid user id', 'INVALID_ID');
  const { rows } = await client.query('SELECT id, email FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
  return rows[0];
}

/**
 * Cuts off one connection ({kind: 'app', id: clientId} or {kind: 'token', id}) or, with kind 'all', every
 * connection a user has. Returns how many records were ended.
 */
export async function revokeConnections(actor, { userId, kind, id } = {}) {
  requireAdmin(actor);
  if (!['app', 'token', 'all'].includes(kind)) throw new HttpError(400, 'kind must be app, token or all', 'INVALID_KIND');
  return withTransaction(async (client) => {
    const target = await loadUser(client, userId);
    let ended = 0;
    let label = 'all connections';
    if (kind === 'app') {
      const clientId = String(id || '');
      if (!clientId || clientId.length > 200 || clientId === PERSONAL_CLIENT_ID) throw new HttpError(400, 'Invalid app', 'INVALID_APP');
      const access = await client.query('DELETE FROM oauth_access_tokens WHERE user_id = $1 AND client_id = $2', [userId, clientId]);
      const refresh = await client.query('UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL', [userId, clientId]);
      await client.query('DELETE FROM oauth_authorization_codes WHERE user_id = $1 AND client_id = $2 AND used_at IS NULL', [userId, clientId]);
      ended = access.rowCount + refresh.rowCount;
      const { rows } = await client.query('SELECT client_name FROM oauth_clients WHERE client_id = $1', [clientId]);
      label = rows[0]?.client_name || clientId;
    } else if (kind === 'token') {
      if (!/^[a-f0-9]{16}$/.test(String(id))) throw new HttpError(400, 'Invalid token id', 'INVALID_TOKEN_ID');
      const { rows } = await client.query(
        `DELETE FROM oauth_access_tokens WHERE user_id = $1 AND client_id = $2 AND substr(token_hash, 1, 16) = $3 RETURNING label`,
        [userId, PERSONAL_CLIENT_ID, id],
      );
      ended = rows.length;
      label = rows[0]?.label || 'personal token';
    } else {
      const access = await client.query('DELETE FROM oauth_access_tokens WHERE user_id = $1', [userId]);
      const refresh = await client.query('UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await client.query('DELETE FROM oauth_authorization_codes WHERE user_id = $1 AND used_at IS NULL', [userId]);
      ended = access.rowCount + refresh.rowCount;
    }
    if (ended === 0) throw new HttpError(404, 'That connection was not found', 'CONNECTION_NOT_FOUND');
    await audit(client, actor, 'connection.revoke', target, { kind, connection: label, ended });
    return { revoked: true, ended };
  });
}
