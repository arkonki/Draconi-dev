import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

class TestResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get body() {
    return Buffer.concat(this.chunks);
  }
}

function uploadRequest(body, contentType = 'image/png') {
  const request = Readable.from([body]);
  request.headers = { 'content-type': contentType, 'x-upsert': 'false' };
  return request;
}

function publicRequest(url, method = 'GET', headers = {}) {
  return { headers, method, url };
}

async function served(storage, request, objectPath) {
  const response = new TestResponse();
  const completion = finished(response);
  await storage.servePublicObject(request, response, 'images', objectPath);
  await completion;
  return response;
}

describe('local image storage optimization', () => {
  let storageRoot;
  let storage;
  let png;
  const objectPath = `portraits/test-${randomUUID()}.png`;

  beforeAll(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'draconi-storage-'));
    process.env.STORAGE_ROOT = storageRoot;
    process.env.MAX_IMAGE_PIXELS = '1000000';
    vi.resetModules();
    storage = await import('./storage.js');
    png = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 4,
        background: { r: 29, g: 78, b: 216, alpha: 1 },
      },
    }).png().toBuffer();
  });

  afterAll(async () => {
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.STORAGE_ROOT;
    delete process.env.MAX_IMAGE_PIXELS;
  });

  it('streams a valid upload and eagerly creates bounded WebP variants', async () => {
    const result = await storage.uploadObject(uploadRequest(png), 'images', objectPath);
    expect(result.metadata).toMatchObject({ format: 'png', width: 640, height: 480, size: png.length });
    expect(Object.keys(result.variants)).toEqual(['thumbnail', 'medium', 'large']);

    const thumbnail = await served(
      storage,
      publicRequest(`/api/storage/public/images/${objectPath}?variant=thumbnail`),
      objectPath,
    );
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/webp');
    expect(thumbnail.headers.etag).toMatch(/^"/);
    expect(thumbnail.headers['cache-control']).toContain('stale-while-revalidate');
    const metadata = await sharp(thumbnail.body).metadata();
    expect(metadata.width).toBeLessThanOrEqual(256);
    expect(metadata.height).toBeLessThanOrEqual(256);
  });

  it('supports conditional, HEAD, and byte-range requests', async () => {
    const first = await served(
      storage,
      publicRequest(`/api/storage/public/images/${objectPath}?variant=medium`),
      objectPath,
    );

    const conditional = await served(
      storage,
      publicRequest(`/api/storage/public/images/${objectPath}?variant=medium`, 'GET', {
        'if-none-match': first.headers.etag,
      }),
      objectPath,
    );
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toHaveLength(0);

    const head = await served(
      storage,
      publicRequest(`/api/storage/public/images/${objectPath}`, 'HEAD'),
      objectPath,
    );
    expect(head.statusCode).toBe(200);
    expect(Number(head.headers['content-length'])).toBe(png.length);
    expect(head.body).toHaveLength(0);

    const range = await served(
      storage,
      publicRequest(`/api/storage/public/images/${objectPath}`, 'GET', { range: 'bytes=0-9' }),
      objectPath,
    );
    expect(range.statusCode).toBe(206);
    expect(range.headers['content-range']).toBe(`bytes 0-9/${png.length}`);
    expect(range.body).toHaveLength(10);
  });

  it('generates variants for legacy originals on demand and cleans them up on removal', async () => {
    const legacyPath = `legacy/maps/${randomUUID()}.png`;
    const legacyFile = path.join(storageRoot, 'images', legacyPath);
    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(legacyFile, png);

    const generated = await served(
      storage,
      publicRequest(`/api/storage/public/images/${legacyPath}?variant=large`),
      legacyPath,
    );
    expect(generated.statusCode).toBe(200);
    expect(generated.headers['content-type']).toBe('image/webp');

    await storage.removeObjects('images', [legacyPath]);
    const missing = await served(
      storage,
      publicRequest(`/api/storage/public/images/${legacyPath}?variant=large`),
      legacyPath,
    );
    expect(missing.statusCode).toBe(404);
  });

  it('rejects invalid content declared as an image without leaving an object', async () => {
    const invalidPath = `portraits/invalid-${randomUUID()}.png`;
    await expect(storage.uploadObject(
      uploadRequest(Buffer.from('not an image')),
      'images',
      invalidPath,
    )).rejects.toMatchObject({ status: 400 });

    const response = await served(
      storage,
      publicRequest(`/api/storage/public/images/${invalidPath}`),
      invalidPath,
    );
    expect(response.statusCode).toBe(404);
  });
});
