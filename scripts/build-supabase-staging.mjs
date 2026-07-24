#!/usr/bin/env node

import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const AUTH_USER_COLUMNS = new Set([
  'id',
  'email',
  'email_confirmed_at',
  'last_sign_in_at',
  'raw_app_meta_data',
  'raw_user_meta_data',
  'created_at',
  'updated_at',
  'deleted_at',
  'is_anonymous',
]);

const PUBLIC_USER_EXCLUDED_COLUMNS = new Set([
  'password_hash',
  'two_factor_secret',
]);

function usage() {
  console.error(
    'Usage: node scripts/build-supabase-staging.mjs '
    + '--public-data <public-data.sql> --auth-users <auth-users.sql> '
    + '--output <staging.sql> [--schema <schema>]',
  );
}

function parseArguments(values) {
  const options = {
    authUsers: '',
    output: '',
    publicData: '',
    schema: 'supabase_import',
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--auth-users') options.authUsers = values[++index] || '';
    else if (value === '--output') options.output = values[++index] || '';
    else if (value === '--public-data') options.publicData = values[++index] || '';
    else if (value === '--schema') options.schema = values[++index] || '';
    else throw new Error(`Unknown argument: ${value}`);
  }

  if (!options.authUsers || !options.output || !options.publicData) {
    throw new Error('--public-data, --auth-users, and --output are required');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(options.schema)) {
    throw new Error('Staging schema must contain lowercase letters, digits, and underscores');
  }
  return options;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseCopyDump(contents) {
  const sections = [];
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(
      /^COPY "([^"]+)"\."([^"]+)" \((.+)\) FROM stdin;$/,
    );
    if (!header) continue;

    const columns = [...header[3].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    if (columns.length === 0) throw new Error(`COPY block has no columns: ${lines[index]}`);
    const rows = [];
    index += 1;
    while (index < lines.length && lines[index] !== '\\.') {
      rows.push(lines[index]);
      index += 1;
    }
    if (index >= lines.length) {
      throw new Error(`COPY block is not terminated: ${header[1]}.${header[2]}`);
    }
    sections.push({
      sourceSchema: header[1],
      table: header[2],
      columns,
      rows,
    });
  }

  return sections;
}

function projectColumns(section, selectedColumns, table = section.table) {
  const selected = new Set(selectedColumns);
  const indexes = section.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => selected.has(column));
  if (indexes.length !== selected.size) {
    const found = new Set(indexes.map(({ column }) => column));
    const missing = [...selected].filter((column) => !found.has(column));
    throw new Error(`${section.sourceSchema}.${section.table} export is missing columns: ${missing.join(', ')}`);
  }

  return {
    ...section,
    table,
    columns: indexes.map(({ column }) => column),
    rows: section.rows.map((row) => {
      const fields = row.split('\t');
      if (fields.length !== section.columns.length) {
        throw new Error(`auth.users row has ${fields.length} fields; expected ${section.columns.length}`);
      }
      return indexes.map(({ index }) => fields[index]).join('\t');
    }),
  };
}

function renderSection(schema, section) {
  const table = quoteIdentifier(section.table);
  const qualifiedTable = `${quoteIdentifier(schema)}.${table}`;
  const columns = section.columns.map(quoteIdentifier);
  const definitions = columns.map((column) => `  ${column} text`).join(',\n');

  return [
    `CREATE TABLE ${qualifiedTable} (`,
    definitions,
    ');',
    '',
    `COPY ${qualifiedTable} (${columns.join(', ')}) FROM stdin;`,
    ...section.rows,
    '\\.',
    '',
  ].join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [publicContents, authContents] = await Promise.all([
    readFile(path.resolve(options.publicData), 'utf8'),
    readFile(path.resolve(options.authUsers), 'utf8'),
  ]);

  const publicSections = parseCopyDump(publicContents);
  if (publicSections.length === 0 || publicSections.some((section) => section.sourceSchema !== 'public')) {
    throw new Error('Public data dump did not contain only public-schema COPY blocks');
  }
  const authSections = parseCopyDump(authContents);
  const authUsers = authSections.find(
    (section) => section.sourceSchema === 'auth' && section.table === 'users',
  );
  if (!authUsers || authSections.length !== 1) {
    throw new Error('Auth data dump must contain only auth.users');
  }

  const scrubbedPublicSections = publicSections.map((section) => {
    if (section.table !== 'users') return section;
    return projectColumns(
      section,
      section.columns.filter((column) => !PUBLIC_USER_EXCLUDED_COLUMNS.has(column)),
    );
  });
  const sections = [
    ...scrubbedPublicSections.sort((left, right) => left.table.localeCompare(right.table)),
    projectColumns(authUsers, AUTH_USER_COLUMNS, 'auth_users'),
  ];
  const totalRows = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const sql = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    `CREATE SCHEMA ${quoteIdentifier(options.schema)};`,
    `COMMENT ON SCHEMA ${quoteIdentifier(options.schema)} IS 'Temporary scrubbed staging data imported from restored Supabase project';`,
    '',
    ...sections.map((section) => renderSection(options.schema, section)),
    'COMMIT;',
    '',
  ].join('\n');

  const output = path.resolve(options.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, sql, { mode: 0o600 });
  console.log(`Wrote ${sections.length} staging tables and ${totalRows} rows to ${output}`);
}

main().catch((error) => {
  usage();
  console.error(error.message);
  process.exitCode = 1;
});
