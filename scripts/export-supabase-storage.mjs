#!/usr/bin/env node

/* global fetch */
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

function usage() {
  console.error(
    'Usage: node scripts/export-supabase-storage.mjs --dest <directory> '
    + '[--env <file>] [--bucket <name>] [--manifest <file>] [--overwrite] [--dry-run]',
  );
}

function parseArguments(values) {
  const options = {
    bucket: 'images',
    destination: '',
    dryRun: false,
    envFile: '.env',
    manifest: '',
    overwrite: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--overwrite') options.overwrite = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--dest') options.destination = values[++index] || '';
    else if (value === '--env') options.envFile = values[++index] || '';
    else if (value === '--bucket') options.bucket = values[++index] || '';
    else if (value === '--manifest') options.manifest = values[++index] || '';
    else throw new Error(`Unknown argument: ${value}`);
  }

  if (!options.destination) throw new Error('--dest is required');
  if (!/^[A-Za-z0-9_-]+$/.test(options.bucket)) throw new Error('Invalid bucket name');
  return options;
}

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function safeObjectPath(prefix, name) {
  const objectPath = prefix ? `${prefix}/${name}` : name;
  const normalized = objectPath.replaceAll('\\', '/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe storage object path: ${JSON.stringify(objectPath)}`);
  }
  return normalized;
}

function encodedObjectPath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

async function responseMessage(response) {
  const text = await response.text();
  return text.slice(0, 500).replace(/\s+/g, ' ');
}

async function listObjects({ baseUrl, bucket, headers }) {
  const files = [];
  const folders = [];
  const pending = [''];

  while (pending.length > 0) {
    const prefix = pending.shift();
    for (let offset = 0; ; offset += 1000) {
      const response = await fetch(
        `${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            limit: 1000,
            offset,
            prefix,
            sortBy: { column: 'name', order: 'asc' },
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Storage listing failed (${response.status}): ${await responseMessage(response)}`);
      }

      const entries = await response.json();
      for (const entry of entries) {
        const objectPath = safeObjectPath(prefix, entry.name);
        if (entry.id === null) {
          folders.push(objectPath);
          pending.push(objectPath);
        } else {
          files.push({
            path: objectPath,
            size: Number(entry.metadata?.size || 0),
            sourceEtag: String(entry.metadata?.eTag || '').replaceAll('"', ''),
            contentType: entry.metadata?.mimetype || 'application/octet-stream',
            createdAt: entry.created_at || null,
            updatedAt: entry.updated_at || null,
          });
        }
      }
      if (entries.length < 1000) break;
    }
  }

  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    folders: folders.sort(),
  };
}

async function sha256File(filename) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}

async function downloadObject({
  baseUrl,
  bucket,
  destination,
  file,
  headers,
  overwrite,
}) {
  const target = path.resolve(destination, file.path);
  const destinationRoot = path.resolve(destination);
  if (!target.startsWith(`${destinationRoot}${path.sep}`)) {
    throw new Error(`Object escaped destination: ${file.path}`);
  }

  try {
    const existing = await stat(target);
    if (!overwrite && existing.isFile() && existing.size === file.size) {
      return { ...file, status: 'skipped', sha256: await sha256File(target) };
    }
    if (!overwrite && existing.isFile()) {
      throw new Error(`Existing file has a different size: ${file.path}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.part-${randomUUID()}`;
  const response = await fetch(
    `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedObjectPath(file.path)}`,
    { headers },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${file.path} (${response.status}): ${await responseMessage(response)}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
    const downloaded = await stat(temporary);
    if (downloaded.size !== file.size) {
      throw new Error(`Size mismatch for ${file.path}: expected ${file.size}, received ${downloaded.size}`);
    }
    const sha256 = await sha256File(temporary);
    await rename(temporary, target);
    return { ...file, status: 'downloaded', sha256 };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const envFile = path.resolve(options.envFile);
  const fileValues = parseEnvFile(await readFile(envFile, 'utf8'));
  const baseUrl = (
    process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || fileValues.SUPABASE_URL
    || fileValues.VITE_SUPABASE_URL
    || ''
  ).replace(/\/+$/, '');
  const apiKey = (
    process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || fileValues.SUPABASE_ANON_KEY
    || fileValues.VITE_SUPABASE_ANON_KEY
    || ''
  );
  if (!baseUrl || !apiKey) {
    throw new Error('Supabase URL and anonymous key are required in the environment or env file');
  }

  const destination = path.resolve(options.destination);
  const manifestPath = path.resolve(
    options.manifest || `${destination}.manifest.json`,
  );
  const headers = { apikey: apiKey, authorization: `Bearer ${apiKey}` };
  const inventory = await listObjects({
    baseUrl,
    bucket: options.bucket,
    headers,
  });
  const totalBytes = inventory.files.reduce((sum, file) => sum + file.size, 0);

  console.log(
    `Found ${inventory.files.length} objects in ${inventory.folders.length} folders `
    + `(${(totalBytes / 1024 / 1024).toFixed(2)} MiB).`,
  );

  const results = [];
  if (!options.dryRun) {
    await mkdir(destination, { recursive: true });
    for (let index = 0; index < inventory.files.length; index += 1) {
      const file = inventory.files[index];
      const result = await downloadObject({
        baseUrl,
        bucket: options.bucket,
        destination,
        file,
        headers,
        overwrite: options.overwrite,
      });
      results.push(result);
      console.log(`[${index + 1}/${inventory.files.length}] ${result.status}: ${file.path}`);
    }
  }

  const manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      projectUrl: baseUrl,
      bucket: options.bucket,
    },
    destination,
    dryRun: options.dryRun,
    folders: inventory.folders,
    files: options.dryRun ? inventory.files : results,
    totals: {
      folders: inventory.folders.length,
      files: inventory.files.length,
      bytes: totalBytes,
      downloaded: results.filter((file) => file.status === 'downloaded').length,
      skipped: results.filter((file) => file.status === 'skipped').length,
    },
  };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  usage();
  console.error(error.message);
  process.exitCode = 1;
});
