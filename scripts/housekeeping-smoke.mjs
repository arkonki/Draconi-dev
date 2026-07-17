/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.HOUSEKEEPING_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.HOUSEKEEPING_TEST_DATABASE_URL;
const adminEmail = process.env.HOUSEKEEPING_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.HOUSEKEEPING_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set HOUSEKEEPING_TEST_PASSWORD and HOUSEKEEPING_TEST_DATABASE_URL for the local cleanup rehearsal.');
}

const suffix = randomUUID().slice(0, 8);
const playerEmail = `housekeeping-${suffix}@example.com`;
const playerPassword = `Housekeeping-${suffix}-123!`;
const sentinelTokenHash = createHash('sha256').update(`housekeeping-${suffix}`).digest('hex');
const database = new Client({ connectionString: databaseUrl });
let playerId = null;
let eventId = null;

async function jsonRequest(path, { token, ...init } = {}) {
  const headers = { ...(init.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function postJson(path, body, token) {
  return jsonRequest(path, {
    token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function expectStatus(result, status) {
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  return result.payload;
}

const signIn = async (email, password) => expectStatus(await postJson('/auth/sign-in', { email, password }), 200);

await database.connect();
try {
  const admin = await signIn(adminEmail, adminPassword);
  const adminId = admin.user.id;
  const databaseAdmin = await database.query('SELECT id FROM users WHERE lower(email) = lower($1)', [adminEmail]);
  assert.equal(databaseAdmin.rows[0]?.id, adminId, 'The API and test database URL do not target the same database');
  const adminToken = admin.session.access_token;

  expectStatus(await jsonRequest('/admin/housekeeping'), 401);

  const createdPlayer = expectStatus(await postJson('/auth/sign-up', {
    email: playerEmail,
    password: playerPassword,
    options: { data: { username: `housekeeping-${suffix}`, role: 'player' } },
  }, adminToken), 201);
  playerId = createdPlayer.user.id;
  const player = await signIn(playerEmail, playerPassword);
  expectStatus(await jsonRequest('/admin/housekeeping', { token: player.session.access_token }), 403);

  const initialStatus = expectStatus(await jsonRequest('/admin/housekeeping', { token: adminToken }), 200);
  assert.ok(initialStatus.config.expiredSessionRetentionHours >= 0);
  assert.ok(initialStatus.config.changeEventRetentionDays >= 1);

  await database.query(`
    INSERT INTO app_sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, now() - (($3::integer + 1) * interval '1 hour'))
  `, [sentinelTokenHash, playerId, initialStatus.config.expiredSessionRetentionHours]);
  const insertedEvent = await database.query(`
    INSERT INTO app_change_events (table_name, event_type, record_id, old_record, created_at)
    VALUES ('users', 'HOUSEKEEPING_TEST', $1, '{}'::jsonb,
      now() - (($2::integer + 1) * interval '1 day'))
    RETURNING id
  `, [playerId, initialStatus.config.changeEventRetentionDays]);
  eventId = insertedEvent.rows[0].id;

  const eligibleStatus = expectStatus(await jsonRequest('/admin/housekeeping', { token: adminToken }), 200);
  assert.ok(eligibleStatus.pending.expiredSessions >= 1);
  assert.ok(eligibleStatus.pending.changeEvents >= 1);

  const cleanup = expectStatus(await postJson('/admin/housekeeping/run', {}, adminToken), 200);
  assert.ok(cleanup.deletedSessions >= 1);
  assert.ok(cleanup.deletedChangeEvents >= 1);
  assert.equal(cleanup.reason, 'manual');

  const remainingSession = await database.query('SELECT 1 FROM app_sessions WHERE token_hash = $1', [sentinelTokenHash]);
  const remainingEvent = await database.query('SELECT 1 FROM app_change_events WHERE id = $1', [eventId]);
  assert.equal(remainingSession.rowCount, 0);
  assert.equal(remainingEvent.rowCount, 0);

  const finalStatus = expectStatus(await jsonRequest('/admin/housekeeping', { token: adminToken }), 200);
  assert.equal(finalStatus.lastReason, 'manual');
  assert.ok(finalStatus.lastCompletedAt);

  console.log(JSON.stringify({
    authorization: 'passed',
    scheduledConfiguration: finalStatus.enabled ? 'enabled' : 'disabled',
    expiredSessionCleanup: 'passed',
    changeEventCleanup: 'passed',
    cleanupResult: cleanup,
  }, null, 2));
} finally {
  try {
    await database.query('DELETE FROM app_sessions WHERE token_hash = $1', [sentinelTokenHash]);
    if (eventId) await database.query('DELETE FROM app_change_events WHERE id = $1', [eventId]);
    if (playerId) await database.query('DELETE FROM users WHERE id = $1', [playerId]);
  } finally {
    await database.end();
  }
}
