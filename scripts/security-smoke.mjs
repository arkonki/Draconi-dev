/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.SECURITY_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
const adminEmail = process.env.SECURITY_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.SECURITY_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set SECURITY_TEST_PASSWORD and SECURITY_TEST_DATABASE_URL for the disposable local test accounts.');
}

const suffix = randomUUID().slice(0, 8);
const testPassword = `Security-${suffix}-123!`;
const accounts = {
  owner: { email: `security-owner-${suffix}@example.com`, username: `security-owner-${suffix}`, role: 'player' },
  member: { email: `security-member-${suffix}@example.com`, username: `security-member-${suffix}`, role: 'player' },
  dm: { email: `security-dm-${suffix}@example.com`, username: `security-dm-${suffix}`, role: 'dm' },
};
const testEmails = Object.values(accounts).map((account) => account.email);
const database = new Client({ connectionString: databaseUrl });

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

async function expectStatus(result, status) {
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  return result.payload;
}

async function dataQuery(token, query, status = 200) {
  return (await expectStatus(await postJson('/data/query', query, token), status)).data;
}

async function rpc(token, name, args, status = 200) {
  return (await expectStatus(await postJson(`/rpc/${name}`, args, token), status)).data;
}

async function appFunction(token, name, body, status = 200) {
  return expectStatus(await postJson(`/functions/${name}`, body, token), status);
}

async function signIn(account) {
  const payload = await expectStatus(await postJson('/auth/sign-in', {
    email: account.email,
    password: account.password || testPassword,
  }), 200);
  return { ...account, id: payload.user.id, token: payload.session.access_token };
}

await database.connect();
try {
  const admin = await signIn({ email: adminEmail, password: adminPassword });
  const databaseAdmin = await database.query('SELECT id FROM users WHERE lower(email) = lower($1)', [adminEmail]);
  assert.equal(
    databaseAdmin.rows[0]?.id,
    admin.id,
    'SECURITY_TEST_DATABASE_URL does not point to the database used by SECURITY_TEST_API',
  );

  for (const account of Object.values(accounts)) {
    await expectStatus(await postJson('/auth/sign-up', {
      email: account.email,
      password: testPassword,
      options: { data: { username: account.username, role: account.role } },
    }, admin.token), 201);
  }

  const owner = await signIn(accounts.owner);
  const member = await signIn(accounts.member);
  const dm = await signIn(accounts.dm);

  const [ownerCharacter] = await dataQuery(owner.token, {
    table: 'characters', action: 'insert', payload: { name: `Owner Hero ${suffix}` },
  });
  const [memberCharacter] = await dataQuery(member.token, {
    table: 'characters', action: 'insert', payload: { name: `Member Hero ${suffix}` },
  });

  assert.deepEqual(await dataQuery(member.token, {
    table: 'characters', filters: [{ operator: 'eq', column: 'id', value: ownerCharacter.id }],
  }), []);
  assert.deepEqual(await dataQuery(member.token, {
    table: 'characters', action: 'update',
    filters: [{ operator: 'eq', column: 'id', value: ownerCharacter.id }],
    payload: { name: 'Unauthorized rename' },
  }), []);
  const [unchangedCharacter] = await dataQuery(owner.token, {
    table: 'characters', filters: [{ operator: 'eq', column: 'id', value: ownerCharacter.id }],
  });
  assert.equal(unchangedCharacter.name, `Owner Hero ${suffix}`);

  const [party] = await dataQuery(owner.token, {
    table: 'parties', action: 'insert', payload: { name: `Security Party ${suffix}` },
  });
  assert.deepEqual(await dataQuery(member.token, {
    table: 'parties', filters: [{ operator: 'eq', column: 'id', value: party.id }],
  }), []);
  assert.equal(await rpc(member.token, 'join_party_with_character', {
    invite_code: party.invite_code,
    character_id: memberCharacter.id,
  }), party.id);
  const memberParties = await dataQuery(member.token, {
    table: 'parties', filters: [{ operator: 'eq', column: 'id', value: party.id }],
  });
  assert.equal(memberParties.length, 1);

  const [encounter] = await dataQuery(owner.token, {
    table: 'encounters', action: 'insert', payload: { party_id: party.id, name: `Security Encounter ${suffix}` },
  });
  await rpc(member.token, 'advance_encounter_round', { p_encounter_id: encounter.id }, 403);
  await rpc(dm.token, 'advance_encounter_round', { p_encounter_id: encounter.id }, 403);
  await rpc(owner.token, 'advance_encounter_round', { p_encounter_id: encounter.id });
  const [advancedEncounter] = await dataQuery(owner.token, {
    table: 'encounters', filters: [{ operator: 'eq', column: 'id', value: encounter.id }],
  });
  assert.equal(advancedEncounter.current_round, 1);

  const [initialSettings] = await dataQuery(owner.token, {
    table: 'user_notification_settings', action: 'upsert', onConflict: 'user_id',
    payload: { desktop_new_message: true },
  });
  assert.equal(initialSettings.desktop_new_message, true);
  const [updatedSettings] = await dataQuery(owner.token, {
    table: 'user_notification_settings', action: 'upsert', onConflict: 'user_id',
    payload: { desktop_new_message: false },
  });
  assert.equal(updatedSettings.id, initialSettings.id);
  assert.equal(updatedSettings.desktop_new_message, false);
  await dataQuery(owner.token, {
    table: 'user_notification_settings', action: 'insert', payload: { desktop_new_message: true },
  }, 409);
  await dataQuery(owner.token, {
    table: 'user_notification_settings', action: 'upsert', onConflict: 'not_a_column',
    payload: { desktop_new_message: true },
  }, 400);

  const invalidProjector = await appFunction(null, 'get-player-display-state', {
    sessionToken: `invalid-${suffix}`,
  }, 410);
  assert.equal(invalidProjector.error.code, 'APP_ERROR');

  const projector = await appFunction(owner.token, 'create-party-display-session', { partyId: party.id });
  const projectorState = await appFunction(null, 'get-player-display-state', {
    sessionToken: projector.sessionToken,
  });
  assert.equal(projectorState.party.id, party.id);
  await appFunction(owner.token, 'revoke-party-display-session', { sessionId: projector.session.id });
  await appFunction(null, 'get-player-display-state', { sessionToken: projector.sessionToken }, 410);

  const expiringProjector = await appFunction(owner.token, 'create-party-display-session', { partyId: party.id });
  await database.query(
    "UPDATE party_display_sessions SET expires_at = now() - interval '1 minute' WHERE id = $1",
    [expiringProjector.session.id],
  );
  await appFunction(null, 'get-player-display-state', { sessionToken: expiringProjector.sessionToken }, 410);

  const memberTokenHash = createHash('sha256').update(member.token).digest('hex');
  await database.query(
    "UPDATE app_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
    [memberTokenHash],
  );
  const expiredSession = await jsonRequest('/auth/user', { token: member.token });
  const expiredPayload = await expectStatus(expiredSession, 401);
  assert.equal(expiredPayload.error.code, 'SESSION_EXPIRED');

  console.log(JSON.stringify({
    userIsolation: 'passed',
    partyMembership: 'passed',
    ownerOnlyMutations: 'passed',
    upsertConflicts: 'passed',
    expiredSessions: 'passed',
    projectorTokens: 'passed',
  }, null, 2));
} finally {
  try {
    await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [testEmails]);
  } finally {
    await database.end();
  }
}
