/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.REALTIME_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.REALTIME_TEST_DATABASE_URL;
const adminEmail = process.env.REALTIME_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.REALTIME_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set REALTIME_TEST_PASSWORD and REALTIME_TEST_DATABASE_URL for the disposable realtime rehearsal.');
}

const suffix = randomUUID().slice(0, 8);
const testPassword = `Realtime-${suffix}-123!`;
const accounts = {
  owner: { email: `realtime-owner-${suffix}@example.com`, username: `realtime-owner-${suffix}`, role: 'dm' },
  member: { email: `realtime-member-${suffix}@example.com`, username: `realtime-member-${suffix}`, role: 'player' },
  outsider: { email: `realtime-outsider-${suffix}@example.com`, username: `realtime-outsider-${suffix}`, role: 'player' },
};
const testEmails = Object.values(accounts).map((account) => account.email);
const database = new Client({ connectionString: databaseUrl });
const recordIds = new Set();
let partyId = null;

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

async function dataQuery(token, query, status = 200) {
  return expectStatus(await postJson('/data/query', query, token), status).data;
}

async function insert(token, table, payload) {
  const [row] = await dataQuery(token, { table, action: 'insert', payload });
  assert.ok(row?.id, `${table} insert did not return an id`);
  recordIds.add(row.id);
  return row;
}

async function rpc(token, name, args) {
  return expectStatus(await postJson(`/rpc/${name}`, args, token), 200).data;
}

async function realtime(token, afterId, bindings, status = 200) {
  return expectStatus(await postJson('/realtime/events', { afterId, bindings }, token), status);
}

async function signIn(account) {
  const payload = expectStatus(await postJson('/auth/sign-in', {
    email: account.email,
    password: account.password || testPassword,
  }), 200);
  return { ...account, id: payload.user.id, token: payload.session.access_token };
}

function binding(table, party, event = '*') {
  return { event, schema: 'public', table, filter: `party_id=eq.${party}` };
}

await database.connect();
try {
  const admin = await signIn({ email: adminEmail, password: adminPassword });
  const databaseAdmin = await database.query('SELECT id FROM users WHERE lower(email) = lower($1)', [adminEmail]);
  assert.equal(databaseAdmin.rows[0]?.id, admin.id, 'The API and realtime database URL do not target the same database');

  for (const account of Object.values(accounts)) {
    expectStatus(await postJson('/auth/sign-up', {
      email: account.email,
      password: testPassword,
      options: { data: { username: account.username, role: account.role } },
    }, admin.token), 201);
  }

  const owner = await signIn(accounts.owner);
  const member = await signIn(accounts.member);
  const outsider = await signIn(accounts.outsider);
  const ownerCharacter = await insert(owner.token, 'characters', { name: `Realtime Owner ${suffix}` });
  const memberCharacter = await insert(member.token, 'characters', { name: `Realtime Member ${suffix}` });
  const party = await insert(owner.token, 'parties', { name: `Realtime Party ${suffix}` });
  partyId = party.id;
  await insert(owner.token, 'party_members', { party_id: party.id, character_id: ownerCharacter.id });
  assert.equal(await rpc(member.token, 'join_party_with_character', {
    invite_code: party.invite_code,
    character_id: memberCharacter.id,
  }), party.id);

  const historicalMessage = await insert(owner.token, 'messages', {
    party_id: party.id,
    content: `Historical message ${suffix}`,
  });
  const messageBindings = [binding('messages', party.id)];
  const memberBaseline = await realtime(member.token, null, messageBindings);
  const outsiderBaseline = await realtime(outsider.token, null, messageBindings);
  assert.deepEqual(memberBaseline.events, []);
  assert.deepEqual(outsiderBaseline.events, []);
  assert.ok(Number.isSafeInteger(memberBaseline.lastId));
  assert.ok(memberBaseline.lastId > 0);
  assert.equal(memberBaseline.events.some((event) => event.record_id === historicalMessage.id), false);
  await realtime(member.token, 'not-a-cursor', messageBindings, 400);

  const liveMessage = await insert(owner.token, 'messages', {
    party_id: party.id,
    content: `Live message ${suffix}`,
  });
  const memberDelivery = await realtime(member.token, memberBaseline.lastId, messageBindings);
  const deliveredMessage = memberDelivery.events.find((event) => event.record_id === liveMessage.id);
  assert.equal(deliveredMessage?.table_name, 'messages');
  assert.equal(deliveredMessage?.event_type, 'INSERT');
  assert.equal(deliveredMessage?.new_record.content, `Live message ${suffix}`);

  const outsiderDelivery = await realtime(outsider.token, outsiderBaseline.lastId, messageBindings);
  assert.equal(outsiderDelivery.events.some((event) => event.record_id === liveMessage.id), false);
  assert.ok(outsiderDelivery.lastId >= outsiderBaseline.lastId);

  const sharedBindings = [
    binding('notes', party.id),
    binding('party_tasks', party.id),
    binding('time_trackers', party.id),
    binding('random_tables', party.id),
    binding('story_ideas', party.id),
    binding('party_maps', party.id),
  ];
  const sharedBaseline = await realtime(member.token, null, sharedBindings);
  const task = await insert(owner.token, 'party_tasks', {
    party_id: party.id, title: `Realtime Task ${suffix}`, description: 'Live task',
  });
  const tracker = await insert(owner.token, 'time_trackers', {
    party_id: party.id, current_day: 1, current_shift: 1, grid_state: { source: 'realtime' },
  });
  const randomTable = await insert(owner.token, 'random_tables', {
    party_id: party.id, name: `Realtime Table ${suffix}`, category: 'Realtime', die_type: 'd6',
    rows: [{ min: 1, max: 6, result: 'Realtime result' }],
  });
  const note = await insert(member.token, 'notes', {
    party_id: party.id, title: `Realtime Note ${suffix}`, content: 'Live note', category: 'Realtime',
  });
  const story = await insert(member.token, 'story_ideas', {
    party_id: party.id, prompt: 'Realtime prompt', response: 'Realtime response', context: {},
  });
  const map = await insert(owner.token, 'party_maps', {
    party_id: party.id, name: `Realtime Map ${suffix}`, image_url: '/realtime-test.png',
  });

  const sharedDelivery = await realtime(member.token, sharedBaseline.lastId, sharedBindings);
  const expectedRecords = new Map([
    [task.id, 'party_tasks'],
    [tracker.id, 'time_trackers'],
    [randomTable.id, 'random_tables'],
    [note.id, 'notes'],
    [story.id, 'story_ideas'],
    [map.id, 'party_maps'],
  ]);
  for (const [recordId, table] of expectedRecords) {
    const event = sharedDelivery.events.find((candidate) => candidate.record_id === recordId);
    assert.equal(event?.table_name, table, `${table} did not emit an authorized realtime event`);
    assert.equal(event?.event_type, 'INSERT');
  }

  const updatedTasks = await dataQuery(member.token, {
    table: 'party_tasks',
    action: 'update',
    filters: [{ operator: 'eq', column: 'id', value: task.id }],
    payload: { status: 'completed', completed_at: new Date().toISOString() },
  });
  assert.equal(updatedTasks.length, 1);
  const updateDelivery = await realtime(owner.token, sharedDelivery.lastId, [binding('party_tasks', party.id, 'UPDATE')]);
  const taskUpdate = updateDelivery.events.find((event) => event.record_id === task.id);
  assert.equal(taskUpdate?.event_type, 'UPDATE');
  assert.equal(taskUpdate?.new_record.status, 'completed');

  await dataQuery(member.token, {
    table: 'notes',
    action: 'delete',
    filters: [{ operator: 'eq', column: 'id', value: note.id }],
  });
  const deleteDelivery = await realtime(owner.token, updateDelivery.lastId, [binding('notes', party.id, 'DELETE')]);
  const noteDelete = deleteDelivery.events.find((event) => event.record_id === note.id);
  assert.equal(noteDelete?.event_type, 'DELETE');
  assert.equal(noteDelete?.old_record.title, `Realtime Note ${suffix}`);

  console.log(JSON.stringify({
    cursorInitialization: 'passed',
    historicalReplayPrevention: 'passed',
    invalidCursorRejection: 'passed',
    authorizedDelivery: 'passed',
    crossPartyIsolation: 'passed',
    sharedToolInsertEvents: 'passed',
    updateAndDeleteEvents: 'passed',
  }, null, 2));
} finally {
  try {
    await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [testEmails]);
    const ids = [...recordIds];
    if (ids.length || partyId) {
      await database.query(
        `DELETE FROM app_change_events
         WHERE record_id = ANY($1::uuid[])
            OR old_record->>'party_id' = $2
            OR new_record->>'party_id' = $2`,
        [ids, partyId],
      );
    }
  } finally {
    await database.end();
  }
}
