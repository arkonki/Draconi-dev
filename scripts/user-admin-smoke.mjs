/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.USERADMIN_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.USERADMIN_TEST_DATABASE_URL;
const adminEmail = process.env.USERADMIN_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.USERADMIN_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set USERADMIN_TEST_PASSWORD and USERADMIN_TEST_DATABASE_URL for the disposable test accounts.');
}

const suffix = randomUUID().slice(0, 8);
const password = `UserAdmin-${suffix}-123!`;
const emails = { alice: `ua-alice-${suffix}@example.com`, bob: `ua-bob-${suffix}@example.com`, carol: `ua-carol-${suffix}@example.com` };
const database = new Client({ connectionString: databaseUrl });
const results = {};

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const sendsBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
  if (sendsBody) headers['content-type'] = 'application/json';
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: sendsBody ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function expectStatus(promise, status, label) {
  const result = await promise;
  assert.equal(result.status, status, `${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.payload)}`);
  return result.payload;
}

async function signIn(email, pass = password) {
  const { status, payload } = await call('POST', '/auth/sign-in', { body: { email, password: pass } });
  return { status, token: payload.session?.access_token, user: payload.user };
}

const dataQuery = (token, body) => call('POST', '/data/query', { token, body });

async function cleanup() {
  await database.query(`DELETE FROM parties WHERE name LIKE $1`, [`UA Party ${suffix}%`]);
  await database.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [Object.values(emails)]);
  await database.query(`DELETE FROM admin_audit_log WHERE target_email = ANY($1::text[])`, [Object.values(emails)]);
}

await database.connect();
try {
  const admin = await signIn(adminEmail, adminPassword);
  assert.ok(admin.token, 'Administrator sign-in failed');

  // --- Accounts are created through the existing administrator sign-up route.
  const created = {};
  for (const [name, email] of Object.entries(emails)) {
    const payload = await expectStatus(call('POST', '/auth/sign-up', {
      token: admin.token,
      body: { email, password, options: { data: { username: `ua-${name}-${suffix}`, role: 'player' } } },
    }), 201, `create ${name}`);
    created[name] = payload.user.id;
  }
  const alice = await signIn(emails.alice);
  const bob = await signIn(emails.bob);
  assert.ok(alice.token && bob.token);

  // --- Privilege escalation through the generic endpoint is closed.
  const escalate = await dataQuery(alice.token, { table: 'users', action: 'update', payload: { role: 'admin' }, filters: [{ operator: 'eq', column: 'id', value: created.alice }] });
  assert.equal(escalate.status, 403, 'A player must not be able to change their own role');
  const selfDelete = await dataQuery(alice.token, { table: 'users', action: 'delete', filters: [{ operator: 'eq', column: 'id', value: created.alice }] });
  assert.equal(selfDelete.status, 403, 'Accounts must not be deletable through the generic endpoint');
  const emailProbe = await dataQuery(alice.token, { table: 'users', action: 'select', filters: [{ operator: 'eq', column: 'email', value: emails.bob }] });
  assert.equal(emailProbe.status, 403, 'Players must not search other accounts by email');
  const othersRows = await dataQuery(alice.token, { table: 'users', action: 'select', filters: [{ operator: 'eq', column: 'id', value: created.bob }] });
  assert.deepEqual(Object.keys(othersRows.payload.data[0]).sort(), ['avatar_url', 'first_name', 'id', 'last_name', 'username'], 'Other accounts must only expose display fields');
  const ownProfile = await dataQuery(alice.token, { table: 'users', action: 'update', payload: { first_name: 'Alice' }, filters: [{ operator: 'eq', column: 'id', value: created.alice }] });
  assert.equal(ownProfile.status, 200, 'Players must still edit their own profile');
  results.privilegeEscalationClosed = 'passed';

  // --- Non-administrators cannot use the administrator endpoints.
  for (const [method, path] of [['GET', '/admin/users'], ['GET', '/admin/audit'], ['PATCH', `/admin/users/${created.bob}`], ['DELETE', `/admin/users/${created.bob}`], ['POST', `/admin/users/${created.bob}/reset-password`]]) {
    await expectStatus(call(method, path, { token: alice.token, body: {} }), 403, `${method} ${path} as player`);
    await expectStatus(call(method, path, { body: {} }), 401, `${method} ${path} anonymous`);
  }
  results.adminEndpointsAuthorised = 'passed';

  // --- Listing includes usage figures.
  const list = await expectStatus(call('GET', '/admin/users', { token: admin.token }), 200, 'list users');
  const aliceRow = list.users.find((user) => user.id === created.alice);
  assert.ok(aliceRow && aliceRow.has_password === true && aliceRow.character_count === 0);
  assert.equal(aliceRow.is_active, true);
  results.listUsers = 'passed';

  // --- Editing, validation and conflicts.
  const edited = await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: { role: 'dm', first_name: 'Alice', last_name: 'Tester' } }), 200, 'edit');
  assert.equal(edited.user.role, 'dm');
  await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: { role: 'wizard' } }), 400, 'invalid role');
  await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: { email: 'not-an-email' } }), 400, 'invalid email');
  await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: { email: emails.bob } }), 409, 'duplicate email');
  await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: {} }), 400, 'empty change');
  await expectStatus(call('PATCH', `/admin/users/${randomUUID()}`, { token: admin.token, body: { role: 'dm' } }), 404, 'unknown user');
  await expectStatus(call('PATCH', '/admin/users/not-a-uuid', { token: admin.token, body: { role: 'dm' } }), 400, 'bad id');
  results.editAndValidation = 'passed';

  // --- An administrator cannot lock themselves out.
  await expectStatus(call('PATCH', `/admin/users/${admin.user.id}`, { token: admin.token, body: { role: 'player' } }), 409, 'self demote');
  await expectStatus(call('PATCH', `/admin/users/${admin.user.id}`, { token: admin.token, body: { is_active: false } }), 409, 'self deactivate');
  await expectStatus(call('DELETE', `/admin/users/${admin.user.id}`, { token: admin.token, body: { confirmEmail: adminEmail } }), 409, 'self delete');
  results.selfProtection = 'passed';

  // --- Deactivation ends sessions immediately and blocks sign-in until reactivated.
  const before = await call('GET', '/auth/user', { token: alice.token });
  assert.equal(before.status, 200);
  await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: { is_active: false } }), 200, 'deactivate');
  assert.equal((await call('GET', '/auth/user', { token: alice.token })).status, 401, 'Deactivated user session must stop working');
  assert.equal((await signIn(emails.alice)).status, 400, 'Deactivated user must not sign in');
  await expectStatus(call('PATCH', `/admin/users/${created.alice}`, { token: admin.token, body: { is_active: true } }), 200, 'reactivate');
  assert.ok((await signIn(emails.alice)).token, 'Reactivated user must sign in again');
  results.deactivateAndReactivate = 'passed';

  // --- Password reset: generated and custom, old sessions revoked.
  const oldCarol = await signIn(emails.carol);
  const reset = await expectStatus(call('POST', `/admin/users/${created.carol}/reset-password`, { token: admin.token, body: {} }), 200, 'reset password');
  assert.ok(reset.generated && reset.password.length >= 12);
  assert.equal((await call('GET', '/auth/user', { token: oldCarol.token })).status, 401, 'Reset must end existing sessions');
  assert.equal((await signIn(emails.carol, password)).status, 400, 'Old password must stop working');
  assert.ok((await signIn(emails.carol, reset.password)).token, 'Generated password must work');
  await expectStatus(call('POST', `/admin/users/${created.carol}/reset-password`, { token: admin.token, body: { password: 'short' } }), 400, 'weak password');
  const custom = await expectStatus(call('POST', `/admin/users/${created.carol}/reset-password`, { token: admin.token, body: { password: `Custom-${suffix}-pw` } }), 200, 'custom password');
  assert.equal(custom.generated, false);
  assert.ok((await signIn(emails.carol, `Custom-${suffix}-pw`)).token);
  results.passwordReset = 'passed';

  // --- Sign out everywhere.
  const bobSession = await signIn(emails.bob);
  const revoked = await expectStatus(call('POST', `/admin/users/${created.bob}/revoke-sessions`, { token: admin.token }), 200, 'revoke sessions');
  assert.ok(revoked.sessionsRevoked >= 1);
  assert.equal((await call('GET', '/auth/user', { token: bobSession.token })).status, 401);
  results.revokeSessions = 'passed';

  // --- Deleting a campaign owner requires a successor and keeps the campaign.
  const bobAgain = await signIn(emails.bob);
  const party = (await dataQuery(bobAgain.token, { table: 'parties', action: 'insert', payload: { name: `UA Party ${suffix}`, description: 'disposable' } })).payload.data[0];
  assert.ok(party?.id, 'Bob must be able to create a campaign');
  await dataQuery(bobAgain.token, { table: 'characters', action: 'insert', payload: { name: `UA Hero ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } });

  const impact = await expectStatus(call('GET', `/admin/users/${created.bob}/impact`, { token: admin.token }), 200, 'impact');
  assert.equal(impact.owned_campaigns.length, 1);
  assert.equal(impact.characters, 1);
  assert.equal(impact.needs_transfer, true);

  await expectStatus(call('DELETE', `/admin/users/${created.bob}`, { token: admin.token, body: {} }), 400, 'delete without confirmation');
  await expectStatus(call('DELETE', `/admin/users/${created.bob}`, { token: admin.token, body: { confirmEmail: 'someone-else@example.com' } }), 400, 'delete wrong confirmation');
  const needsHeir = await call('DELETE', `/admin/users/${created.bob}`, { token: admin.token, body: { confirmEmail: emails.bob } });
  assert.equal(needsHeir.status, 409);
  assert.equal(needsHeir.payload.error.code, 'TRANSFER_REQUIRED');
  await expectStatus(call('DELETE', `/admin/users/${created.bob}`, { token: admin.token, body: { confirmEmail: emails.bob, transferTo: created.bob } }), 400, 'transfer to self');
  assert.equal((await database.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [created.bob])).rows[0].n, 1, 'Failed deletions must not remove the user');

  const removed = await expectStatus(call('DELETE', `/admin/users/${created.bob}`, { token: admin.token, body: { confirmEmail: emails.bob.toUpperCase(), transferTo: created.alice } }), 200, 'delete with transfer');
  assert.equal(removed.deleted.email, emails.bob);
  assert.equal(removed.transferred.campaigns, 1);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [created.bob])).rows[0].n, 0);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM characters WHERE user_id = $1', [created.bob])).rows[0].n, 0, 'Characters are removed with the account');
  const survivingParty = (await database.query('SELECT created_by FROM parties WHERE id = $1', [party.id])).rows[0];
  assert.equal(survivingParty.created_by, created.alice, 'The campaign must survive and belong to the successor');
  const ownerRole = (await database.query('SELECT role FROM campaign_memberships WHERE party_id = $1 AND user_id = $2', [party.id, created.alice])).rows[0];
  assert.equal(ownerRole.role, 'owner', 'The successor must become campaign owner');
  results.deleteWithTransfer = 'passed';

  // --- Deleting a user who owns nothing needs no successor.
  const plainDelete = await expectStatus(call('DELETE', `/admin/users/${created.carol}`, { token: admin.token, body: { confirmEmail: emails.carol } }), 200, 'delete plain user');
  assert.equal(plainDelete.deleted.email, emails.carol);
  results.deletePlainUser = 'passed';

  // --- Everything above is recorded, and the log outlives the deleted accounts.
  const log = await expectStatus(call('GET', `/admin/audit?limit=200`, { token: admin.token }), 200, 'audit log');
  const actions = new Set(log.entries.filter((entry) => Object.values(emails).includes(entry.target_email)).map((entry) => entry.action));
  for (const action of ['user.update', 'user.deactivate', 'user.reactivate', 'user.reset_password', 'user.revoke_sessions', 'user.delete']) {
    assert.ok(actions.has(action), `Missing audit entry: ${action}`);
  }
  assert.ok(!JSON.stringify(log.entries).includes(reset.password), 'Passwords must never be written to the audit log');
  results.auditLog = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
