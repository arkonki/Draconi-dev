import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { HttpError, sendJson } from './http.js';

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || '/data/storage');
const ALLOWED_BUCKETS = new Set(['images']);
const IMAGE_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';
const configuredPixelLimit = Number(process.env.MAX_IMAGE_PIXELS || 40_000_000);
const MAX_IMAGE_PIXELS = Number.isSafeInteger(configuredPixelLimit) && configuredPixelLimit > 0
  ? configuredPixelLimit
  : 40_000_000;
const VARIANTS = Object.freeze({
  thumbnail: { width: 256, height: 256, quality: 78 },
  medium: { width: 1280, height: 1280, quality: 82 },
  large: { width: 2400, height: 2400, quality: 85 },
});
const TRANSFORMABLE_FORMATS = new Set([
  'avif', 'gif', 'heif', 'jpeg', 'jpg', 'png', 'svg', 'tiff', 'webp',
]);
const variantPromises = new Map();
let variantQueue = Promise.resolve();

// Image work is intentionally conservative for small self-hosted servers. The
// queue below serializes transforms, while these Sharp limits prevent its own
// worker/cache defaults from producing a second memory spike.
sharp.concurrency(1);
sharp.cache({ memory: 32, files: 20, items: 100 });

const MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
};

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

function variantPath(bucket, objectPath, variant) {
  const originalPath = safePath(bucket, objectPath);
  const bucketRoot = path.resolve(STORAGE_ROOT, bucket);
  const relativePath = path.relative(bucketRoot, originalPath);
  return path.resolve(STORAGE_ROOT, '.variants', bucket, `${relativePath}.${variant}.webp`);
}

async function fileDetails(filePath) {
  try {
    const details = await stat(filePath);
    return details.isFile() ? details : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

function byteLimitTransform(maxBytes) {
  let size = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(new HttpError(413, 'Uploaded file is too large'));
        return;
      }
      callback(null, chunk);
    },
  });
}

function sharpInput(filePath) {
  return sharp(filePath, {
    animated: false,
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
  });
}

async function inspectUploadedImage(filePath, objectPath, contentType) {
  const extension = path.extname(objectPath).toLowerCase();
  const looksLikeImage = String(contentType || '').toLowerCase().startsWith('image/')
    || Object.hasOwn(MIME_TYPES, extension);
  if (!looksLikeImage) return null;
  try {
    const metadata = await sharpInput(filePath).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error('Image dimensions are unavailable');
    }
    return metadata;
  } catch {
    throw new HttpError(400, 'Uploaded image is invalid, unsupported, or exceeds the pixel limit');
  }
}

async function generateVariant(sourcePath, targetPath, variant) {
  const settings = VARIANTS[variant];
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await sharpInput(sourcePath)
      .rotate()
      .resize({
        width: settings.width,
        height: settings.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: settings.quality, effort: 4 })
      .toFile(temporaryPath);
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
  return targetPath;
}

function scheduleVariant(sourcePath, targetPath, variant) {
  const operation = variantQueue.then(
    () => generateVariant(sourcePath, targetPath, variant),
    () => generateVariant(sourcePath, targetPath, variant),
  );
  variantQueue = operation.catch(() => {});
  return operation;
}

async function ensureVariant(bucket, objectPath, variant, originalPath, originalDetails) {
  const targetPath = variantPath(bucket, objectPath, variant);
  const existing = await fileDetails(targetPath);
  if (existing && existing.mtimeMs >= originalDetails.mtimeMs) return targetPath;

  const promiseKey = `${bucket}:${objectPath}:${variant}`;
  if (!variantPromises.has(promiseKey)) {
    const promise = scheduleVariant(originalPath, targetPath, variant)
      .finally(() => variantPromises.delete(promiseKey));
    variantPromises.set(promiseKey, promise);
  }
  return variantPromises.get(promiseKey);
}

async function generateAllVariants(bucket, objectPath, originalPath, metadata) {
  if (!TRANSFORMABLE_FORMATS.has(String(metadata?.format || '').toLowerCase())) return {};
  const entries = [];
  for (const variant of Object.keys(VARIANTS)) {
    const targetPath = variantPath(bucket, objectPath, variant);
    await scheduleVariant(originalPath, targetPath, variant);
    const details = await stat(targetPath);
    entries.push([variant, { format: 'webp', size: details.size }]);
  }
  return Object.fromEntries(entries);
}

export async function uploadObject(request, bucket, objectPath) {
  const target = safePath(bucket, objectPath);
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 25_000_000);
  const allowOverwrite = request.headers['x-upsert'] === 'true';
  if (!allowOverwrite && await fileDetails(target)) throw new HttpError(409, 'Object already exists');

  const uploadDirectory = path.resolve(STORAGE_ROOT, '.uploads');
  const temporaryPath = path.join(uploadDirectory, randomUUID());
  await mkdir(uploadDirectory, { recursive: true });
  await mkdir(path.dirname(target), { recursive: true });

  let metadata = null;
  try {
    await pipeline(request, byteLimitTransform(maxBytes), createWriteStream(temporaryPath, { flags: 'wx' }));
    metadata = await inspectUploadedImage(temporaryPath, objectPath, request.headers['content-type']);

    if (allowOverwrite) {
      await rename(temporaryPath, target);
    } else {
      await link(temporaryPath, target).catch((error) => {
        if (error.code === 'EEXIST') throw new HttpError(409, 'Object already exists');
        throw error;
      });
      await rm(temporaryPath, { force: true });
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }

  let variants = {};
  if (metadata) {
    try {
      variants = await generateAllVariants(bucket, objectPath, target, metadata);
    } catch (error) {
      console.warn('Unable to generate image variants:', error);
    }
  }

  const details = await stat(target);
  return {
    path: objectPath,
    fullPath: `${bucket}/${objectPath}`,
    metadata: metadata ? {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      size: details.size,
    } : { size: details.size },
    variants,
  };
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
    await Promise.all(Object.keys(VARIANTS).map((variant) => (
      rm(variantPath(bucket, objectPath, variant), { force: true }).catch(() => {})
    )));
  }
  return (paths || []).map((name) => ({ name }));
}

function entityTag(details) {
  return `"${details.size.toString(16)}-${Math.trunc(details.mtimeMs).toString(16)}"`;
}

function isNotModified(request, details, etag) {
  const ifNoneMatch = String(request.headers['if-none-match'] || '');
  if (ifNoneMatch) {
    return ifNoneMatch.split(',').some((value) => value.trim() === etag || value.trim() === '*');
  }
  const ifModifiedSince = Date.parse(String(request.headers['if-modified-since'] || ''));
  return Number.isFinite(ifModifiedSince)
    && Math.floor(details.mtimeMs / 1000) <= Math.floor(ifModifiedSince / 1000);
}

function byteRange(request, size) {
  const value = String(request.headers.range || '');
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return false;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    return false;
  }
  return { start, end };
}

export async function servePublicObject(request, response, bucket, objectPath) {
  const originalPath = safePath(bucket, objectPath);
  const originalDetails = await fileDetails(originalPath);
  if (!originalDetails) {
    sendJson(response, 404, { error: { message: 'Object not found' } });
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const requestedVariant = url.searchParams.get('variant');
  if (requestedVariant && !Object.hasOwn(VARIANTS, requestedVariant)) {
    throw new HttpError(400, 'Unknown image variant');
  }

  let target = originalPath;
  let contentType = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
  if (requestedVariant) {
    try {
      target = await ensureVariant(bucket, objectPath, requestedVariant, originalPath, originalDetails);
      contentType = 'image/webp';
    } catch (error) {
      console.warn('Unable to create requested image variant; serving the original:', error);
      target = originalPath;
    }
  }

  const details = await stat(target);
  const etag = entityTag(details);
  const commonHeaders = {
    'content-type': contentType,
    'last-modified': details.mtime.toUTCString(),
    'cache-control': IMAGE_CACHE_CONTROL,
    etag,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    ...(contentType === 'image/svg+xml' ? {
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    } : {}),
  };

  if (isNotModified(request, details, etag)) {
    response.writeHead(304, commonHeaders);
    response.end();
    return;
  }

  const range = byteRange(request, details.size);
  if (range === false) {
    response.writeHead(416, { ...commonHeaders, 'content-range': `bytes */${details.size}` });
    response.end();
    return;
  }

  const status = range ? 206 : 200;
  const headers = {
    ...commonHeaders,
    'content-length': range ? range.end - range.start + 1 : details.size,
    ...(range ? { 'content-range': `bytes ${range.start}-${range.end}/${details.size}` } : {}),
  };
  response.writeHead(status, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(target, range || undefined).pipe(response);
}
