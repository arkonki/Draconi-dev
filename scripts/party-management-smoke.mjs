/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.PARTY_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.PARTY_TEST_DATABASE_URL;
const adminEmail = process.env.PARTY_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.PARTY_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set PARTY_TEST_PASSWORD and PARTY_TEST_DATABASE_URL for the disposable test data.');
}

const suffix = randomUUID().slice(0, 8);
const password = `Party-${suffix}-123!`;
const emails = { owner: `pm-owner-${suffix}@example.com`, player: `pm-player-${suffix}@example.com`, observer: `pm-observer-${suffix}@example.com` };
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

const query = (token, body) => call('POST', '/data/query', { token, body });
const rpc = (token, name, args) => call('POST', `/rpc/${name}`, { token, body: args });

async function cleanup() {
  await database.query('DELETE FROM parties WHERE created_by IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM characters WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
}

await database.connect();
try {
  const admin = (await call('POST', '/auth/sign-in', { body: { email: adminEmail, password: adminPassword } })).payload.session?.access_token;
  assert.ok(admin, 'Administrator sign-in failed');

  const tokens = {};
  for (const [role, email] of Object.entries(emails)) {
    await ok(call('POST', '/auth/sign-up', { token: admin, body: { email, password, options: { data: { username: email.split('@')[0], role: role === 'owner' ? 'dm' : 'player' } } } }), 201, `create ${role}`);
    tokens[role] = (await call('POST', '/auth/sign-in', { body: { email, password } })).payload.session.access_token;
  }

  const party = (await ok(query(tokens.owner, { table: 'parties', action: 'insert', payload: { name: `PM Party ${suffix}` } }), 200, 'create party')).data[0];
  const character = async (token, name) => (await ok(query(token, { table: 'characters', action: 'insert', payload: { name, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } }), 200, `character ${name}`)).data[0];

  // --- Editing: the owner can, nobody else can.
  await ok(query(tokens.owner, { table: 'parties', action: 'update', filters: [{ column: 'id', operator: 'eq', value: party.id }], payload: { name: `PM Renamed ${suffix}`, description: 'A test campaign' } }), 200, 'owner edits');
  const edited = (await database.query('SELECT name, description FROM parties WHERE id = $1', [party.id])).rows[0];
  assert.deepEqual(edited, { name: `PM Renamed ${suffix}`, description: 'A test campaign' });
  const hijack = await query(tokens.player, { table: 'parties', action: 'update', filters: [{ column: 'id', operator: 'eq', value: party.id }], payload: { name: 'hijacked' } });
  assert.ok(hijack.status === 403 || hijack.payload.data?.length === 0, `a non-member must not rename the campaign (${hijack.status})`);
  assert.equal((await database.query('SELECT name FROM parties WHERE id = $1', [party.id])).rows[0].name, `PM Renamed ${suffix}`);
  results.editing = 'passed';

  // --- Invite links: the old code stops working once replaced.
  const oldCode = (await database.query('SELECT invite_code FROM parties WHERE id = $1', [party.id])).rows[0].invite_code;
  const newCode = 'ABCDEF0123';
  await ok(query(tokens.owner, { table: 'parties', action: 'update', filters: [{ column: 'id', operator: 'eq', value: party.id }], payload: { invite_code: newCode } }), 200, 'owner replaces invite code');
  const playerHero = await character(tokens.player, `PM Hero ${suffix}`);
  await ok(rpc(tokens.player, 'join_party_with_character', { p_invite_code: oldCode, p_character_id: playerHero.id }), 404, 'old invite code');
  await ok(rpc(tokens.player, 'join_party_with_character', { p_invite_code: newCode, p_character_id: playerHero.id }), 200, 'new invite code');
  const joined = await database.query('SELECT role FROM campaign_memberships WHERE party_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)', [party.id, emails.player]);
  assert.equal(joined.rows[0]?.role, 'player');
  results.inviteLinks = 'passed';

  // --- Leaving.
  await ok(rpc(tokens.owner, 'leave_campaign', { p_party_id: party.id }), 409, 'owner cannot leave');
  await ok(rpc(tokens.observer, 'leave_campaign', { p_party_id: party.id }), 404, 'non-member cannot leave');
  await ok(rpc(tokens.player, 'leave_campaign', { p_party_id: 'not-a-uuid' }), 400, 'bad id');
  await ok(rpc(tokens.player, 'leave_campaign', { p_party_id: party.id }), 200, 'player leaves');
  assert.equal((await database.query('SELECT party_id FROM characters WHERE id = $1', [playerHero.id])).rows[0].party_id, null, 'character released');
  assert.equal((await database.query('SELECT count(*)::int AS n FROM party_members WHERE party_id = $1', [party.id])).rows[0].n, 0);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM campaign_memberships WHERE party_id = $1 AND role <> $2', [party.id, 'owner'])).rows[0].n, 0);
  await ok(rpc(tokens.player, 'leave_campaign', { p_party_id: party.id }), 404, 'leaving twice');
  results.leaving = 'passed';

  // --- A GM or observer without characters can leave too.
  const observerId = (await database.query('SELECT id FROM users WHERE email = $1', [emails.observer])).rows[0].id;
  await database.query("INSERT INTO campaign_memberships (party_id, user_id, role) VALUES ($1, $2, 'gm')", [party.id, observerId]);
  await ok(rpc(tokens.observer, 'leave_campaign', { p_party_id: party.id }), 200, 'gm leaves');
  assert.equal((await database.query('SELECT count(*)::int AS n FROM campaign_memberships WHERE party_id = $1 AND user_id = $2', [party.id, observerId])).rows[0].n, 0);
  results.gmLeaving = 'passed';

  // --- Creating a campaign is all-or-nothing.
  const ownerHero = await character(tokens.owner, `PM Owner Hero ${suffix}`);
  const countParties = async (name) => (await database.query('SELECT count(*)::int AS n FROM parties WHERE name = $1', [name])).rows[0].n;
  await ok(rpc(tokens.player, 'create_campaign', { p_name: `PM Player Party ${suffix}`, p_character_ids: [] }), 403, 'players cannot create');
  await ok(rpc(tokens.owner, 'create_campaign', { p_name: '   ', p_character_ids: [] }), 400, 'blank name');
  await ok(rpc(tokens.owner, 'create_campaign', { p_name: `PM Atomic ${suffix}`, p_character_ids: [ownerHero.id, randomUUID()] }), 404, 'unknown character');
  await ok(rpc(tokens.owner, 'create_campaign', { p_name: `PM Atomic ${suffix}`, p_character_ids: [playerHero.id] }), 403, 'someone else\'s character');
  assert.equal(await countParties(`PM Atomic ${suffix}`), 0, 'a failed creation leaves no campaign behind');
  const second = (await ok(rpc(tokens.owner, 'create_campaign', { p_name: `PM Second ${suffix}`, p_description: 'created together', p_character_ids: [ownerHero.id] }), 200, 'create with a character')).data;
  assert.equal((await database.query('SELECT party_id FROM characters WHERE id = $1', [ownerHero.id])).rows[0].party_id, second.id);
  assert.equal((await database.query('SELECT role FROM campaign_memberships WHERE party_id = $1 AND user_id = $2', [second.id, second.created_by])).rows[0].role, 'owner');
  await ok(rpc(tokens.owner, 'create_campaign', { p_name: `PM Third ${suffix}`, p_character_ids: [ownerHero.id] }), 409, 'character already in a party');
  assert.equal(await countParties(`PM Third ${suffix}`), 0);
  results.atomicCreate = 'passed';

  // --- Removing a member: the character's owner or a GM, nobody else.
  const memberHero = await character(tokens.player, `PM Member ${suffix}`);
  await database.query('INSERT INTO party_members (party_id, character_id, user_id) VALUES ($1, $2, (SELECT user_id FROM characters WHERE id = $2))', [second.id, memberHero.id]);
  await ok(rpc(tokens.observer, 'remove_party_member', { p_party_id: second.id, p_character_id: memberHero.id }), 403, 'outsider removes');
  await ok(rpc(tokens.owner, 'remove_party_member', { p_party_id: second.id, p_character_id: randomUUID() }), 404, 'not a member');
  await ok(rpc(tokens.owner, 'remove_party_member', { p_party_id: second.id, p_character_id: memberHero.id }), 200, 'gm removes');
  assert.equal((await database.query('SELECT party_id FROM characters WHERE id = $1', [memberHero.id])).rows[0].party_id, null);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM campaign_memberships WHERE party_id = $1 AND role = $2', [second.id, 'player'])).rows[0].n, 0, 'player with no characters left drops off');
  await database.query('INSERT INTO party_members (party_id, character_id, user_id) VALUES ($1, $2, (SELECT user_id FROM characters WHERE id = $2))', [second.id, memberHero.id]);
  await ok(rpc(tokens.player, 'remove_party_member', { p_party_id: second.id, p_character_id: memberHero.id }), 200, 'owner removes own character');
  results.removingMembers = 'passed';

  // --- Handing the campaign over.
  await database.query('INSERT INTO party_members (party_id, character_id, user_id) VALUES ($1, $2, (SELECT user_id FROM characters WHERE id = $2))', [second.id, memberHero.id]);
  const playerId = (await database.query('SELECT id FROM users WHERE email = $1', [emails.player])).rows[0].id;
  const ownerId = second.created_by;
  await ok(rpc(tokens.player, 'transfer_campaign_ownership', { p_party_id: second.id, p_user_id: playerId }), 403, 'non-owner hands over');
  await ok(rpc(tokens.owner, 'transfer_campaign_ownership', { p_party_id: second.id, p_user_id: observerId }), 409, 'target is not a member');
  await ok(rpc(tokens.owner, 'transfer_campaign_ownership', { p_party_id: second.id, p_user_id: ownerId }), 409, 'already the owner');
  await ok(rpc(tokens.owner, 'transfer_campaign_ownership', { p_party_id: second.id, p_user_id: playerId }), 200, 'owner hands over');
  const roles = Object.fromEntries((await database.query('SELECT user_id, role FROM campaign_memberships WHERE party_id = $1', [second.id])).rows.map((row) => [row.user_id, row.role]));
  assert.deepEqual([roles[playerId], roles[ownerId]], ['owner', 'gm']);
  assert.equal((await database.query('SELECT created_by FROM parties WHERE id = $1', [second.id])).rows[0].created_by, playerId);
  await ok(rpc(tokens.owner, 'leave_campaign', { p_party_id: second.id }), 200, 'previous owner can now leave');
  await ok(rpc(tokens.player, 'leave_campaign', { p_party_id: second.id }), 409, 'new owner cannot leave');
  results.ownershipTransfer = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
