import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const MIGRATION_DIRECTORY = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_FILENAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const MIGRATION_LOCK = 'dragonbane_schema_migrations';

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function migrationFiles() {
  const entries = await readdir(MIGRATION_DIRECTORY);
  const invalidFilenames = entries.filter(
    (filename) => filename.endsWith('.sql') && !MIGRATION_FILENAME.test(filename),
  );
  if (invalidFilenames.length) {
    throw new Error(`Invalid database migration filename: ${invalidFilenames.join(', ')}`);
  }
  const filenames = entries.filter((filename) => MIGRATION_FILENAME.test(filename)).sort();

  const versions = new Set();
  const migrations = [];
  for (const filename of filenames) {
    const [, version, name] = filename.match(MIGRATION_FILENAME);
    if (versions.has(version)) throw new Error(`Duplicate database migration version: ${version}`);
    versions.add(version);

    const sql = await readFile(path.join(MIGRATION_DIRECTORY, filename), 'utf8');
    migrations.push({ version, name, filename, sql, checksum: checksum(sql) });
  }

  if (migrations.length === 0) throw new Error('No database migrations were found');
  return migrations;
}

export async function runMigrations() {
  const migrations = await migrationFiles();
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query(
      'SELECT version, name, checksum FROM app_schema_migrations ORDER BY version',
    );
    const availableByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
    const appliedByVersion = new Map(appliedResult.rows.map((migration) => [migration.version, migration]));

    for (const applied of appliedResult.rows) {
      const available = availableByVersion.get(applied.version);
      if (!available) {
        throw new Error(`Database migration ${applied.version}_${applied.name} is newer than this application`);
      }
      if (available.name !== applied.name || available.checksum !== applied.checksum) {
        throw new Error(`Applied database migration ${applied.version}_${applied.name} has been modified`);
      }
    }

    for (const migration of migrations) {
      if (appliedByVersion.has(migration.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO app_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migration.checksum],
        );
        await client.query('COMMIT');
        console.log(`Applied database migration ${migration.filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK]);
    client.release();
  }
}
