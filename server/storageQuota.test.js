import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// A tiny in-memory stand-in for the storage_objects table.
function fakeDatabase() {
  const rows = new Map();
  const client = {
    async query(sql, params = []) {
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      if (/SUM\(size\)/.test(sql)) {
        const [owner, bucket, objectPath] = params;
        const used = [...rows.entries()]
          .filter(([key, row]) => row.owner === owner && key !== `${bucket}/${objectPath}`)
          .reduce((sum, [, row]) => sum + row.size, 0);
        return { rows: [{ used }] };
      }
      if (/SELECT path FROM storage_objects/.test(sql)) {
        const [bucket, objectPaths, user] = params;
        return { rows: objectPaths
          .filter((objectPath) => { const row = rows.get(`${bucket}/${objectPath}`); return row?.owner && row.owner !== user; })
          .map((objectPath) => ({ path: objectPath })) };
      }
      if (/INSERT INTO storage_objects/.test(sql)) {
        const [bucket, objectPath, owner, size] = params;
        const existing = rows.get(`${bucket}/${objectPath}`);
        rows.set(`${bucket}/${objectPath}`, { owner: existing?.owner ?? owner, size });
        return { rows: [] };
      }
      if (/DELETE FROM storage_objects/.test(sql)) {
        rows.delete(`${params[0]}/${params[1]}`);
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return { rows, withTransaction: async (callback) => callback(client) };
}

function upload(body, upsert = false) {
  const request = Readable.from([body]);
  request.headers = { 'content-type': 'image/png', 'x-upsert': String(upsert) };
  return request;
}

describe('per-user storage quota', () => {
  let storageRoot;
  let storage;
  let database;
  let png;
  const player = { id: 'player-1', role: 'player' };

  beforeAll(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'draconi-quota-'));
    process.env.STORAGE_ROOT = storageRoot;
    png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#1d4ed8' } }).png().toBuffer();
    process.env.STORAGE_QUOTA_BYTES = String(png.length * 2 + 10);
    database = fakeDatabase();
    vi.resetModules();
    vi.doMock('./db.js', () => ({ withTransaction: database.withTransaction }));
    storage = await import('./storage.js');
  });

  afterAll(async () => {
    vi.doUnmock('./db.js');
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.STORAGE_ROOT;
    delete process.env.STORAGE_QUOTA_BYTES;
  });

  it('refuses an upload that would pass the owner quota and leaves no file or row behind', async () => {
    await storage.uploadObject(upload(png), 'images', 'q/one.png', player);
    await storage.uploadObject(upload(png), 'images', 'q/two.png', player);
    await expect(storage.uploadObject(upload(png), 'images', 'q/three.png', player))
      .rejects.toMatchObject({ status: 413, code: 'STORAGE_QUOTA_EXCEEDED' });
    expect([...database.rows.keys()]).toEqual(['images/q/one.png', 'images/q/two.png']);
    const listed = await storage.listObjects('images', 'q');
    expect(listed.map((entry) => entry.name).sort()).toEqual(['one.png', 'two.png']);
  });

  it('does not count the replaced file twice when overwriting, and frees space on delete', async () => {
    await storage.uploadObject(upload(png, true), 'images', 'q/one.png', player);
    await storage.removeObjects('images', ['q/two.png']);
    await storage.uploadObject(upload(png), 'images', 'q/three.png', player);
    expect([...database.rows.keys()].sort()).toEqual(['images/q/one.png', 'images/q/three.png']);
  });

  it('does not limit administrators', async () => {
    const admin = { id: 'admin-1', role: 'admin' };
    for (const name of ['a', 'b', 'c', 'd']) await storage.uploadObject(upload(png), 'images', `admin/${name}.png`, admin);
    expect(database.rows.size).toBeGreaterThanOrEqual(4);
  });

  it('lets only the uploader or an administrator delete or overwrite an owned image', async () => {
    const alice = { id: 'alice-1', role: 'player' };
    const other = { id: 'player-2', role: 'player' };
    const admin = { id: 'admin-1', role: 'admin' };
    await storage.uploadObject(upload(png), 'images', 'own/mine.png', alice);
    await expect(storage.removeObjects('images', ['own/mine.png'], other)).rejects.toMatchObject({ status: 403, code: 'STORAGE_FORBIDDEN' });
    await expect(storage.uploadObject(upload(png, true), 'images', 'own/mine.png', other)).rejects.toMatchObject({ status: 403 });
    expect(database.rows.get('images/own/mine.png').owner).toBe('alice-1');
    await storage.uploadObject(upload(png, true), 'images', 'own/mine.png', admin);
    expect(database.rows.get('images/own/mine.png').owner).toBe('alice-1');
    await storage.removeObjects('images', ['own/mine.png'], alice);
    expect(database.rows.has('images/own/mine.png')).toBe(false);
  });

  it('refuses a mixed batch as a whole and still lets anyone remove objects with no owner row', async () => {
    const alice = { id: 'alice-1', role: 'player' };
    const other = { id: 'player-2', role: 'player' };
    await storage.uploadObject(upload(png), 'images', 'batch/a.png', alice);
    await storage.uploadObject(upload(png), 'images', 'batch/legacy.png', null);
    await expect(storage.removeObjects('images', ['batch/legacy.png', 'batch/a.png'], other)).rejects.toMatchObject({ status: 403 });
    expect((await storage.listObjects('images', 'batch')).map((entry) => entry.name).sort()).toEqual(['a.png', 'legacy.png']);
    await storage.removeObjects('images', ['batch/legacy.png'], other);
    expect((await storage.listObjects('images', 'batch')).map((entry) => entry.name)).toEqual(['a.png']);
  });
});
