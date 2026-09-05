import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { authenticateCredentials } from './auth.js';
import { pool, withTransaction } from './db.js';
import { HttpError, readJson, routePath, sendJson } from './http.js';

const SUPPORTED_SCOPES = Object.freeze(['draconi:read', 'draconi:write']);
const AUTHORIZATION_REQUEST_MINUTES = 10;
const AUTHORIZATION_CODE_MINUTES = 5;
const ACCESS_TOKEN_MINUTES = Math.max(5, Number(process.env.OAUTH_ACCESS_TOKEN_MINUTES || 60));
const REFRESH_TOKEN_DAYS = Math.max(1, Number(process.env.OAUTH_REFRESH_TOKEN_DAYS || 30));
const registrationWindows = new Map();
const authorizationAttemptWindows = new Map();

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function base64urlSha256(value) {
  return createHash('sha256').update(String(value)).digest('base64url');
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function configuredPublicBaseUrl() {
  const fallback = `http://localhost:${Number(process.env.PORT || 3000)}`;
  const parsed = new URL(process.env.PUBLIC_BASE_URL || fallback);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('PUBLIC_BASE_URL must be an origin without a path, query, or credentials');
  }
  const localHttp = parsed.protocol === 'http:'
    && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('PUBLIC_BASE_URL must use HTTPS in production');
  }
  return parsed.origin;
}

export function oauthConfiguration() {
  const issuer = configuredPublicBaseUrl();
  return Object.freeze({
    issuer,
    resource: `${issuer}/mcp`,
    authorizationEndpoint: `${issuer}/oauth/authorize`,
    tokenEndpoint: `${issuer}/oauth/token`,
    registrationEndpoint: `${issuer}/oauth/register`,
    protectedResourceMetadata: `${issuer}/.well-known/oauth-protected-resource`,
  });
}

function oauthJson(response, status, value, headers = {}) {
  sendJson(response, status, value, {
    pragma: 'no-cache',
    ...headers,
  });
}

function oauthError(response, status, error, description) {
  oauthJson(response, status, { error, error_description: description });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sendHtml(response, status, markup, headers = {}) {
  const body = Buffer.from(markup);
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...headers,
  });
  response.end(body);
}

function authorizationPage(transaction, { error = '' } = {}) {
  const permissions = transaction.scope.includes('draconi:write')
    ? 'Read campaign data and perform approved game actions as your Draconi user.'
    : 'Read campaign data available to your Draconi user.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Draconi</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #10151b; color: #eef2f4; }
    main { width: min(28rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #35414c; border-radius: 1rem; background: #182029; box-shadow: 0 1rem 3rem #0007; }
    h1 { margin: 0 0 .5rem; font-size: 1.65rem; }
    p { color: #c7d0d8; line-height: 1.5; }
    label { display: grid; gap: .4rem; margin-top: 1rem; font-weight: 650; }
    input { box-sizing: border-box; width: 100%; padding: .75rem; border: 1px solid #52606d; border-radius: .5rem; background: #0f151b; color: white; font: inherit; }
    button { width: 100%; margin-top: 1.25rem; padding: .8rem; border: 0; border-radius: .55rem; background: #d89b3c; color: #18120a; font: inherit; font-weight: 750; cursor: pointer; }
    button.secondary { margin-top: .6rem; background: transparent; color: #c7d0d8; border: 1px solid #52606d; }
    .client { color: #f5c97f; font-weight: 700; }
    .error { padding: .75rem; border-radius: .5rem; background: #6a2525; color: #ffe2e2; }
    small { display: block; margin-top: 1rem; color: #98a5af; line-height: 1.4; }
  </style>
</head>
<body>
  <main>
    <h1>Connect Draconi</h1>
    <p><span class="client">${escapeHtml(transaction.client_name)}</span> is requesting access.</p>
    <p>${escapeHtml(permissions)}</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="request_id" value="${escapeHtml(transaction.id)}">
      <input type="hidden" name="csrf" value="${escapeHtml(transaction.csrf)}">
      <label>Email <input name="email" type="email" autocomplete="username" required autofocus></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit" name="decision" value="allow">Sign in and connect</button>
      <button class="secondary" type="submit" name="decision" value="deny" formnovalidate>Cancel</button>
    </form>
    <small>Your password is checked by Draconi and is never shared with the requesting client. Access remains limited by your campaign role.</small>
  </main>
</body>
</html>`;
}

function oauthCsrfCookie(value, maxAge) {
  const secure = oauthConfiguration().issuer.startsWith('https:') ? '; Secure' : '';
  return `draconi_oauth_csrf=${value}; Path=/oauth/authorize; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

function errorPage(message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Draconi connection error</title></head><body><main><h1>Connection could not be completed</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

async function readForm(request, maxBytes = 64_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new HttpError(413, 'Form submission is too large');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function cookiesFor(request) {
  const result = new Map();
  for (const part of String(request.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    result.set(name, value);
  }
  return result;
}

function validRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === 'https:') return true;
    return process.env.NODE_ENV !== 'production'
      && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function validateClientRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Registration body must be a JSON object', 'invalid_client_metadata');
  }
  const redirectUris = input.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length < 1 || redirectUris.length > 20) {
    throw new HttpError(400, 'redirect_uris must contain between 1 and 20 URLs', 'invalid_redirect_uri');
  }
  if (redirectUris.some((uri) => typeof uri !== 'string' || uri.length > 2048 || !validRedirectUri(uri))) {
    throw new HttpError(400, 'Every redirect URI must be a valid HTTPS URL', 'invalid_redirect_uri');
  }
  const uniqueRedirectUris = [...new Set(redirectUris)];
  const method = input.token_endpoint_auth_method || 'none';
  if (method !== 'none') {
    throw new HttpError(400, 'Only public clients using token_endpoint_auth_method none are supported', 'invalid_client_metadata');
  }
  if (input.grant_types && (!Array.isArray(input.grant_types) || !input.grant_types.includes('authorization_code'))) {
    throw new HttpError(400, 'grant_types must include authorization_code', 'invalid_client_metadata');
  }
  if (input.response_types && (!Array.isArray(input.response_types) || !input.response_types.includes('code'))) {
    throw new HttpError(400, 'response_types must include code', 'invalid_client_metadata');
  }
  const clientName = String(input.client_name || 'ChatGPT').trim().slice(0, 120);
  return {
    client_name: clientName || 'ChatGPT',
    redirect_uris: uniqueRedirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

function enforceRegistrationRateLimit(request) {
  const address = String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  const now = Date.now();
  const current = registrationWindows.get(address);
  if (!current || current.resetAt <= now) {
    registrationWindows.set(address, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 30) throw new HttpError(429, 'Too many client registration requests', 'temporarily_unavailable');
}

function enforceAuthorizationRateLimit(request, email) {
  const address = String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  const key = `${address}:${String(email || '').trim().toLowerCase()}`;
  const now = Date.now();
  const current = authorizationAttemptWindows.get(key);
  if (!current || current.resetAt <= now) {
    authorizationAttemptWindows.set(key, { count: 1, resetAt: now + 5 * 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 10) throw new HttpError(429, 'Too many sign-in attempts. Try again later.', 'temporarily_unavailable');
}

function requestedScopes(value) {
  const scopes = String(value || SUPPORTED_SCOPES.join(' ')).split(/\s+/).filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !SUPPORTED_SCOPES.includes(scope))) {
    throw new HttpError(400, 'An unsupported OAuth scope was requested', 'invalid_scope');
  }
  return [...new Set(scopes)];
}

async function registeredClient(clientId, redirectUri) {
  const { rows } = await pool.query(
    'SELECT * FROM oauth_clients WHERE client_id = $1',
    [clientId],
  );
  const client = rows[0];
  if (!client || !client.redirect_uris.includes(redirectUri)) return null;
  return client;
}

async function beginAuthorization(request, response) {
  const config = oauthConfiguration();
  const url = new URL(request.url, config.issuer);
  const clientId = String(url.searchParams.get('client_id') || '');
  const redirectUri = String(url.searchParams.get('redirect_uri') || '');
  const client = await registeredClient(clientId, redirectUri);
  if (!client) {
    sendHtml(response, 400, errorPage('The OAuth client or redirect address is not registered.'));
    return;
  }
  if (url.searchParams.get('response_type') !== 'code') {
    sendHtml(response, 400, errorPage('Only the OAuth authorization code flow is supported.'));
    return;
  }
  const resource = String(url.searchParams.get('resource') || '');
  if (resource !== config.resource) {
    sendHtml(response, 400, errorPage('The requested MCP resource is invalid.'));
    return;
  }
  const challenge = String(url.searchParams.get('code_challenge') || '');
  if (url.searchParams.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    sendHtml(response, 400, errorPage('A valid S256 PKCE code challenge is required.'));
    return;
  }
  const state = url.searchParams.get('state');
  if (state && state.length > 2048) {
    sendHtml(response, 400, errorPage('The OAuth state value is too large.'));
    return;
  }
  let scope;
  try {
    scope = requestedScopes(url.searchParams.get('scope'));
  } catch (error) {
    sendHtml(response, 400, errorPage(error.message));
    return;
  }

  const csrf = randomToken(24);
  const { rows } = await pool.query(
    `INSERT INTO oauth_authorization_requests
       (client_id, redirect_uri, state, scope, resource, code_challenge, csrf_hash,
        expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             now() + ($8::integer * interval '1 minute'))
     RETURNING id`,
    [clientId, redirectUri, state, scope, resource, challenge, sha256(csrf), AUTHORIZATION_REQUEST_MINUTES],
  );
  const transaction = {
    id: rows[0].id,
    csrf,
    scope,
    client_name: client.client_name,
  };
  sendHtml(response, 200, authorizationPage(transaction), {
    'set-cookie': oauthCsrfCookie(csrf, AUTHORIZATION_REQUEST_MINUTES * 60),
  });
}

async function completeAuthorization(request, response) {
  const form = await readForm(request);
  const requestId = String(form.get('request_id') || '');
  const csrf = String(form.get('csrf') || '');
  const cookieCsrf = cookiesFor(request).get('draconi_oauth_csrf') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    sendHtml(response, 400, errorPage('This authorization request is invalid or has expired. Please start the connection again.'));
    return;
  }
  const { rows } = await pool.query(
    `SELECT ar.*, c.client_name
     FROM oauth_authorization_requests ar
     JOIN oauth_clients c ON c.client_id = ar.client_id
     WHERE ar.id = $1 AND ar.expires_at > now()`,
    [requestId],
  );
  const transaction = rows[0];
  if (!transaction || !safeEqual(csrf, cookieCsrf) || !safeEqual(sha256(csrf), transaction.csrf_hash)) {
    sendHtml(response, 400, errorPage('This authorization request is invalid or has expired. Please start the connection again.'));
    return;
  }

  if (form.get('decision') === 'deny') {
    await pool.query('DELETE FROM oauth_authorization_requests WHERE id = $1', [transaction.id]);
    const redirect = new URL(transaction.redirect_uri);
    redirect.searchParams.set('error', 'access_denied');
    redirect.searchParams.set('error_description', 'The user declined the Draconi connection.');
    if (transaction.state) redirect.searchParams.set('state', transaction.state);
    response.writeHead(303, {
      location: redirect.toString(),
      'cache-control': 'no-store',
      'set-cookie': oauthCsrfCookie('', 0),
    });
    response.end();
    return;
  }

  try {
    enforceAuthorizationRateLimit(request, form.get('email'));
  } catch (error) {
    sendHtml(response, error.status, authorizationPage({ ...transaction, csrf }, { error: error.message }));
    return;
  }
  const user = await authenticateCredentials(form.get('email'), form.get('password'));
  if (!user) {
    sendHtml(response, 401, authorizationPage({ ...transaction, csrf }, {
      error: 'The email address or password was incorrect.',
    }));
    return;
  }

  const code = randomToken(32);
  await withTransaction(async (client) => {
    const locked = await client.query(
      'SELECT 1 FROM oauth_authorization_requests WHERE id = $1 AND expires_at > now() FOR UPDATE',
      [transaction.id],
    );
    if (!locked.rows[0]) throw new HttpError(400, 'Authorization request has expired', 'invalid_request');
    await client.query(
      `INSERT INTO oauth_authorization_codes
         (code_hash, user_id, client_id, redirect_uri, scope, resource,
          code_challenge, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               now() + ($8::integer * interval '1 minute'))`,
      [sha256(code), user.id, transaction.client_id, transaction.redirect_uri,
        transaction.scope, transaction.resource, transaction.code_challenge, AUTHORIZATION_CODE_MINUTES],
    );
    await client.query('DELETE FROM oauth_authorization_requests WHERE id = $1', [transaction.id]);
  });

  const redirect = new URL(transaction.redirect_uri);
  redirect.searchParams.set('code', code);
  if (transaction.state) redirect.searchParams.set('state', transaction.state);
  response.writeHead(303, {
    location: redirect.toString(),
    'cache-control': 'no-store',
    'set-cookie': oauthCsrfCookie('', 0),
  });
  response.end();
}

async function issueTokens(client, { userId, clientId, scope, resource }) {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(48);
  await client.query(
    `INSERT INTO oauth_access_tokens
       (token_hash, user_id, client_id, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5,
             now() + ($6::integer * interval '1 minute'))`,
    [sha256(accessToken), userId, clientId, scope, resource, ACCESS_TOKEN_MINUTES],
  );
  await client.query(
    `INSERT INTO oauth_refresh_tokens
       (token_hash, user_id, client_id, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5,
             now() + ($6::integer * interval '1 day'))`,
    [sha256(refreshToken), userId, clientId, scope, resource, REFRESH_TOKEN_DAYS],
  );
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_MINUTES * 60,
    refresh_token: refreshToken,
    scope: scope.join(' '),
    resource,
  };
}

async function exchangeAuthorizationCode(form, response) {
  const code = String(form.get('code') || '');
  const clientId = String(form.get('client_id') || '');
  const redirectUri = String(form.get('redirect_uri') || '');
  const verifier = String(form.get('code_verifier') || '');
  const resource = String(form.get('resource') || '');
  if (!code || !clientId || !redirectUri || !verifier || !resource) {
    oauthError(response, 400, 'invalid_request', 'code, client_id, redirect_uri, code_verifier, and resource are required.');
    return;
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    oauthError(response, 400, 'invalid_grant', 'The PKCE code verifier is invalid.');
    return;
  }

  try {
    const tokens = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM oauth_authorization_codes
         WHERE code_hash = $1 FOR UPDATE`,
        [sha256(code)],
      );
      const authorization = rows[0];
      if (!authorization || authorization.used_at || new Date(authorization.expires_at) <= new Date()) {
        throw new HttpError(400, 'The authorization code is invalid or expired', 'invalid_grant');
      }
      if (authorization.client_id !== clientId
          || authorization.redirect_uri !== redirectUri
          || authorization.resource !== resource
          || !safeEqual(base64urlSha256(verifier), authorization.code_challenge)) {
        throw new HttpError(400, 'The authorization code parameters do not match', 'invalid_grant');
      }
      await client.query('UPDATE oauth_authorization_codes SET used_at = now() WHERE code_hash = $1', [sha256(code)]);
      return issueTokens(client, {
        userId: authorization.user_id,
        clientId,
        scope: authorization.scope,
        resource,
      });
    });
    oauthJson(response, 200, tokens);
  } catch (error) {
    if (error instanceof HttpError) {
      oauthError(response, error.status, error.code, error.message);
      return;
    }
    throw error;
  }
}

async function exchangeRefreshToken(form, response) {
  const refreshToken = String(form.get('refresh_token') || '');
  const clientId = String(form.get('client_id') || '');
  const resource = String(form.get('resource') || '');
  if (!refreshToken || !clientId || !resource) {
    oauthError(response, 400, 'invalid_request', 'refresh_token, client_id, and resource are required.');
    return;
  }
  try {
    const tokens = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM oauth_refresh_tokens WHERE token_hash = $1 FOR UPDATE',
        [sha256(refreshToken)],
      );
      const stored = rows[0];
      if (!stored || stored.revoked_at || new Date(stored.expires_at) <= new Date()
          || stored.client_id !== clientId || stored.resource !== resource) {
        throw new HttpError(400, 'The refresh token is invalid or expired', 'invalid_grant');
      }
      await client.query('UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [sha256(refreshToken)]);
      return issueTokens(client, {
        userId: stored.user_id,
        clientId,
        scope: stored.scope,
        resource,
      });
    });
    oauthJson(response, 200, tokens);
  } catch (error) {
    if (error instanceof HttpError) {
      oauthError(response, error.status, error.code, error.message);
      return;
    }
    throw error;
  }
}

async function tokenRequest(request, response) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim();
  if (contentType !== 'application/x-www-form-urlencoded') {
    oauthError(response, 415, 'invalid_request', 'The token endpoint requires application/x-www-form-urlencoded.');
    return;
  }
  const form = await readForm(request);
  const grantType = form.get('grant_type');
  if (grantType === 'authorization_code') {
    await exchangeAuthorizationCode(form, response);
    return;
  }
  if (grantType === 'refresh_token') {
    await exchangeRefreshToken(form, response);
    return;
  }
  oauthError(response, 400, 'unsupported_grant_type', 'Only authorization_code and refresh_token grants are supported.');
}

async function registerClient(request, response) {
  enforceRegistrationRateLimit(request);
  const registration = validateClientRegistration(await readJson(request, 100_000));
  const clientId = randomToken(24);
  const { rows } = await pool.query(
    `INSERT INTO oauth_clients
       (client_id, client_name, redirect_uris, token_endpoint_auth_method)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING extract(epoch from created_at)::bigint AS client_id_issued_at`,
    [clientId, registration.client_name, JSON.stringify(registration.redirect_uris), registration.token_endpoint_auth_method],
  );
  oauthJson(response, 201, {
    client_id: clientId,
    client_id_issued_at: Number(rows[0].client_id_issued_at),
    ...registration,
  });
}

export async function authenticateOAuthAccessToken(token, required = true) {
  if (!token) {
    if (required) throw new HttpError(401, 'OAuth bearer token is required', 'AUTH_REQUIRED');
    return null;
  }
  const config = oauthConfiguration();
  const tokenHash = sha256(token);
  const { rows } = await pool.query(
    `SELECT u.*, t.client_id AS oauth_client_id, t.scope AS oauth_scopes
     FROM oauth_access_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.expires_at > now()
       AND t.resource = $2 AND u.is_active = true`,
    [tokenHash, config.resource],
  );
  if (!rows[0]) {
    if (required) throw new HttpError(401, 'OAuth access token is invalid or expired', 'SESSION_EXPIRED');
    return null;
  }
  await pool.query('UPDATE oauth_access_tokens SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]);
  return rows[0];
}

export function oauthBearerChallenge() {
  const config = oauthConfiguration();
  return `Bearer resource_metadata="${config.protectedResourceMetadata}", scope="${SUPPORTED_SCOPES.join(' ')}"`;
}

export async function handleOAuthRequest(request, response) {
  const pathname = routePath(request);
  const config = oauthConfiguration();
  if ((pathname === '/.well-known/oauth-protected-resource'
      || pathname === '/.well-known/oauth-protected-resource/mcp')
      && request.method === 'GET') {
    oauthJson(response, 200, {
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: SUPPORTED_SCOPES,
      resource_documentation: `${config.issuer}/docs`,
    });
    return true;
  }
  if (pathname === '/.well-known/oauth-authorization-server' && request.method === 'GET') {
    oauthJson(response, 200, {
      issuer: config.issuer,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      registration_endpoint: config.registrationEndpoint,
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: SUPPORTED_SCOPES,
    });
    return true;
  }
  if (pathname === '/oauth/register' && request.method === 'POST') {
    try {
      await registerClient(request, response);
    } catch (error) {
      if (error instanceof HttpError) {
        oauthError(response, error.status, error.code || 'invalid_client_metadata', error.message);
      } else {
        throw error;
      }
    }
    return true;
  }
  if (pathname === '/oauth/authorize' && request.method === 'GET') {
    await beginAuthorization(request, response);
    return true;
  }
  if (pathname === '/oauth/authorize' && request.method === 'POST') {
    await completeAuthorization(request, response);
    return true;
  }
  if (pathname === '/oauth/token' && request.method === 'POST') {
    await tokenRequest(request, response);
    return true;
  }
  return false;
}
