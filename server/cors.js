const ALLOW_HEADERS = 'authorization, content-type, x-upsert, if-match, idempotency-key, x-request-id, x-helper-client, mcp-protocol-version, mcp-session-id, last-event-id';
const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const EXPOSE_HEADERS = 'mcp-session-id, www-authenticate';

// Endpoints meant for third-party clients (OAuth discovery, MCP, Helper REST API).
// They authenticate with bearer tokens, never cookies, so any origin may call them.
export function isPublicClientPath(pathname) {
  return pathname.startsWith('/.well-known/')
    || pathname.startsWith('/oauth/')
    || pathname === '/mcp'
    || pathname.startsWith('/mcp/')
    || pathname === '/openapi.json'
    || pathname === '/docs'
    || pathname.startsWith('/api/v1/');
}

export function allowedOrigins(env = process.env) {
  const origins = new Set();
  const add = (value) => {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore blank or malformed entries.
    }
  };
  add(env.PUBLIC_BASE_URL);
  String(env.CORS_ALLOWED_ORIGINS || '').split(',').map((entry) => entry.trim()).filter(Boolean).forEach(add);
  return origins;
}

// Returns the response headers for a CORS preflight, or null when the origin must not get any.
export function preflightHeaders(pathname, origin, env = process.env) {
  const base = {
    'access-control-allow-headers': ALLOW_HEADERS,
    'access-control-allow-methods': ALLOW_METHODS,
    'access-control-expose-headers': EXPOSE_HEADERS,
  };
  if (isPublicClientPath(pathname)) return { ...base, 'access-control-allow-origin': '*' };
  if (origin && allowedOrigins(env).has(origin)) {
    return { ...base, 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return null;
}
