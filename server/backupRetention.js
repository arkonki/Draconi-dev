import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Retention for the database dumps deploy.sh writes to <BACKUP_ROOT>/predeploy. Recovery sets and the
// automatic pre-restore copies are never touched here: they are managed deliberately from the UI.
// This module has no database dependency so deploy.sh can run it directly.

export const DEPLOY_DUMP_PATTERN = /^database-\d{8}T\d{6}Z-[A-Za-z0-9]+\.dump$/;
const DAY_MS = 86_400_000;

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function retentionPolicy() {
  return {
    keep: integerSetting('PREDEPLOY_DUMPS_TO_KEEP', 10, 1, 1_000),
    minAgeDays: integerSetting('PREDEPLOY_DUMP_MIN_AGE_DAYS', 14, 0, 3_650),
  };
}

/**
 * Chooses which dumps may be deleted. A dump is kept if it is among the newest `keep`, or younger than
 * `minAgeDays`. Everything else is prunable. `files` need `filename` and `createdAt` (ISO string).
 */
export function selectDumpsToPrune(files, { keep, minAgeDays, now = Date.now() }) {
  const newestFirst = [...files].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const cutoff = now - minAgeDays * DAY_MS;
  return newestFirst.filter((file, index) => index >= keep && Date.parse(file.createdAt) < cutoff);
}

async function listDumps(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !DEPLOY_DUMP_PATTERN.test(entry.name)) continue;
    const details = await stat(path.join(directory, entry.name));
    files.push({ filename: entry.name, size: details.size, createdAt: details.mtime.toISOString() });
  }
  return files;
}

/** Deletes (or, with dryRun, only lists) the dumps the policy allows to go. */
export async function pruneDeployDumps(backupRoot, { dryRun = false, policy = retentionPolicy(), now } = {}) {
  const directory = path.join(backupRoot, 'predeploy');
  const files = await listDumps(directory);
  const prunable = selectDumpsToPrune(files, { ...policy, now });
  const removed = [];
  const failed = [];
  if (!dryRun) {
    for (const file of prunable) {
      try {
        await unlink(path.join(directory, file.filename));
        removed.push(file);
      } catch (error) {
        failed.push({ filename: file.filename, reason: error?.code || 'unknown' });
      }
    }
  }
  const affected = dryRun ? prunable : removed;
  return {
    dryRun,
    policy,
    kept: files.length - affected.length,
    failed,
    prunable: affected.length,
    bytes: affected.reduce((sum, file) => sum + file.size, 0),
    files: affected,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) {
    process.stderr.write('Usage: node server/backupRetention.js <backup-root> [--dry-run]\n');
    process.exit(2);
  }
  try {
    const result = await pruneDeployDumps(path.resolve(root), { dryRun: process.argv.includes('--dry-run') });
    const verb = result.dryRun ? 'Would remove' : 'Removed';
    process.stdout.write(`${verb} ${result.prunable} old database dump(s) (${(result.bytes / 1_048_576).toFixed(1)} MB); ${result.kept} kept.\n`);
    if (result.failed.length) process.stderr.write(`Could not remove ${result.failed.length} dump(s): ${result.failed.map((f) => `${f.filename} (${f.reason})`).join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`Pruning old database dumps failed: ${error.message}\n`);
    process.exit(1);
  }
}
