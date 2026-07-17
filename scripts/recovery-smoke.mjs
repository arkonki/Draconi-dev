/* global fetch */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';

const apiBase = (process.env.RECOVERY_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const adminEmail = process.env.RECOVERY_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.RECOVERY_TEST_PASSWORD;

if (!adminPassword) {
  throw new Error('Set RECOVERY_TEST_PASSWORD to the current administrator password.');
}

async function jsonRequest(path, { token, ...init } = {}) {
  const headers = { ...(init.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const signIn = await jsonRequest('/auth/sign-in', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
assert.equal(signIn.response.status, 200, JSON.stringify(signIn.payload));
const adminToken = signIn.payload.session.access_token;

const unauthenticated = await jsonRequest('/admin/recovery/backups');
assert.equal(unauthenticated.response.status, 401);

const suffix = Date.now().toString(36);
const playerEmail = `recovery-smoke-${suffix}@example.com`;
const playerPassword = 'Recovery-smoke-123!';
const createdPlayer = await jsonRequest('/auth/sign-up', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: playerEmail,
    password: playerPassword,
    options: { data: { username: `recovery-smoke-${suffix}`, role: 'player' } },
  }),
});
assert.equal(createdPlayer.response.status, 201, JSON.stringify(createdPlayer.payload));

const playerSignIn = await jsonRequest('/auth/sign-in', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: playerEmail, password: playerPassword }),
});
assert.equal(playerSignIn.response.status, 200, JSON.stringify(playerSignIn.payload));
const playerDenied = await jsonRequest('/admin/recovery/backups', {
  token: playerSignIn.payload.session.access_token,
});
assert.equal(playerDenied.response.status, 403);

const deletePlayer = await jsonRequest('/data/query', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    table: 'users',
    action: 'delete',
    filters: [{ operator: 'eq', column: 'id', value: createdPlayer.payload.user.id }],
  }),
});
assert.equal(deletePlayer.response.status, 200, JSON.stringify(deletePlayer.payload));

const backupResponse = await fetch(`${apiBase}/admin/recovery/backup`, {
  method: 'POST',
  headers: { authorization: `Bearer ${adminToken}` },
});
if (backupResponse.status !== 200) {
  throw new Error(`Backup request failed (${backupResponse.status}): ${await backupResponse.text()}`);
}
assert.equal(backupResponse.headers.get('content-type'), 'application/gzip');
const backupFilename = backupResponse.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1];
assert.match(backupFilename || '', /^dragonbane-backup-.+\.tar\.gz$/);
const backupBody = Buffer.from(await backupResponse.arrayBuffer());
assert.ok(backupBody.length > 1_000);

const listResponse = await jsonRequest('/admin/recovery/backups', { token: adminToken });
assert.equal(listResponse.response.status, 200, JSON.stringify(listResponse.payload));
assert.ok(listResponse.payload.data.some((backup) => backup.filename === backupFilename));
const databaseName = listResponse.payload.databaseName;

const storedDownload = await fetch(`${apiBase}/admin/recovery/backups/${encodeURIComponent(backupFilename)}`, {
  headers: { authorization: `Bearer ${adminToken}` },
});
assert.equal(storedDownload.status, 200);
assert.deepEqual(Buffer.from(await storedDownload.arrayBuffer()), backupBody);

const storedStage = await jsonRequest('/admin/recovery/stage-server', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ filename: backupFilename }),
});
assert.equal(storedStage.response.status, 200, JSON.stringify(storedStage.payload));
assert.equal(storedStage.payload.manifest.databaseName, databaseName);

const corruptedBackup = Buffer.from(backupBody);
corruptedBackup[Math.floor(corruptedBackup.length / 2)] ^= 0xff;
const corruptedStage = await jsonRequest('/admin/recovery/stage-upload', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/gzip', 'content-length': String(corruptedBackup.length) },
  body: corruptedBackup,
});
assert.equal(corruptedStage.response.status, 400);

const stageResponse = await jsonRequest('/admin/recovery/stage-upload', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/gzip', 'content-length': String(backupBody.length) },
  body: backupBody,
});
assert.equal(stageResponse.response.status, 200, JSON.stringify(stageResponse.payload));
assert.equal(stageResponse.payload.manifest.databaseName, databaseName);

const wrongConfirmation = await jsonRequest('/admin/recovery/restore', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    restoreToken: stageResponse.payload.restoreToken,
    confirmation: 'RESTORE wrong_database',
    password: adminPassword,
  }),
});
assert.equal(wrongConfirmation.response.status, 400);

const wrongPassword = await jsonRequest('/admin/recovery/restore', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    restoreToken: stageResponse.payload.restoreToken,
    confirmation: `RESTORE ${databaseName}`,
    password: 'definitely-not-the-admin-password',
  }),
});
assert.equal(wrongPassword.response.status, 403);

const restoreResponse = await jsonRequest('/admin/recovery/restore', {
  token: adminToken,
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    restoreToken: stageResponse.payload.restoreToken,
    confirmation: `RESTORE ${databaseName}`,
    password: adminPassword,
  }),
});
assert.equal(restoreResponse.response.status, 200, JSON.stringify(restoreResponse.payload));
assert.equal(restoreResponse.payload.restored, true);
assert.match(restoreResponse.payload.safetyBackup, /^pre-restore-.+\.tar\.gz$/);

const health = await jsonRequest('/health');
assert.equal(health.response.status, 200, JSON.stringify(health.payload));
assert.equal(health.payload.status, 'ok');

const finalList = await jsonRequest('/admin/recovery/backups', { token: adminToken });
assert.equal(finalList.response.status, 200, JSON.stringify(finalList.payload));
assert.ok(finalList.payload.data.some((backup) => backup.filename === restoreResponse.payload.safetyBackup));

console.log(JSON.stringify({
  backup: backupFilename,
  safetyBackup: restoreResponse.payload.safetyBackup,
  bytes: backupBody.length,
  authorizationChecks: 'passed',
  retainedBackupPaths: 'passed',
  corruptionRejection: 'passed',
  restore: 'passed',
}, null, 2));
