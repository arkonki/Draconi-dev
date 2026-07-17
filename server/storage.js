import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError, sendJson } from './http.js';

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || '/data/storage');
const ALLOWED_BUCKETS = new Set(['images']);

function safePath(bucket, objectPath = '') {
  if (!ALLOWED_BUCKETS.has(bucket)) throw new HttpError(400, 'Unknown storage bucket');
  const normalized = objectPath.replaceAll('\\', '/').replace(/^\/+/, '');
  const resolved = path.resolve(STORAGE_ROOT, bucket, normalized);
  const bucketRoot = path.resolve(STORAGE_ROOT, bucket);
  if (resolved !== bucketRoot && !resolved.startsWith(`${bucketRoot}${path.sep}`)) {
    throw new HttpError(400, 'Invalid storage path');
  }
  return resolved;
}

export async function uploadObject(request, bucket, objectPath) {
  const target = safePath(bucket, objectPath);
  const chunks = [];
  let size = 0;
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 25_000_000);
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Uploaded file is too large');
    chunks.push(chunk);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.concat(chunks), { flag: request.headers['x-upsert'] === 'true' ? 'w' : 'wx' }).catch((error) => {
    if (error.code === 'EEXIST') throw new HttpError(409, 'Object already exists');
    throw error;
  });
  return { path: objectPath, fullPath: `${bucket}/${objectPath}` };
}

export async function listObjects(bucket, folder = '', limit = 100) {
  const target = safePath(bucket, folder);
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const values = await Promise.all(entries.slice(0, Math.min(Number(limit) || 100, 500)).map(async (entry) => {
    const entryPath = path.join(target, entry.name);
    const details = await stat(entryPath);
    return {
      id: entry.isDirectory() ? `${entry.name}/` : entry.name,
      name: entry.name,
      created_at: details.birthtime.toISOString(),
      updated_at: details.mtime.toISOString(),
      last_accessed_at: details.atime.toISOString(),
      metadata: { size: details.size },
    };
  }));
  return values.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function removeObjects(bucket, paths) {
  for (const objectPath of paths || []) {
    const target = safePath(bucket, objectPath);
    await rm(target, { force: true, recursive: false });
  }
  return (paths || []).map((name) => ({ name }));
}

const MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
};

export async function servePublicObject(response, bucket, objectPath) {
  const target = safePath(bucket, objectPath);
  let details;
  try {
    details = await stat(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(response, 404, { error: { message: 'Object not found' } });
      return;
    }
    throw error;
  }
  if (!details.isFile()) throw new HttpError(404, 'Object not found');
  response.writeHead(200, {
    'content-type': MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'content-length': details.size,
    'cache-control': 'public, max-age=3600',
  });
  createReadStream(target).pipe(response);
}
