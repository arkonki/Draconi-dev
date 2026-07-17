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

export function getBearerToken(request) {
  const value = request.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

export function routePath(request) {
  return new URL(request.url, 'http://localhost').pathname;
}

export function handleError(response, error) {
  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: { message: error.message, code: error.code } });
    return;
  }
  if (error?.code === '23505') {
    sendJson(response, 409, { error: { message: 'A record with this value already exists', code: error.code } });
    return;
  }
  if (error?.code === '23503' || error?.code === '23514' || error?.code === '22P02') {
    sendJson(response, 400, { error: { message: error.message, code: error.code } });
    return;
  }
  console.error(error);
  sendJson(response, 500, { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
}
