import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PUBLIC_ROOT = fileURLToPath(new URL('../dist/', import.meta.url));

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

// The app loads scripts and data only from its own origin. Styles may be inline (React style props and
// Tailwind arbitrary values) and Google Fonts are used for headings; images may come from any HTTPS host
// because campaign art and token icons can be linked by URL.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

export function securityHeaders(request, env = process.env) {
  const secure = String(request.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
    || String(env.PUBLIC_BASE_URL || '').startsWith('https://');
  return {
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    ...(secure ? { 'strict-transport-security': 'max-age=31536000' } : {}),
  };
}

function safePublicPath(publicRoot, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0')) return null;

  const root = resolve(publicRoot);
  const relativePath = decodedPath.replace(/^\/+/, '');
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return null;
  return filePath;
}

async function regularFileDetails(filePath) {
  try {
    const details = await stat(filePath);
    return details.isFile() ? details : null;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

function cacheControl(pathname) {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (pathname === '/sw.js' || pathname === '/manifest.webmanifest') return 'no-cache';
  return 'public, max-age=3600';
}

export function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function contentTypeFor(filePath) {
  return CONTENT_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
}

export async function serveFrontend(request, response, publicRoot = DEFAULT_PUBLIC_ROOT) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;

  const url = new URL(request.url, 'http://localhost');
  const pathname = url.pathname;
  if (isApiPath(pathname)) return false;

  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const candidatePath = safePublicPath(publicRoot, requestedPath);
  if (!candidatePath) return false;

  let filePath = candidatePath;
  let details = await regularFileDetails(filePath);

  // Client-side routes have no extension. Serve the app shell for those while
  // retaining real 404 responses for missing assets and other files.
  if (!details && !extname(pathname)) {
    filePath = resolve(publicRoot, 'index.html');
    details = await regularFileDetails(filePath);
  }

  if (!details) return false;

  response.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'content-length': details.size,
    'last-modified': details.mtime.toUTCString(),
    'cache-control': filePath.endsWith(`${sep}index.html`) ? 'no-cache' : cacheControl(pathname),
    ...securityHeaders(request),
  });

  if (request.method === 'HEAD') {
    response.end();
    return true;
  }

  createReadStream(filePath).pipe(response);
  return true;
}
