import { createHash, randomBytes } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { HttpError } from './http.js';
import { oauthConfiguration } from './oauth.js';

// Lets a signed-in user see which assistants (MCP clients) can act as them, connect one by hand with a
// personal access token, and cut any of them off. Management needs a web session: an OAuth or personal
// token can never be used to create more tokens or to disconnect others.

export const PERSONAL_CLIENT_ID = 'personal-access-token';
export const TOKEN_PREFIX = 'drc_';
export const MAX_ACTIVE_TOKENS = 10;
export const ALLOWED_TOKEN_DAYS = Object.freeze([7, 30, 90, 365]);

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/** Checks what the person asked for when creating a token. Pure, so it is tested without a database. */
export function parseTokenRequest(body) {
  const name = String(body?.name ?? '').trim();
  if (name.length < 1 || name.length > 60) throw new HttpError(400, 'Give the token a name of up to 60 characters', 'INVALID_TOKEN_NAME');
  const access = body?.access === 'write' ? 'write' : body?.access === 'read' ? 'read' : null;
  if (!access) throw new HttpError(400, 'access must be "read" or "write"', 'INVALID_TOKEN_ACCESS');
  const days = Number(body?.days ?? 90);
  if (!ALLOWED_TOKEN_DAYS.includes(days)) throw new HttpError(400, `days must be one of ${ALLOWED_TOKEN_DAYS.join(', ')}`, 'INVALID_TOKEN_LIFETIME');
  return { name, access, days, scope: access === 'write' ? ['draconi:read', 'draconi:write'] : ['draconi:read'] };
}

const iso = (value) => (value ? new Date(value).toISOString() : null);

export async function listConnections(user) {
  const config = oauthConfiguration();
  const [apps, tokens] = await Promise.all([
    pool.query(
      `SELECT c.client_id, c.client_name,
              array_agg(DISTINCT scope_name ORDER BY scope_name) AS scopes,
              min(g.created_at) AS connected_at,
              max(g.last_seen_at) AS last_used_at,
              max(g.expires_at) AS expires_at
       FROM oauth_clients c
       JOIN (
         SELECT client_id, scope, created_at, last_seen_at, expires_at
         FROM oauth_access_tokens WHERE user_id = $1 AND expires_at > now()
         UNION ALL
         SELECT client_id, scope, created_at, NULL::timestamptz, expires_at
         FROM oauth_refresh_tokens WHERE user_id = $1 AND expires_at > now() AND revoked_at IS NULL
       ) g ON g.client_id = c.client_id
       CROSS JOIN LATERAL unnest(g.scope) AS scope_name
       WHERE c.client_id <> $2
       GROUP BY c.client_id, c.client_name
       ORDER BY max(g.expires_at) DESC`,
      [user.id, PERSONAL_CLIENT_ID],
    ),
    pool.query(
      `SELECT substr(token_hash, 1, 16) AS id, label, scope, created_at, last_seen_at, expires_at
       FROM oauth_access_tokens
       WHERE user_id = $1 AND client_id = $2 AND expires_at > now()
       ORDER BY created_at DESC`,
      [user.id, PERSONAL_CLIENT_ID],
    ),
  ]);
  return {
    mcpUrl: config.resource,
    authorizationServer: config.issuer,
    scopes: [
      { id: 'draconi:read', label: 'Read the campaigns you can see' },
      { id: 'draconi:write', label: 'Make game changes as you, such as combat, rolls and notes' },
    ],
    maxTokens: MAX_ACTIVE_TOKENS,
    tokenLifetimes: ALLOWED_TOKEN_DAYS,
    apps: apps.rows.map((row) => ({
      clientId: row.client_id,
      name: row.client_name,
      scopes: row.scopes,
      connectedAt: iso(row.connected_at),
      lastUsedAt: row.last_used_at && new Date(row.last_used_at).getTime() !== new Date(row.connected_at).getTime() ? iso(row.last_used_at) : null,
      expiresAt: iso(row.expires_at),
    })),
    tokens: tokens.rows.map((row) => ({
      id: row.id,
      name: row.label || 'Unnamed token',
      access: row.scope.includes('draconi:write') ? 'write' : 'read',
      createdAt: iso(row.created_at),
      // A token that has never been used still has the moment it was made as its "last seen".
      lastUsedAt: new Date(row.last_seen_at).getTime() === new Date(row.created_at).getTime() ? null : iso(row.last_seen_at),
      expiresAt: iso(row.expires_at),
    })),
  };
}

/** Makes a token. The secret is returned once, here, and only its hash is kept. */
export async function createPersonalToken(user, body) {
  const request = parseTokenRequest(body);
  const config = oauthConfiguration();
  return withTransaction(async (client) => {
    // Serialise a person's token creation so two requests cannot both slip under the limit.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`personal-token:${user.id}`]);
    const { rows: counts } = await client.query(
      'SELECT count(*)::int AS n FROM oauth_access_tokens WHERE user_id = $1 AND client_id = $2 AND expires_at > now()',
      [user.id, PERSONAL_CLIENT_ID],
    );
    if (counts[0].n >= MAX_ACTIVE_TOKENS) {
      throw new HttpError(409, `You can have at most ${MAX_ACTIVE_TOKENS} active tokens. Remove one first.`, 'TOKEN_LIMIT');
    }
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const { rows } = await client.query(
      `INSERT INTO oauth_access_tokens (token_hash, user_id, client_id, scope, resource, expires_at, label)
       VALUES ($1, $2, $3, $4, $5, now() + ($6::integer * interval '1 day'), $7)
       RETURNING substr(token_hash, 1, 16) AS id, expires_at`,
      [sha256(token), user.id, PERSONAL_CLIENT_ID, request.scope, config.resource, request.days, request.name],
    );
    return { token, id: rows[0].id, name: request.name, access: request.access, expiresAt: iso(rows[0].expires_at) };
  });
}

export async function revokePersonalToken(user, id) {
  if (!/^[a-f0-9]{16}$/.test(String(id))) throw new HttpError(400, 'Invalid token id', 'INVALID_TOKEN_ID');
  const result = await pool.query(
    `DELETE FROM oauth_access_tokens
     WHERE user_id = $1 AND client_id = $2 AND substr(token_hash, 1, 16) = $3`,
    [user.id, PERSONAL_CLIENT_ID, id],
  );
  if (result.rowCount === 0) throw new HttpError(404, 'That token was not found', 'TOKEN_NOT_FOUND');
  return { revoked: true };
}

/** Ends everything an app was allowed to do as this user: its tokens, its refresh tokens and any unused sign-in code. */
export async function revokeApp(user, clientId) {
  const id = String(clientId || '');
  if (!id || id.length > 200 || id === PERSONAL_CLIENT_ID) throw new HttpError(400, 'Invalid app', 'INVALID_APP');
  return withTransaction(async (client) => {
    const access = await client.query('DELETE FROM oauth_access_tokens WHERE user_id = $1 AND client_id = $2', [user.id, id]);
    const refresh = await client.query(
      'UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL',
      [user.id, id],
    );
    await client.query('DELETE FROM oauth_authorization_codes WHERE user_id = $1 AND client_id = $2 AND used_at IS NULL', [user.id, id]);
    if (access.rowCount + refresh.rowCount === 0) throw new HttpError(404, 'That app is not connected', 'APP_NOT_FOUND');
    return { revoked: true };
  });
}
