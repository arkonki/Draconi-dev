export class HttpError extends Error {
  constructor(status, message, code = 'APP_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(body);
}

export async function readJson(request, maxBytes = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

/**
 * How many proxies of your own stand between the internet and this server (TRUSTED_PROXY_COUNT). 1, the default,
 * is the bundled nginx or an Apache front end on its own. Use 2 when another proxy or load balancer of yours sits
 * in front of that one, and 0 when the server is reached directly with no proxy at all.
 */
export function trustedProxyCount(env = process.env) {
  const raw = env.TRUSTED_PROXY_COUNT;
  if (raw === undefined || raw === '') return 1;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error('TRUSTED_PROXY_COUNT must be an integer between 0 and 10');
  }
  return value;
}

// Each proxy appends the address it received the request from to X-Forwarded-For, so the entries added by our own
// proxies are the last ones and cannot be forged; anything further left was supplied by the client. With one proxy
// the visitor is the last entry. With two, the last entry is only the outer proxy, the same for every visitor,
// which would make every per-address limit count all visitors as one; the visitor is then the entry before it.
export function clientAddress(request, env = process.env) {
  const direct = request.socket?.remoteAddress || 'unknown';
  const proxies = trustedProxyCount(env);
  if (proxies === 0) return direct;
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean);
  // Fewer entries than proxies means the request skipped the outer ones; the first entry is then the nearest to the visitor.
  return forwarded.at(-proxies) || forwarded[0] || direct;
}

export function getBearerToken(request) {
  const value = request.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

export function routePath(request) {
  return new URL(request.url, 'http://localhost').pathname;
}

const INVALID_DATA_MESSAGES = {
  23503: 'This refers to something that does not exist, or is still used elsewhere.',
  23514: 'One of the values is not allowed.',
  '22P02': 'One of the values has the wrong format.',
};

export function handleError(response, error) {
  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: { message: error.message, code: error.code } }, error.headers);
    return;
  }
  if (error?.code === '23505') {
    sendJson(response, 409, { error: { message: 'A record with this value already exists', code: error.code } });
    return;
  }
  const invalid = INVALID_DATA_MESSAGES[error?.code];
  if (invalid) {
    // PostgreSQL's own message names tables, columns and constraints. It goes to the server log; the client is
    // told what kind of problem it was, with the same code as before.
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'invalid_data_rejected',
      code: error.code,
      constraint: error.constraint || null,
      message: String(error.message || '').slice(0, 400),
      requestId: response.req?.requestId || null,
    }));
    sendJson(response, 400, { error: { message: invalid, code: error.code } });
    return;
  }
  console.error(error);
  sendJson(response, 500, { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
}
