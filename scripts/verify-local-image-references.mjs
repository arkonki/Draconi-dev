#!/usr/bin/env node

import console from 'node:console';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const REFERENCE_COLUMNS = [
  ['characters', 'portrait_url'],
  ['compendium', 'content'],
  ['notes', 'content'],
  ['party_display_sessions', 'display_image_url'],
  ['party_maps', 'image_url'],
];

function usage() {
  console.error(
    'Usage: node scripts/verify-local-image-references.mjs '
    + '--source-prefix <url> [--schema <schema>] [--storage-root <directory>]',
  );
}

function parseArguments(values) {
  const options = {
    schema: 'public',
    sourcePrefix: '',
    storageRoot: process.env.STORAGE_ROOT || '/data/storage',
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--schema') options.schema = values[++index] || '';
    else if (value === '--source-prefix') options.sourcePrefix = values[++index] || '';
    else if (value === '--storage-root') options.storageRoot = values[++index] || '';
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(options.schema)) throw new Error('Invalid schema');
  if (!/^https:\/\/[^/]+\/.+\/$/.test(options.sourcePrefix)) {
    throw new Error('--source-prefix must be an HTTPS URL ending with /');
  }
  if (!options.storageRoot) throw new Error('Storage root is required');
  return options;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function encodedObjectPath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

function pathRepresentations(objectPaths) {
  const values = [];
  for (const objectPath of objectPaths) {
    for (const representation of new Set([
      objectPath,
      encodeURI(objectPath),
      encodedObjectPath(objectPath),
    ])) {
      values.push({ objectPath, representation });
    }
  }
  return values.sort((left, right) => right.representation.length - left.representation.length);
}

function referencedPaths(text, prefix, representations) {
  const found = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(prefix, searchFrom);
    if (start < 0) break;
    const pathStart = start + prefix.length;
    const remainder = text.slice(pathStart);
    const known = representations.find(({ representation }) => remainder.startsWith(representation));
    if (known) {
      found.push(known.objectPath);
      searchFrom = pathStart + known.representation.length;
      continue;
    }

    let end = pathStart;
    while (end < text.length && !/[\s"'()<>\]]/.test(text[end])) end += 1;
    found.push(decodeObjectPath(text.slice(pathStart, end).replace(/[?#].*$/, '')));
    searchFrom = end;
  }
  return found;
}

function decodeObjectPath(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error(`Image URL contains invalid percent encoding: ${value}`);
  }
  const normalized = decoded.replaceAll('\\', '/').replace(/^\/+/, '');
  if (
    !normalized
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Image URL contains an unsafe object path: ${value}`);
  }
  return normalized;
}

async function isFile(filename) {
  try {
    return (await stat(filename)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function filesBelow(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesBelow(root, objectPath));
    else if (entry.isFile()) files.push(objectPath);
  }
  return files;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const imageRoot = path.resolve(options.storageRoot, 'images');
  const localFiles = await filesBelow(imageRoot);
  const representations = pathRepresentations(localFiles);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const referenced = [];
  await client.connect();
  try {
    for (const [table, column] of REFERENCE_COLUMNS) {
      const exists = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
         ) AS exists`,
        [options.schema, table, column],
      );
      if (!exists.rows[0].exists) continue;
      const result = await client.query(
        `SELECT ${quoteIdentifier(column)} AS value
         FROM ${quoteIdentifier(options.schema)}.${quoteIdentifier(table)}
         WHERE ${quoteIdentifier(column)} IS NOT NULL`,
      );
      for (const row of result.rows) {
        referenced.push(
          ...referencedPaths(String(row.value), options.sourcePrefix, representations).map((value) => ({
            table,
            column,
            path: value,
          })),
        );
      }
    }
  } finally {
    await client.end();
  }

  const uniquePaths = [...new Set(referenced.map((entry) => entry.path))].sort();
  const missing = [];
  for (const objectPath of uniquePaths) {
    const target = path.resolve(imageRoot, objectPath);
    if (!target.startsWith(`${imageRoot}${path.sep}`) || !await isFile(target)) {
      missing.push(objectPath);
    }
  }

  console.log(JSON.stringify({
    references: referenced.length,
    uniquePaths: uniquePaths.length,
    missing: missing.length,
  }));
  for (const objectPath of missing) console.log(`missing: ${objectPath}`);
  if (missing.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  usage();
  console.error(error.message);
  process.exitCode = 1;
});
