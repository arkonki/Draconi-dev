// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentTypeFor, isApiPath, serveFrontend } from './static.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function publicDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'draconi-static-'));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, 'index.html'), '<main>Dragonbane</main>');
  await writeFile(join(directory, 'app.js'), 'console.log("ready")');
  return directory;
}

function responseRecorder() {
  return {
    body: Buffer.alloc(0),
    headers: null,
    status: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end() {},
    on() {},
    once() {},
    emit() {},
    write(chunk) {
      this.body = Buffer.concat([this.body, Buffer.from(chunk)]);
      return true;
    },
  };
}

describe('static frontend serving', () => {
  it('keeps API routes reserved for the API handler', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/health')).toBe(true);
    expect(isApiPath('/login')).toBe(false);
  });

  it('uses safe content types', () => {
    expect(contentTypeFor('/tmp/app.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('/tmp/file.unknown')).toBe('application/octet-stream');
  });

  it('serves the app shell for a client-side route', async () => {
    const directory = await publicDirectory();
    const response = responseRecorder();

    expect(await serveFrontend({ method: 'HEAD', url: '/login' }, response, directory)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('does not serve missing files or paths outside the public directory', async () => {
    const directory = await publicDirectory();

    expect(await serveFrontend({ method: 'HEAD', url: '/missing.js' }, responseRecorder(), directory)).toBe(false);
    expect(await serveFrontend({ method: 'HEAD', url: '/%2e%2e%2fpackage.json' }, responseRecorder(), directory)).toBe(false);
  });
});
