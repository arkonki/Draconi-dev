import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';
import { pool } from './db.js';

const apiBaseUrl = process.env.OAUTH_SMOKE_API_URL || 'http://api:3000';
const suffix = randomBytes(6).toString('hex');
const email = `oauth-smoke-${suffix}@example.com`;
const password = `Smoke-${randomBytes(12).toString('base64url')}`;
let userId;
let clientId;

function hidden(html, name) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`));
  assert.ok(match, `Missing ${name} hidden input`);
  return match[1];
}

async function json(response, expectedStatus) {
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

try {
  const inserted = await pool.query(
    `INSERT INTO users (email, username, role, is_email_verified)
     VALUES ($1, $2, 'dm', true) RETURNING id`,
    [email, `oauth-smoke-${suffix}`],
  );
  userId = inserted.rows[0].id;
  await pool.query(
    'INSERT INTO app_credentials (user_id, password_hash) VALUES ($1, $2)',
    [userId, hashPassword(password)],
  );

  const metadata = await json(await fetch(`${apiBaseUrl}/.well-known/oauth-authorization-server`), 200);
  assert.equal(metadata.code_challenge_methods_supported[0], 'S256');
  assert.ok(metadata.registration_endpoint);

  const protectedResource = await json(await fetch(`${apiBaseUrl}/.well-known/oauth-protected-resource`), 200);
  assert.equal(protectedResource.resource, `${metadata.issuer}/mcp`);

  const challengeResponse = await fetch(`${apiBaseUrl}/mcp`, { method: 'POST' });
  assert.equal(challengeResponse.status, 401);
  assert.match(challengeResponse.headers.get('www-authenticate') || '', /resource_metadata=/);

  const registration = await json(await fetch(`${apiBaseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Draconi OAuth smoke test',
      redirect_uris: ['https://client.example/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  }), 201);
  clientId = registration.client_id;

  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorizeUrl = new URL('/oauth/authorize', apiBaseUrl);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', 'https://client.example/callback');
  authorizeUrl.searchParams.set('scope', 'draconi:read draconi:write');
  authorizeUrl.searchParams.set('state', 'oauth-smoke-state');
  authorizeUrl.searchParams.set('resource', protectedResource.resource);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const authorizeResponse = await fetch(authorizeUrl);
  assert.equal(authorizeResponse.status, 200);
  const csrfCookie = (authorizeResponse.headers.get('set-cookie') || '').split(';')[0];
  const authorizeHtml = await authorizeResponse.text();
  const requestId = hidden(authorizeHtml, 'request_id');
  const csrf = hidden(authorizeHtml, 'csrf');

  const consentResponse = await fetch(`${apiBaseUrl}/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: csrfCookie,
    },
    body: new URLSearchParams({ request_id: requestId, csrf, email, password }),
  });
  assert.equal(consentResponse.status, 303);
  const callback = new URL(consentResponse.headers.get('location'));
  assert.equal(callback.searchParams.get('state'), 'oauth-smoke-state');
  const code = callback.searchParams.get('code');
  assert.ok(code);

  const token = await json(await fetch(`${apiBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: 'https://client.example/callback',
      code_verifier: verifier,
      resource: protectedResource.resource,
    }),
  }), 200);
  assert.equal(token.token_type, 'Bearer');
  assert.ok(token.access_token);
  assert.ok(token.refresh_token);

  const campaigns = await json(await fetch(`${apiBaseUrl}/api/v1/campaigns`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  }), 200);
  assert.ok(Array.isArray(campaigns.data.campaigns));

  const initialize = await json(await fetch(`${apiBaseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.access_token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'draconi-oauth-smoke', version: '1.0.0' },
      },
    }),
  }), 200);
  assert.equal(initialize.result.serverInfo.name, 'dragonbane-helper');

  const refreshed = await json(await fetch(`${apiBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: clientId,
      resource: protectedResource.resource,
    }),
  }), 200);
  assert.ok(refreshed.access_token);
  assert.notEqual(refreshed.refresh_token, token.refresh_token);

  console.log(JSON.stringify({
    discovery: 'passed',
    dynamicClientRegistration: 'passed',
    authorizationCodePkce: 'passed',
    helperBearerAuthentication: 'passed',
    mcpInitialization: 'passed',
    refreshTokenRotation: 'passed',
  }, null, 2));
} finally {
  if (clientId) await pool.query('DELETE FROM oauth_clients WHERE client_id = $1', [clientId]);
  if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  await pool.end();
}
