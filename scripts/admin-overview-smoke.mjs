/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.OVERVIEW_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.OVERVIEW_TEST_DATABASE_URL;
const adminEmail = process.env.OVERVIEW_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.OVERVIEW_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set OVERVIEW_TEST_PASSWORD and OVERVIEW_TEST_DATABASE_URL for the disposable test accounts.');
}

const suffix = randomUUID().slice(0, 8);
const password = `Overview-${suffix}-123!`;
const emails = { active: `ov-active-${suffix}@example.com`, idle: `ov-idle-${suffix}@example.com` };
const database = new Client({ connectionString: databaseUrl });
const results = {};

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const sendsBody = body !== undefined && method !== 'GET';
  if (sendsBody) headers['content-type'] = 'application/json';
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: sendsBody ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function ok(promise, status, label) {
  const result = await promise;
  assert.equal(result.status, status, `${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.payload)}`);
  return result.payload;
}

async function cleanup() {
  await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
  await database.query('DELETE FROM admin_audit_log WHERE target_email = ANY($1::text[])', [Object.values(emails)]);
}

await database.connect();
try {
  const admin = (await call('POST', '/auth/sign-in', { body: { email: adminEmail, password: adminPassword } })).payload.session?.access_token;
  assert.ok(admin, 'Administrator sign-in failed');

  // --- Only administrators may read the overview or the performance counters.
  await ok(call('GET', '/admin/overview'), 401, 'anonymous overview');
  for (const email of Object.values(emails)) {
    await ok(call('POST', '/auth/sign-up', { token: admin, body: { email, password, options: { data: { username: email.split('@')[0], role: 'player' } } } }), 201, `create ${email}`);
  }
  const player = (await call('POST', '/auth/sign-in', { body: { email: emails.active, password } })).payload.session.access_token;
  await ok(call('GET', '/admin/overview', { token: player }), 403, 'player overview');
  await ok(call('GET', '/admin/performance', { token: player }), 403, 'player performance');
  await ok(call('POST', '/admin/performance/reset', { token: player }), 403, 'player reset');
  results.adminOnly = 'passed';

  // --- The numbers match the database.
  const overview = await ok(call('GET', '/admin/overview', { token: admin }), 200, 'overview');
  const counted = async (sql) => Number((await database.query(sql)).rows[0].n);
  assert.equal(overview.users.total, await counted('SELECT count(*) AS n FROM users'));
  assert.equal(overview.users.active, await counted('SELECT count(*) AS n FROM users WHERE is_active'));
  assert.equal(overview.users.admins, await counted("SELECT count(*) AS n FROM users WHERE role = 'admin' AND is_active"));
  assert.equal(overview.content.characters, await counted('SELECT count(*) AS n FROM characters'));
  assert.equal(overview.content.campaigns, await counted('SELECT count(*) AS n FROM parties'));
  assert.equal(overview.database.migrations.applied, await counted('SELECT count(*) AS n FROM app_schema_migrations'));
  assert.equal(overview.database.migrations.latest, (await database.query('SELECT max(version) AS v FROM app_schema_migrations')).rows[0].v);
  assert.ok(overview.database.sizeBytes > 0 && overview.app.version && overview.app.uptimeSeconds >= 0);
  assert.ok(overview.storage.files >= 0 && overview.storage.bytes >= 0);
  assert.ok(['ok', 'warning', 'critical'].includes(overview.backups.level));
  results.numbersMatchDatabase = 'passed';

  // --- "Needs attention" reacts to real accounts: the idle one has never signed in.
  const signedInBefore = overview.users.needsAttention;
  const sql = `SELECT count(*) AS n FROM users u WHERE u.is_active AND (u.last_login_at IS NULL OR NOT EXISTS (SELECT 1 FROM app_credentials c WHERE c.user_id = u.id))`;
  assert.equal(signedInBefore, await counted(sql));
  await database.query('UPDATE users SET last_login_at = NULL WHERE email = $1', [emails.active]);
  const after = await ok(call('GET', '/admin/overview', { token: admin }), 200, 'overview after');
  assert.equal(after.users.needsAttention, await counted(sql));
  assert.ok(after.users.needsAttention >= 2, 'both disposable accounts count as never signed in');
  assert.ok(after.attention.some((item) => item.code === 'users-attention' && item.section === 'users'));
  results.needsAttentionTracksAccounts = 'passed';

  // --- Attention items are ordered most severe first and drive the overall status.
  const order = { critical: 0, warning: 1, info: 2 };
  const severities = after.attention.map((item) => order[item.severity]);
  assert.deepEqual(severities, [...severities].sort((a, b) => a - b), 'most severe first');
  const expectedStatus = after.attention.some((item) => item.severity === 'critical') ? 'critical'
    : after.attention.some((item) => item.severity === 'warning') ? 'attention' : 'healthy';
  assert.equal(after.status, expectedStatus);
  assert.ok(after.attention.every((item) => item.title && item.detail && ['backups', 'users', 'maintenance', 'system'].includes(item.section)));
  results.attentionOrdering = 'passed';

  // --- The performance snapshot is reachable by administrators and its counters can be reset.
  const before = await ok(call('GET', '/admin/performance', { token: admin }), 200, 'performance');
  assert.ok(before.requests.total > 0 && before.database.pool.configuredMaximum > 0);
  await ok(call('POST', '/admin/performance/reset', { token: admin }), 200, 'reset');
  const reset = await ok(call('GET', '/admin/performance', { token: admin }), 200, 'performance after reset');
  assert.ok(reset.requests.total < before.requests.total, 'request counter restarted');
  results.performanceCounters = 'passed';

  // --- Pruning old deployment dumps is administrator-only, and a preview never deletes.
  await ok(call('POST', '/admin/backups/prune', { body: { dryRun: true } }), 401, 'anonymous prune');
  await ok(call('POST', '/admin/backups/prune', { token: player, body: { dryRun: false } }), 403, 'player prune');
  const preview = await ok(call('POST', '/admin/backups/prune', { token: admin, body: {} }), 200, 'prune preview (dry run is the default)');
  assert.equal(preview.dryRun, true);
  assert.ok(preview.policy.keep >= 1 && Array.isArray(preview.files) && preview.prunable === preview.files.length);
  results.backupPruning = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
