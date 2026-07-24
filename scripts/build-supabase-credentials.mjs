#!/usr/bin/env node

import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function usage() {
  console.error(
    'Usage: node scripts/build-supabase-credentials.mjs '
    + '--auth-users <auth-users.sql> --output <credentials.sql>',
  );
}

function parseArguments(values) {
  const options = { authUsers: '', output: '' };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--auth-users') options.authUsers = values[++index] || '';
    else if (value === '--output') options.output = values[++index] || '';
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.authUsers || !options.output) {
    throw new Error('--auth-users and --output are required');
  }
  return options;
}

function authUserRows(contents) {
  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(
      /^COPY "auth"\."users" \((.+)\) FROM stdin;$/,
    );
    if (!header) continue;
    const columns = [...header[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const idIndex = columns.indexOf('id');
    const passwordIndex = columns.indexOf('encrypted_password');
    if (idIndex < 0 || passwordIndex < 0) {
      throw new Error('auth.users export is missing id or encrypted_password');
    }

    const rows = [];
    index += 1;
    while (index < lines.length && lines[index] !== '\\.') {
      const fields = lines[index].split('\t');
      if (fields.length !== columns.length) {
        throw new Error(`auth.users row has ${fields.length} fields; expected ${columns.length}`);
      }
      const id = fields[idIndex];
      const passwordHash = fields[passwordIndex];
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error(`Invalid auth user ID: ${id}`);
      if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
        throw new Error(`Unsupported password hash for auth user ${id}`);
      }
      rows.push(`${id}\t${passwordHash}`);
      index += 1;
    }
    if (index >= lines.length) throw new Error('auth.users COPY block is not terminated');
    return rows;
  }
  throw new Error('auth.users COPY block was not found');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const rows = authUserRows(await readFile(path.resolve(options.authUsers), 'utf8'));
  const output = path.resolve(options.output);
  const sql = [
    '\\set ON_ERROR_STOP on',
    'CREATE TEMP TABLE supabase_auth_credentials (',
    '  source_id uuid PRIMARY KEY,',
    '  password_hash text NOT NULL',
    ');',
    'COPY supabase_auth_credentials (source_id, password_hash) FROM stdin;',
    ...rows,
    '\\.',
    '',
  ].join('\n');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, sql, { mode: 0o600 });
  console.log(`Wrote ${rows.length} bcrypt credential mappings to ${output}`);
}

main().catch((error) => {
  usage();
  console.error(error.message);
  process.exitCode = 1;
});
