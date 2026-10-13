/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.CONN_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.CONN_TEST_DATABASE_URL;
const adminEmail = process.env.CONN_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.CONN_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set CONN_TEST_PASSWORD and CONN_TEST_DATABASE_URL for the disposable test data.');
}

const suffix = randomUUID().slice(0, 8);
const password = `Conn-${suffix}-123!`;
const emails = { a: `cn-a-${suffix}@example.com`, b: `cn-b-${suffix}@example.com` };
const database = new Client({ connectionString: databaseUrl });
const results = {};

async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const sendsBody = body !== undefined && method !== 'GET' && method !== 'DELETE';
  if (sendsBody) headers['content-type'] = 'application/json';
  const response = await fetch(url, { method, headers, body: sendsBody ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}
const api = (method, path, options) => call(method, `${apiBase}${path}`, options);

async function ok(promise, status, label) {
  const result = await promise;
  assert.equal(result.status, status, `${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.payload)}`);
  return result.payload;
}

async function cleanup() {
  await database.query('DELETE FROM oauth_clients WHERE client_id = $1', [`cn-app-${suffix}`]);
  await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
}

await database.connect();
try {
  const admin = (await api('POST', '/auth/sign-in', { body: { email: adminEmail, password: adminPassword } })).payload.session?.access_token;
  assert.ok(admin, 'Administrator sign-in failed');
  const sessions = {};
  for (const [key, email] of Object.entries(emails)) {
    await ok(api('POST', '/auth/sign-up', { token: admin, body: { email, password, options: { data: { username: email.split('@')[0], role: 'dm' } } } }), 201, `create ${key}`);
    sessions[key] = (await api('POST', '/auth/sign-in', { body: { email, password } })).payload.session.access_token;
  }
  const userId = async (email) => (await database.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;

  // --- Nothing without a sign-in.
  await ok(api('GET', '/account/connections'), 401, 'anonymous list');
  await ok(api('POST', '/account/connections/tokens', { body: { name: 'x', access: 'read' } }), 401, 'anonymous create');

  // --- A fresh account has the address and no connections.
  const empty = await ok(api('GET', '/account/connections', { token: sessions.a }), 200, 'list');
  assert.match(empty.mcpUrl, /\/mcp$/);
  assert.deepEqual([empty.apps, empty.tokens], [[], []]);
  results.emptyOverview = 'passed';

  // --- Making a token: validated, shown once, stored hashed.
  await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: '', access: 'read' } }), 400, 'blank name');
  await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: 'x', access: 'root' } }), 400, 'bad access');
  await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: 'x', access: 'read', days: 5 } }), 400, 'bad lifetime');
  const readToken = await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: 'Claude laptop', access: 'read', days: 30 } }), 201, 'create read token');
  assert.match(readToken.token, /^drc_[A-Za-z0-9_-]{43}$/);
  const stored = (await database.query('SELECT token_hash, label, scope FROM oauth_access_tokens WHERE client_id = $1 AND user_id = $2', ['personal-access-token', await userId(emails.a)])).rows;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].token_hash, createHash('sha256').update(readToken.token).digest('hex'), 'only a hash is stored');
  assert.ok(!JSON.stringify(stored).includes(readToken.token), 'the secret itself is never stored');
  assert.deepEqual(stored[0].scope, ['draconi:read']);
  const listed = await ok(api('GET', '/account/connections', { token: sessions.a }), 200, 'list with a token');
  assert.deepEqual(listed.tokens.map((token) => [token.name, token.access, token.lastUsedAt]), [['Claude laptop', 'read', null]]);
  assert.ok(!JSON.stringify(listed).includes(readToken.token), 'listing never repeats the secret');
  results.createToken = 'passed';

  // --- The token authenticates the assistant API, within its scope.
  await ok(api('GET', '/v1/campaigns', { token: readToken.token }), 200, 'token reads campaigns');
  await ok(api('POST', `/v1/campaigns/${randomUUID()}/roll-requests`, { token: readToken.token, body: {} }), 403, 'a read token cannot write');
  const afterUse = await ok(api('GET', '/account/connections', { token: sessions.a }), 200, 'list after use');
  assert.ok(afterUse.tokens[0].lastUsedAt, 'last use is recorded');
  await ok(api('GET', '/account/connections', { token: readToken.token }), 401, 'a token cannot manage connections');
  await ok(api('POST', '/account/connections/tokens', { token: readToken.token, body: { name: 'sneaky', access: 'write' } }), 401, 'a token cannot make more tokens');
  results.tokenScopeAndIsolation = 'passed';

  // --- Limits, and other people's tokens stay out of reach.
  const writeToken = await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: 'GM helper', access: 'write' } }), 201, 'create write token');
  const writeScopes = (await database.query("SELECT scope FROM oauth_access_tokens WHERE label = 'GM helper'")).rows[0].scope;
  assert.deepEqual(writeScopes, ['draconi:read', 'draconi:write']);
  for (let index = 0; index < 8; index += 1) await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: `filler ${index}`, access: 'read' } }), 201, `filler ${index}`);
  await ok(api('POST', '/account/connections/tokens', { token: sessions.a, body: { name: 'one too many', access: 'read' } }), 409, 'the eleventh token is refused');
  assert.deepEqual((await ok(api('GET', '/account/connections', { token: sessions.b }), 200, 'B list')).tokens, [], 'B sees none of A\'s tokens');
  await ok(api('DELETE', `/account/connections/tokens/${readToken.id}`, { token: sessions.b }), 404, 'B cannot remove A\'s token');
  await ok(api('GET', '/v1/campaigns', { token: readToken.token }), 200, 'the token still works after B tried');
  results.limitsAndOwnership = 'passed';

  // --- Removing a token cuts it off at once.
  await ok(api('DELETE', `/account/connections/tokens/${readToken.id}`, { token: sessions.a }), 200, 'A removes the token');
  await ok(api('GET', '/v1/campaigns', { token: readToken.token }), 401, 'the removed token no longer works');
  await ok(api('DELETE', `/account/connections/tokens/${readToken.id}`, { token: sessions.a }), 404, 'removing twice');
  await ok(api('DELETE', '/account/connections/tokens/not-a-token-id', { token: sessions.a }), 400, 'a malformed id');
  await ok(api('GET', '/v1/campaigns', { token: writeToken.token }), 200, 'other tokens are untouched');
  results.revokeToken = 'passed';

  // --- Apps that signed in with OAuth are listed and can be disconnected.
  const clientId = `cn-app-${suffix}`;
  await database.query("INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, 'Test Assistant', '[\"https://example.com/cb\"]'::jsonb)", [clientId]);
  const resource = `${(await ok(api('GET', '/account/connections', { token: sessions.a }), 200, 'for the resource')).mcpUrl}`;
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const oauthAccess = `oauth-access-${suffix}`;
  await database.query("INSERT INTO oauth_access_tokens (token_hash, user_id, client_id, scope, resource, expires_at) VALUES ($1, $2, $3, ARRAY['draconi:read','draconi:write'], $4, now() + interval '1 hour')", [hash(oauthAccess), await userId(emails.a), clientId, resource]);
  await database.query("INSERT INTO oauth_refresh_tokens (token_hash, user_id, client_id, scope, resource, expires_at) VALUES ($1, $2, $3, ARRAY['draconi:read','draconi:write'], $4, now() + interval '30 days')", [hash(`oauth-refresh-${suffix}`), await userId(emails.a), clientId, resource]);
  const withApp = await ok(api('GET', '/account/connections', { token: sessions.a }), 200, 'list with an app');
  assert.deepEqual(withApp.apps.map((app) => [app.clientId, app.name, app.scopes]), [[clientId, 'Test Assistant', ['draconi:read', 'draconi:write']]]);
  assert.equal((await ok(api('GET', '/account/connections', { token: sessions.b }), 200, 'B list')).apps.length, 0, 'B does not see A\'s apps');
  await ok(api('GET', '/v1/campaigns', { token: oauthAccess }), 200, 'the app\'s token works');
  await ok(api('DELETE', `/account/connections/apps/${clientId}`, { token: sessions.b }), 404, 'B cannot disconnect A\'s app');
  await ok(api('DELETE', `/account/connections/apps/${clientId}`, { token: sessions.a }), 200, 'A disconnects the app');
  await ok(api('GET', '/v1/campaigns', { token: oauthAccess }), 401, 'the app is cut off');
  assert.equal((await database.query('SELECT count(*)::int AS n FROM oauth_refresh_tokens WHERE client_id = $1 AND revoked_at IS NULL', [clientId])).rows[0].n, 0, 'refresh tokens are revoked too');
  assert.equal((await ok(api('GET', '/account/connections', { token: sessions.a }), 200, 'list after')).apps.length, 0);
  await ok(api('DELETE', '/account/connections/apps/personal-access-token', { token: sessions.a }), 400, 'the built-in client is not an app');
  await ok(api('DELETE', `/account/connections/apps/${clientId}`, { token: sessions.a }), 404, 'disconnecting twice');
  results.disconnectApp = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
