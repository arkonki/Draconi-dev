/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.TABLE_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.TABLE_TEST_DATABASE_URL;
const adminEmail = process.env.TABLE_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.TABLE_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set TABLE_TEST_PASSWORD and TABLE_TEST_DATABASE_URL for the disposable test data.');
}

const suffix = randomUUID().slice(0, 8);
const password = `Table-${suffix}-123!`;
const emails = { gm: `tb-gm-${suffix}@example.com`, player: `tb-player-${suffix}@example.com`, observer: `tb-observer-${suffix}@example.com`, outsider: `tb-outsider-${suffix}@example.com` };
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
const items = async (token, mapId) => (await ok(query(token, { table: 'table_items', action: 'select', filters: [{ column: 'map_id', operator: 'eq', value: mapId }] }), 200, 'list tokens')).data;
const revision = async (partyId) => Number((await database.query('SELECT revision FROM party_table_state WHERE party_id = $1', [partyId])).rows[0]?.revision ?? 0);

async function cleanup() {
  await database.query('DELETE FROM parties WHERE created_by IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM characters WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM monsters WHERE name = $1', [`TB Wolf ${suffix}`]);
  await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
}

await database.connect();
try {
  const admin = (await call('POST', '/auth/sign-in', { body: { email: adminEmail, password: adminPassword } })).payload.session?.access_token;
  assert.ok(admin, 'Administrator sign-in failed');
  const tokens = {};
  for (const [role, email] of Object.entries(emails)) {
    await ok(call('POST', '/auth/sign-up', { token: admin, body: { email, password, options: { data: { username: email.split('@')[0], role: role === 'gm' ? 'dm' : 'player' } } } }), 201, `create ${role}`);
    tokens[role] = (await call('POST', '/auth/sign-in', { body: { email, password } })).payload.session.access_token;
  }
  const userId = async (email) => (await database.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;

  const party = (await ok(query(tokens.gm, { table: 'parties', action: 'insert', payload: { name: `TB Party ${suffix}` } }), 200, 'party')).data[0];
  const hero = (await ok(query(tokens.player, { table: 'characters', action: 'insert', payload: { name: `TB Hero ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } }), 200, 'hero')).data[0];
  const stranger = (await ok(query(tokens.outsider, { table: 'characters', action: 'insert', payload: { name: `TB Stranger ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } }), 200, 'stranger')).data[0];
  await database.query('INSERT INTO party_members (party_id, character_id, user_id) VALUES ($1, $2, $3)', [party.id, hero.id, await userId(emails.player)]);
  await database.query("INSERT INTO campaign_memberships (party_id, user_id, role) VALUES ($1, $2, 'observer')", [party.id, await userId(emails.observer)]);
  const monster = (await ok(query(admin, { table: 'monsters', action: 'insert', payload: { name: `TB Wolf ${suffix}`, category: 'Test', stats: { HP: 12 }, attacks: [] } }), 200, 'monster')).data[0];
  const mapA = (await ok(query(tokens.gm, { table: 'party_maps', action: 'insert', payload: { party_id: party.id, name: 'Map A', image_url: '/a.png' } }), 200, 'map A')).data[0];
  const mapB = (await ok(query(tokens.gm, { table: 'party_maps', action: 'insert', payload: { party_id: party.id, name: 'Map B', image_url: '/b.png' } }), 200, 'map B')).data[0];
  const otherParty = (await ok(query(tokens.outsider, { table: 'parties', action: 'insert', payload: { name: `TB Other ${suffix}` } }), 200, 'other party')).data[0];
  const foreignMap = (await ok(query(tokens.outsider, { table: 'party_maps', action: 'insert', payload: { party_id: otherParty.id, name: 'Foreign', image_url: '/f.png' } }), 200, 'foreign map')).data[0];

  // --- Choosing the scene.
  await ok(rpc(tokens.player, 'set_table_scene', { p_party_id: party.id, p_map_id: mapA.id }), 403, 'player cannot change the scene');
  await ok(rpc(tokens.gm, 'set_table_scene', { p_party_id: party.id, p_map_id: foreignMap.id }), 404, 'a map from another campaign');
  const scene = (await ok(rpc(tokens.gm, 'set_table_scene', { p_party_id: party.id, p_map_id: mapA.id }), 200, 'scene')).data;
  assert.equal(scene.map_id, mapA.id);
  const state = (await ok(query(tokens.player, { table: 'party_table_state', action: 'select', filters: [{ column: 'party_id', operator: 'eq', value: party.id }] }), 200, 'players read the scene')).data;
  assert.equal(state[0].map_id, mapA.id);
  await ok(query(tokens.player, { table: 'party_table_state', action: 'update', filters: [{ column: 'party_id', operator: 'eq', value: party.id }], payload: { map_id: mapB.id } }), 403, 'players cannot write the scene');
  results.scene = 'passed';

  // --- Adding tokens: hidden until revealed.
  await ok(rpc(tokens.player, 'add_table_items', { p_map_id: mapA.id, p_items: [{ kind: 'prop', label: 'Cheat' }] }), 403, 'player cannot add tokens');
  await ok(rpc(tokens.gm, 'add_table_items', { p_map_id: mapA.id, p_items: [{ kind: 'character', character_id: stranger.id }] }), 404, 'a character from another campaign');
  const added = (await ok(rpc(tokens.gm, 'add_table_items', { p_map_id: mapA.id, p_items: [
    { kind: 'character', character_id: hero.id },
    { kind: 'monster', monster_id: monster.id },
    { kind: 'prop', label: 'Treasure chest', color: '#d97706', size: 0.5 },
  ] }), 200, 'add')).data.items;
  assert.equal(added.length, 3);
  assert.ok(added.every((item) => item.visible === false), 'new tokens start hidden');
  assert.equal(added.find((item) => item.kind === 'monster').label, `TB Wolf ${suffix}`);
  assert.equal((await ok(rpc(tokens.gm, 'add_table_items', { p_map_id: mapA.id, p_items: [{ kind: 'character', character_id: hero.id }] }), 200, 'adding twice')).data.items.length, 0, 'a character appears once per map');
  const [heroItem, wolfItem, chestItem] = ['character', 'monster', 'prop'].map((kind) => added.find((item) => item.kind === kind));
  results.addTokens = 'passed';

  // --- Hidden means hidden: nothing reaches a player until it is ticked.
  assert.equal((await items(tokens.gm, mapA.id)).length, 3, 'the GM sees every token');
  for (const who of ['player', 'observer', 'outsider']) assert.equal((await items(tokens[who], mapA.id)).length, 0, `${who} sees no hidden token`);
  await ok(query(tokens.gm, { table: 'table_items', action: 'update', filters: [{ column: 'id', operator: 'eq', value: heroItem.id }], payload: { visible: true } }), 200, 'reveal the hero');
  assert.deepEqual((await items(tokens.player, mapA.id)).map((item) => item.id), [heroItem.id]);
  assert.deepEqual((await items(tokens.observer, mapA.id)).map((item) => item.id), [heroItem.id]);
  assert.equal((await items(tokens.outsider, mapA.id)).length, 0, 'outsiders never see anything');
  await ok(query(tokens.player, { table: 'table_items', action: 'update', filters: [{ column: 'id', operator: 'eq', value: heroItem.id }], payload: { visible: false } }), 403, 'players cannot hide or edit tokens directly');
  await ok(query(tokens.player, { table: 'table_items', action: 'delete', filters: [{ column: 'id', operator: 'eq', value: heroItem.id }] }), 403, 'players cannot delete tokens');
  results.hiddenStaysHidden = 'passed';

  // --- Moving: players move only their own, revealed, unlocked token.
  const moved = (await ok(rpc(tokens.player, 'move_table_item', { p_item_id: heroItem.id, p_x: 0.3, p_y: 0.7 }), 200, 'player moves own token')).data;
  assert.deepEqual([Number(moved.x), Number(moved.y)], [0.3, 0.7]);
  const clamped = (await ok(rpc(tokens.player, 'move_table_item', { p_item_id: heroItem.id, p_x: 9, p_y: -4 }), 200, 'positions are clamped')).data;
  assert.deepEqual([Number(clamped.x), Number(clamped.y)], [1, 0]);
  await ok(rpc(tokens.player, 'move_table_item', { p_item_id: heroItem.id, p_x: 'left', p_y: 0 }), 400, 'bad coordinates');
  await ok(rpc(tokens.player, 'move_table_item', { p_item_id: wolfItem.id, p_x: 0.1, p_y: 0.1 }), 404, 'a hidden token looks like it does not exist');
  await ok(query(tokens.gm, { table: 'table_items', action: 'update', filters: [{ column: 'id', operator: 'eq', value: chestItem.id }], payload: { visible: true } }), 200, 'reveal the chest');
  await ok(rpc(tokens.player, 'move_table_item', { p_item_id: chestItem.id, p_x: 0.1, p_y: 0.1 }), 403, "not the player's token");
  await ok(rpc(tokens.observer, 'move_table_item', { p_item_id: heroItem.id, p_x: 0.1, p_y: 0.1 }), 403, 'observers cannot move');
  await ok(rpc(tokens.outsider, 'move_table_item', { p_item_id: heroItem.id, p_x: 0.1, p_y: 0.1 }), 403, 'outsiders cannot move');
  await ok(rpc(tokens.gm, 'move_table_item', { p_item_id: chestItem.id, p_x: 0.6, p_y: 0.4 }), 200, 'GM moves anything');
  await ok(query(tokens.gm, { table: 'table_items', action: 'update', filters: [{ column: 'id', operator: 'eq', value: heroItem.id }], payload: { locked: true } }), 200, 'lock the hero');
  await ok(rpc(tokens.player, 'move_table_item', { p_item_id: heroItem.id, p_x: 0.5, p_y: 0.5 }), 403, 'a locked token stays put');
  await ok(query(tokens.gm, { table: 'table_items', action: 'update', filters: [{ column: 'id', operator: 'eq', value: heroItem.id }], payload: { locked: false } }), 200, 'unlock');
  results.movingTokens = 'passed';

  // --- Positions are remembered per scene.
  await ok(rpc(tokens.gm, 'move_table_item', { p_item_id: chestItem.id, p_x: 0.25, p_y: 0.75 }), 200, 'place the chest');
  await ok(rpc(tokens.gm, 'set_table_scene', { p_party_id: party.id, p_map_id: mapB.id }), 200, 'switch to map B');
  assert.equal((await items(tokens.player, mapB.id)).length, 0, 'map B has no tokens yet');
  await ok(rpc(tokens.gm, 'add_table_items', { p_map_id: mapB.id, p_items: [{ kind: 'prop', label: 'Gate' }] }), 200, 'add to map B');
  await ok(rpc(tokens.gm, 'set_table_scene', { p_party_id: party.id, p_map_id: mapA.id }), 200, 'back to map A');
  const chestNow = (await items(tokens.gm, mapA.id)).find((item) => item.id === chestItem.id);
  assert.deepEqual([Number(chestNow.x), Number(chestNow.y)], [0.25, 0.75], 'the chest is where it was left');
  results.positionsRemembered = 'passed';

  // --- Hiding something players already saw raises the revision so their screens refresh.
  const before = await revision(party.id);
  await ok(rpc(tokens.gm, 'set_table_items_visibility', { p_map_id: mapA.id, p_visible: false, p_item_ids: [chestItem.id] }), 200, 'hide the chest');
  assert.ok(await revision(party.id) > before, 'hiding a revealed token bumps the table revision');
  assert.deepEqual((await items(tokens.player, mapA.id)).map((item) => item.id), [heroItem.id]);
  const afterHide = await revision(party.id);
  await ok(rpc(tokens.gm, 'set_table_items_visibility', { p_map_id: mapA.id, p_visible: true }), 200, 'reveal everything');
  assert.equal(await revision(party.id), afterHide, 'revealing does not need a revision bump');
  assert.equal((await items(tokens.player, mapA.id)).length, 3);
  await ok(rpc(tokens.player, 'set_table_items_visibility', { p_map_id: mapA.id, p_visible: false }), 403, 'players cannot hide tokens');
  results.revealAndHide = 'passed';

  // --- Pings: anyone who can write at the table, rate limited, and only the GM can move people's views.
  const pingCount = async () => Number((await database.query('SELECT count(*) AS n FROM table_pings WHERE party_id = $1', [party.id])).rows[0].n);
  const ping = (token, body) => rpc(token, 'ping_table', { p_map_id: mapA.id, ...body });
  await ok(ping(tokens.observer, { p_x: 0.5, p_y: 0.5 }), 403, 'observers cannot ping');
  await ok(ping(tokens.outsider, { p_x: 0.5, p_y: 0.5 }), 403, 'outsiders cannot ping');
  await ok(ping(tokens.player, { p_x: 'here', p_y: 0.5 }), 400, 'bad coordinates');
  await ok(rpc(tokens.player, 'ping_table', { p_map_id: randomUUID(), p_x: 0.5, p_y: 0.5 }), 404, 'unknown map');
  const playerPing = (await ok(ping(tokens.player, { p_x: 7, p_y: -1, p_focus: true }), 200, 'player ping')).data;
  assert.deepEqual([Number(playerPing.x), Number(playerPing.y), playerPing.focus], [1, 0, false], 'clamped, and a player cannot move everyone\'s view');
  assert.ok(playerPing.label.startsWith('tb-player-'), 'the ping says whose it is');
  await ok(ping(tokens.player, { p_x: 0.2, p_y: 0.2 }), 429, 'pinging again at once is slowed down');
  await sleep(700);
  await ok(ping(tokens.player, { p_x: 0.3, p_y: 0.3 }), 200, 'a moment later it works');
  assert.equal(await pingCount(), 1, 'a person has at most one ping on the table');
  const gmPing = (await ok(ping(tokens.gm, { p_x: 0.5, p_y: 0.5, p_focus: true }), 200, 'GM look-here ping')).data;
  assert.equal(gmPing.focus, true);
  assert.notEqual(gmPing.color, playerPing.color, 'different people get different colours');
  const seen = (await ok(query(tokens.player, { table: 'table_pings', action: 'select', filters: [{ column: 'party_id', operator: 'eq', value: party.id }] }), 200, 'players read pings')).data;
  assert.equal(seen.length, 2);
  assert.equal((await ok(query(tokens.outsider, { table: 'table_pings', action: 'select', filters: [{ column: 'party_id', operator: 'eq', value: party.id }] }), 200, 'outsiders read pings')).data.length, 0);
  await ok(query(tokens.player, { table: 'table_pings', action: 'insert', payload: { party_id: party.id, map_id: mapA.id, x: 0.5, y: 0.5 } }), 403, 'pings cannot be written directly');
  results.pings = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
