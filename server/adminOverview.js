import { readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { applicationVersion } from './recovery.js';
import { housekeepingStatus } from './housekeeping.js';
import { pool } from './db.js';
import { HttpError } from './http.js';
import { performanceStatus } from './performance.js';
import {
  assessBackup,
  assessPerformance,
  BACKUP_CRITICAL_DAYS,
  BACKUP_WARN_DAYS,
  buildAttention,
  overallStatus,
} from './adminAssessment.js';

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || '/data/storage');
const BACKUP_ROOT = path.resolve(process.env.BACKUP_ROOT || '/data/backups');
const SERVER_BACKUP_PATTERN = /^(?:dragonbane-backup|pre-restore)-\d{8}T\d{6}Z-[a-f0-9]{8}\.tar\.gz$/;
const DEPLOY_DUMP_PATTERN = /^database-.+\.dump$/;

function requireAdmin(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required', 'ADMIN_REQUIRED');
}

// --- Gathering the facts -------------------------------------------------------------------------------

async function filesMatching(directory, pattern) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    const details = await stat(path.join(directory, entry.name));
    files.push({ filename: entry.name, size: details.size, createdAt: details.mtime.toISOString() });
  }
  return files.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

const summarise = (files, extra = () => ({})) => ({
  count: files.length,
  bytes: files.reduce((sum, file) => sum + file.size, 0),
  newest: files[0] ? { ...files[0], ...extra(files[0]) } : null,
});

let storageCache = { at: 0, value: null };
async function directoryUsage(root) {
  let files = 0;
  let bytes = 0;
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await stat(full)).size;
      }
    }
  };
  await visit(root);
  return { files, bytes };
}

async function storageUsage() {
  if (storageCache.value && Date.now() - storageCache.at < 60_000) return storageCache.value;
  const value = await directoryUsage(STORAGE_ROOT);
  storageCache = { at: Date.now(), value };
  return value;
}

async function diskUsage(directory) {
  try {
    const info = await statfs(directory);
    return { totalBytes: info.blocks * info.bsize, freeBytes: info.bavail * info.bsize };
  } catch {
    return null;
  }
}

export async function adminOverview(user) {
  requireAdmin(user);

  const [recoverySets, deployDumps, storage, disk, counts, migrations, postgres, housekeeping, performance, version] = await Promise.all([
    filesMatching(BACKUP_ROOT, SERVER_BACKUP_PATTERN),
    filesMatching(path.join(BACKUP_ROOT, 'predeploy'), DEPLOY_DUMP_PATTERN),
    storageUsage(),
    diskUsage(BACKUP_ROOT),
    pool.query(
      `SELECT
         (SELECT count(*)::int FROM users) AS total_users,
         (SELECT count(*)::int FROM users WHERE is_active) AS active_users,
         (SELECT count(*)::int FROM users WHERE role = 'admin' AND is_active) AS admins,
         (SELECT count(*)::int FROM users u WHERE u.is_active AND (u.last_login_at IS NULL
            OR NOT EXISTS (SELECT 1 FROM app_credentials c WHERE c.user_id = u.id))) AS needs_attention,
         (SELECT count(*)::int FROM characters) AS characters,
         (SELECT count(*)::int FROM parties) AS campaigns,
         pg_database_size(current_database())::bigint AS database_bytes`,
    ),
    pool.query('SELECT count(*)::int AS applied, max(version) AS latest FROM app_schema_migrations'),
    pool.query('SHOW server_version'),
    housekeepingStatus(user).catch(() => null),
    performanceStatus(user).catch(() => null),
    applicationVersion(),
  ]);

  const row = counts.rows[0];
  // The automatic pre-restore copy holds the data from *before* a restore, so it does not count as a current backup.
  const isSafetyCopy = (file) => file.filename.startsWith('pre-restore-');
  const manualSets = recoverySets.filter((file) => !isSafetyCopy(file));
  const safetyCopies = recoverySets.filter(isSafetyCopy);
  const currentBackups = [...manualSets, ...deployDumps];
  const newestAt = currentBackups.map((file) => file.createdAt).sort().at(-1) ?? null;
  const backup = assessBackup({ newestAt });
  const users = { total: row.total_users, active: row.active_users, admins: row.admins, needsAttention: row.needs_attention };
  const attention = buildAttention({
    backup,
    disk,
    users,
    housekeeping,
    adminCount: users.admins,
    performanceFindings: assessPerformance(performance),
  });

  return {
    generatedAt: new Date().toISOString(),
    status: overallStatus(attention),
    app: {
      version,
      nodeVersion: process.version,
      startedAt: performance?.process.startedAt ?? null,
      uptimeSeconds: performance?.process.uptimeSeconds ?? Math.round(process.uptime()),
    },
    database: {
      sizeBytes: Number(row.database_bytes),
      serverVersion: postgres.rows[0].server_version,
      migrations: { applied: migrations.rows[0].applied, latest: migrations.rows[0].latest },
    },
    storage: { files: storage.files, bytes: storage.bytes, disk: disk ? { ...disk, freePercent: (disk.freeBytes / disk.totalBytes) * 100 } : null },
    backups: {
      warnDays: BACKUP_WARN_DAYS,
      criticalDays: BACKUP_CRITICAL_DAYS,
      ...backup,
      newestAt,
      recoverySets: summarise(manualSets),
      safetyCopies: summarise(safetyCopies),
      deployDumps: summarise(deployDumps),
    },
    users,
    content: { characters: row.characters, campaigns: row.campaigns },
    housekeeping: housekeeping && {
      enabled: housekeeping.enabled,
      lastCompletedAt: housekeeping.lastCompletedAt,
      lastError: housekeeping.lastError,
      pending: housekeeping.pending,
    },
    attention,
  };
}
