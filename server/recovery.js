import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pool } from './db.js';
import { verifyUserPassword } from './auth.js';
import { HttpError } from './http.js';

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || '/data/storage');
const BACKUP_ROOT = path.resolve(process.env.BACKUP_ROOT || '/data/backups');
const MAX_BACKUP_BYTES = Number(process.env.MAX_BACKUP_BYTES || 1_073_741_824);
const STAGE_LIFETIME_MS = 15 * 60 * 1000;
const BACKUP_FILES = ['database.dump', 'storage.tar.gz', 'manifest.json', 'SHA256SUMS'];
const CHECKSUM_FILES = ['database.dump', 'storage.tar.gz', 'manifest.json'];
const SERVER_BACKUP_PATTERN = /^(?:dragonbane-backup|pre-restore)-\d{8}T\d{6}Z-[a-f0-9]{8}\.tar\.gz$/;

const databaseUrl = new URL(process.env.DATABASE_URL);
const databaseConfig = {
  host: databaseUrl.hostname,
  port: databaseUrl.port || '5432',
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  name: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
};

if (
  BACKUP_ROOT === STORAGE_ROOT
  || BACKUP_ROOT.startsWith(`${STORAGE_ROOT}${path.sep}`)
  || STORAGE_ROOT.startsWith(`${BACKUP_ROOT}${path.sep}`)
) {
  throw new Error('BACKUP_ROOT and STORAGE_ROOT must be separate, non-nested directories');
}

let maintenanceOperation = null;
let activeRequests = 0;
const drainWaiters = new Set();
const stagedBackups = new Map();

export function maintenanceStatus() {
  return maintenanceOperation ? { active: true, operation: maintenanceOperation } : { active: false };
}

export function beginApplicationRequest() {
  activeRequests += 1;
}

export function endApplicationRequest() {
  activeRequests = Math.max(0, activeRequests - 1);
  for (const waiter of drainWaiters) {
    if (activeRequests <= waiter.allowance) {
      waiter.resolve();
      drainWaiters.delete(waiter);
    }
  }
}

function requireAdmin(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required');
}

async function enterMaintenance(operation, activeRequestAllowance = 0) {
  if (maintenanceOperation) {
    throw new HttpError(409, `A ${maintenanceOperation} operation is already running`, 'RECOVERY_BUSY');
  }
  maintenanceOperation = operation;
  if (activeRequests > activeRequestAllowance) {
    await new Promise((resolve) => drainWaiters.add({ allowance: activeRequestAllowance, resolve }));
  }
}

function leaveMaintenance() {
  maintenanceOperation = null;
}

function commandEnvironment() {
  return { ...process.env, PGPASSWORD: databaseConfig.password };
}

async function runCommand(command, args, { maxOutputBytes = 5_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: commandEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;

    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        reject(new Error(`${command} produced too much output`));
        return;
      }
      target.push(chunk);
    };

    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdoutText = Buffer.concat(stdout).toString('utf8');
      const stderrText = Buffer.concat(stderr).toString('utf8').trim();
      if (code === 0) resolve({ stdout: stdoutText, stderr: stderrText });
      else reject(new Error(`${command} failed${stderrText ? `: ${stderrText}` : ` with exit code ${code}`}`));
    });
  });
}

function databaseArgs() {
  return ['-h', databaseConfig.host, '-p', databaseConfig.port, '-U', databaseConfig.user];
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function backupFilename(prefix) {
  return `${prefix}-${timestamp()}-${randomBytes(4).toString('hex')}.tar.gz`;
}

function safeServerBackupPath(filename) {
  if (!SERVER_BACKUP_PATTERN.test(filename)) throw new HttpError(400, 'Invalid server backup filename');
  return path.join(BACKUP_ROOT, filename);
}

async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function applicationVersion() {
  for (const packagePath of ['/app/application-package.json', path.resolve('package.json')]) {
    try {
      const applicationPackage = JSON.parse(await readFile(packagePath, 'utf8'));
      if (applicationPackage.version) return String(applicationPackage.version);
    } catch {
      // Try the next runtime location.
    }
  }
  return 'unknown';
}

async function createBackupPackage(prefix) {
  await mkdir(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'dragonbane-backup-'));
  const filename = backupFilename(prefix);
  const finalPath = path.join(BACKUP_ROOT, filename);
  const partialPath = `${finalPath}.partial`;

  try {
    const databaseDump = path.join(workingDirectory, 'database.dump');
    const storageArchive = path.join(workingDirectory, 'storage.tar.gz');
    const manifestPath = path.join(workingDirectory, 'manifest.json');

    await runCommand('pg_dump', [
      ...databaseArgs(),
      '-d', databaseConfig.name,
      '-Fc',
      '--no-owner',
      '--no-acl',
      '--file', databaseDump,
    ]);
    await runCommand('tar', ['-C', STORAGE_ROOT, '-czf', storageArchive, '.']);

    const [databaseDetails, storageDetails, userResult, version] = await Promise.all([
      stat(databaseDump),
      stat(storageArchive),
      pool.query('SELECT COUNT(*)::integer AS count FROM users'),
      applicationVersion(),
    ]);
    const manifest = {
      formatVersion: 1,
      createdAtUtc: new Date().toISOString(),
      applicationVersion: version,
      databaseName: databaseConfig.name,
      databaseBytes: databaseDetails.size,
      storageBytes: storageDetails.size,
      userCount: userResult.rows[0].count,
      consistency: 'API maintenance mode drained active requests before database and storage snapshot',
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

    const checksumLines = [];
    for (const backupFile of CHECKSUM_FILES) {
      checksumLines.push(`${await sha256File(path.join(workingDirectory, backupFile))}  ${backupFile}`);
    }
    await writeFile(path.join(workingDirectory, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, { mode: 0o600 });

    await runCommand('tar', ['-C', workingDirectory, '-czf', partialPath, ...BACKUP_FILES]);
    await chmod(partialPath, 0o600);
    await rename(partialPath, finalPath);
    return { filename, path: finalPath, manifest };
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

function normalizeArchiveEntry(entry) {
  return entry.replace(/^\.\//, '').replace(/\/$/, '');
}

function assertSafeArchiveEntries(listOutput, verboseOutput, expectedFiles = null) {
  const entries = listOutput.split('\n').filter(Boolean);
  const normalized = entries.map(normalizeArchiveEntry).filter(Boolean);

  for (const entry of normalized) {
    if (entry.startsWith('/') || entry.split('/').includes('..')) {
      throw new HttpError(400, `Backup contains an unsafe archive path: ${entry}`);
    }
  }

  const verboseEntries = verboseOutput.split('\n').filter(Boolean);
  for (const entry of verboseEntries) {
    if (!entry.startsWith('-') && !entry.startsWith('d')) {
      throw new HttpError(400, 'Backup archives may contain only regular files and directories');
    }
  }

  if (expectedFiles) {
    const actual = [...new Set(normalized)].sort();
    const expected = [...expectedFiles].sort();
    if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
      throw new HttpError(400, 'Backup package does not contain the expected recovery files');
    }
    if (verboseEntries.length !== expected.length || verboseEntries.some((entry) => !entry.startsWith('-'))) {
      throw new HttpError(400, 'Backup recovery files must be regular files');
    }
  }
}

async function validateTarArchive(archivePath, expectedFiles = null) {
  let list;
  let verbose;
  try {
    list = await runCommand('tar', ['-tzf', archivePath]);
    verbose = await runCommand('tar', ['-tvzf', archivePath]);
  } catch (error) {
    throw new HttpError(400, `Backup archive is unreadable: ${error.message}`);
  }
  assertSafeArchiveEntries(list.stdout, verbose.stdout, expectedFiles);
}

async function validateBackupPackage(packagePath, { keepExtracted = false } = {}) {
  const extractedDirectory = await mkdtemp(path.join(tmpdir(), 'dragonbane-restore-'));
  let keepDirectory = false;
  try {
    await validateTarArchive(packagePath, BACKUP_FILES);
    await runCommand('tar', ['-C', extractedDirectory, '-xzf', packagePath]);

    const checksumText = await readFile(path.join(extractedDirectory, 'SHA256SUMS'), 'utf8');
    const checksums = new Map();
    for (const line of checksumText.trim().split('\n')) {
      const match = line.match(/^([a-f0-9]{64}) {2}(database\.dump|storage\.tar\.gz|manifest\.json)$/);
      if (!match || checksums.has(match[2])) throw new HttpError(400, 'Backup checksum manifest is invalid');
      checksums.set(match[2], match[1]);
    }
    if (checksums.size !== CHECKSUM_FILES.length) throw new HttpError(400, 'Backup checksum manifest is incomplete');

    for (const backupFile of CHECKSUM_FILES) {
      const actualHash = await sha256File(path.join(extractedDirectory, backupFile));
      if (actualHash !== checksums.get(backupFile)) {
        throw new HttpError(400, `Backup checksum failed for ${backupFile}`);
      }
    }

    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(extractedDirectory, 'manifest.json'), 'utf8'));
    } catch {
      throw new HttpError(400, 'Backup manifest is not valid JSON');
    }
    if (manifest?.formatVersion !== 1 || typeof manifest.databaseName !== 'string' || !manifest.createdAtUtc) {
      throw new HttpError(400, 'Backup manifest version or metadata is invalid');
    }

    let restoreCatalog;
    try {
      restoreCatalog = await runCommand('pg_restore', ['--list', path.join(extractedDirectory, 'database.dump')]);
    } catch (error) {
      throw new HttpError(400, `PostgreSQL backup is unreadable: ${error.message}`);
    }
    for (const requiredTable of ['users', 'app_credentials', 'app_sessions']) {
      if (!restoreCatalog.stdout.includes(`TABLE public ${requiredTable}`)) {
        throw new HttpError(400, `PostgreSQL backup is missing critical table: ${requiredTable}`);
      }
    }

    await validateTarArchive(path.join(extractedDirectory, 'storage.tar.gz'));
    keepDirectory = keepExtracted;
    return { manifest, extractedDirectory: keepExtracted ? extractedDirectory : null };
  } finally {
    if (!keepDirectory) await rm(extractedDirectory, { recursive: true, force: true });
  }
}

async function streamBackup(response, backup) {
  const details = await stat(backup.path);
  response.writeHead(200, {
    'content-type': 'application/gzip',
    'content-length': details.size,
    'content-disposition': `attachment; filename="${backup.filename}"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  await pipeline(createReadStream(backup.path), response);
}

export async function createAndDownloadBackup(response, user) {
  requireAdmin(user);
  await enterMaintenance('backup', 1);
  try {
    const backup = await createBackupPackage('dragonbane-backup');
    await validateBackupPackage(backup.path);
    leaveMaintenance();
    console.log(`Administrator ${user.email} created recovery set ${backup.filename}`);
    await streamBackup(response, backup);
  } catch (error) {
    leaveMaintenance();
    throw error;
  }
}

export async function listBackups(user) {
  requireAdmin(user);
  await mkdir(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  const entries = await readdir(BACKUP_ROOT, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !SERVER_BACKUP_PATTERN.test(entry.name)) continue;
    const details = await stat(path.join(BACKUP_ROOT, entry.name));
    backups.push({
      filename: entry.name,
      size: details.size,
      createdAt: details.mtime.toISOString(),
      safetyBackup: entry.name.startsWith('pre-restore-'),
    });
  }
  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function downloadStoredBackup(response, user, filename) {
  requireAdmin(user);
  const backupPath = safeServerBackupPath(filename);
  try {
    await stat(backupPath);
  } catch {
    throw new HttpError(404, 'Server backup was not found');
  }
  await streamBackup(response, { filename, path: backupPath });
}

async function readUpload(request, destination) {
  const declaredSize = Number(request.headers['content-length'] || 0);
  if (declaredSize > MAX_BACKUP_BYTES) throw new HttpError(413, 'Backup file exceeds the configured size limit');

  const file = await open(destination, 'wx', 0o600);
  let receivedBytes = 0;
  try {
    for await (const chunk of request) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BACKUP_BYTES) throw new HttpError(413, 'Backup file exceeds the configured size limit');
      await file.write(chunk);
    }
  } finally {
    await file.close();
  }
  if (receivedBytes === 0) throw new HttpError(400, 'No backup file was uploaded');
}

async function registerStagedBackup(user, packagePath, temporaryDirectory = null) {
  const validation = await validateBackupPackage(packagePath);
  for (const [existingToken, existingStage] of stagedBackups) {
    if (existingStage.userId === user.id) await removeStagedBackup(existingToken);
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + STAGE_LIFETIME_MS;
  stagedBackups.set(token, { userId: user.id, packagePath, temporaryDirectory, expiresAt });
  const cleanupTimer = setTimeout(() => void removeStagedBackup(token), STAGE_LIFETIME_MS);
  cleanupTimer.unref();
  return { restoreToken: token, expiresAt: new Date(expiresAt).toISOString(), manifest: validation.manifest };
}

async function removeStagedBackup(token) {
  const staged = stagedBackups.get(token);
  stagedBackups.delete(token);
  if (staged?.temporaryDirectory) {
    await rm(staged.temporaryDirectory, { recursive: true, force: true });
  }
}

export async function stageUploadedBackup(request, user) {
  requireAdmin(user);
  const stagingDirectory = await mkdtemp(path.join(tmpdir(), 'dragonbane-upload-'));
  const packagePath = path.join(stagingDirectory, 'backup.tar.gz');
  try {
    await readUpload(request, packagePath);
    return await registerStagedBackup(user, packagePath, stagingDirectory);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function stageStoredBackup(user, filename) {
  requireAdmin(user);
  const sourcePath = safeServerBackupPath(filename);
  try {
    await stat(sourcePath);
  } catch {
    throw new HttpError(404, 'Server backup was not found');
  }
  const stagingDirectory = await mkdtemp(path.join(tmpdir(), 'dragonbane-upload-'));
  const packagePath = path.join(stagingDirectory, 'backup.tar.gz');
  try {
    await copyFile(sourcePath, packagePath);
    await chmod(packagePath, 0o600);
    return await registerStagedBackup(user, packagePath, stagingDirectory);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function replaceStorage(storageArchive) {
  const stagingName = `.restore-${randomBytes(8).toString('hex')}`;
  const stagingPath = path.join(STORAGE_ROOT, stagingName);
  await mkdir(stagingPath, { recursive: false, mode: 0o700 });
  try {
    await runCommand('tar', ['-C', stagingPath, '-xzf', storageArchive]);
    const currentEntries = await readdir(STORAGE_ROOT);
    for (const entry of currentEntries) {
      if (entry !== stagingName) await rm(path.join(STORAGE_ROOT, entry), { recursive: true, force: true });
    }
    for (const entry of await readdir(stagingPath)) {
      await rename(path.join(stagingPath, entry), path.join(STORAGE_ROOT, entry));
    }
  } finally {
    await rm(stagingPath, { recursive: true, force: true });
  }
}

export async function restoreStagedBackup(user, { restoreToken, confirmation, password }) {
  requireAdmin(user);
  const staged = stagedBackups.get(String(restoreToken || ''));
  if (!staged || staged.userId !== user.id || staged.expiresAt <= Date.now()) {
    throw new HttpError(400, 'The validated backup has expired; validate it again');
  }
  if (confirmation !== `RESTORE ${databaseConfig.name}`) {
    throw new HttpError(400, `Confirmation must exactly match RESTORE ${databaseConfig.name}`);
  }
  if (!await verifyUserPassword(user.id, password)) {
    throw new HttpError(403, 'Administrator password is incorrect');
  }

  const validation = await validateBackupPackage(staged.packagePath, { keepExtracted: true });
  let maintenanceEntered = false;
  let safetyBackup;
  try {
    await enterMaintenance('restore', 1);
    maintenanceEntered = true;
    safetyBackup = await createBackupPackage('pre-restore');
    await validateBackupPackage(safetyBackup.path);

    await runCommand('pg_restore', [
      ...databaseArgs(),
      '-d', databaseConfig.name,
      '--clean',
      '--if-exists',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      path.join(validation.extractedDirectory, 'database.dump'),
    ], { maxOutputBytes: 20_000_000 });
    await replaceStorage(path.join(validation.extractedDirectory, 'storage.tar.gz'));

    const criticalTables = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('users', 'app_credentials', 'app_sessions')`,
    );
    if (criticalTables.rows[0].count !== 3) throw new Error('Restored database is missing critical tables');

    console.log(`Administrator ${user.email} restored recovery set; safety copy ${safetyBackup.filename}`);
    return { restored: true, safetyBackup: safetyBackup.filename, manifest: validation.manifest };
  } finally {
    if (maintenanceEntered) leaveMaintenance();
    await rm(validation.extractedDirectory, { recursive: true, force: true });
    if (maintenanceEntered) await removeStagedBackup(String(restoreToken || ''));
  }
}

export function recoveryDatabaseName() {
  return databaseConfig.name;
}
