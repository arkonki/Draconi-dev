/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.ROLES_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.ROLES_TEST_DATABASE_URL;
const adminEmail = process.env.ROLES_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.ROLES_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set ROLES_TEST_PASSWORD and ROLES_TEST_DATABASE_URL for the disposable test data.');
}

const suffix = randomUUID().slice(0, 8);
const password = `Roles-${suffix}-123!`;
const emails = { alice: `rl-alice-${suffix}@example.com`, bob: `rl-bob-${suffix}@example.com`, legacy: `rl-legacy-${suffix}@example.com` };
const database = new Client({ connectionString: databaseUrl });
const results = {};

async function call(method, path, { token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  const sendsBody = body !== undefined && method !== 'GET';
  if (sendsBody) requestHeaders['content-type'] = 'application/json';
  const response = await fetch(`${apiBase}${path}`, { method, headers: requestHeaders, body: sendsBody ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function ok(promise, status, label) {
  const result = await promise;
  assert.equal(result.status, status, `${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.payload)}`);
  return result.payload;
}

const query = (token, body) => call('POST', '/data/query', { token, body });
const rpc = (token, name, args) => call('POST', `/rpc/${name}`, { token, body: args });
const roleIn = async (partyId, email) => (await database.query('SELECT role FROM campaign_memberships WHERE party_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)', [partyId, email])).rows[0]?.role ?? null;

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
  for (const [key, email] of Object.entries(emails)) {
    // "dm" is the legacy account-wide flag: it must behave exactly like an ordinary user.
    await ok(call('POST', '/auth/sign-up', { token: admin, body: { email, password, options: { data: { username: email.split('@')[0], role: key === 'legacy' ? 'dm' : 'player' } } } }), 201, `create ${key}`);
    tokens[key] = (await call('POST', '/auth/sign-in', { body: { email, password } })).payload.session.access_token;
  }
  assert.equal((await database.query('SELECT role FROM users WHERE email = $1', [emails.alice])).rows[0].role, 'player', 'Alice is an ordinary user');

  // --- An ordinary user creates a campaign and is its GM there.
  const alicePartyResult = await ok(rpc(tokens.alice, 'create_campaign', { p_name: `RL Alice ${suffix}`, p_character_ids: [] }), 200, 'a plain player creates a campaign');
  const aliceParty = alicePartyResult.data;
  assert.equal(await roleIn(aliceParty.id, emails.alice), 'owner', 'creating a campaign makes you its owner, the GM role');
  const listed = (await ok(query(tokens.alice, { table: 'parties', action: 'select', filters: [{ column: 'id', operator: 'eq', value: aliceParty.id }] }), 200, 'owner reads it')).data;
  assert.equal(listed[0].campaign_role, 'owner');
  assert.equal((await ok(query(tokens.bob, { table: 'parties', action: 'select', filters: [{ column: 'id', operator: 'eq', value: aliceParty.id }] }), 200, 'stranger')).data.length, 0, 'other people cannot see it');
  results.playerCreatesCampaign = 'passed';

  // --- The same account is a GM in one campaign and a player in another.
  const bobParty = (await ok(rpc(tokens.bob, 'create_campaign', { p_name: `RL Bob ${suffix}`, p_character_ids: [] }), 200, 'Bob creates his own')).data;
  const aliceHero = (await ok(query(tokens.alice, { table: 'characters', action: 'insert', payload: { name: `RL Hero ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } }), 200, 'Alice\'s hero')).data[0];
  await ok(rpc(tokens.alice, 'join_party_with_character', { p_invite_code: (await database.query('SELECT invite_code FROM parties WHERE id = $1', [bobParty.id])).rows[0].invite_code, p_character_id: aliceHero.id }), 200, 'Alice joins Bob\'s campaign');
  assert.equal(await roleIn(bobParty.id, emails.alice), 'player', 'a joined campaign makes her a player');
  assert.equal(await roleIn(aliceParty.id, emails.alice), 'owner', 'and she is still the GM of her own');
  await ok(query(tokens.alice, { table: 'parties', action: 'update', filters: [{ column: 'id', operator: 'eq', value: bobParty.id }], payload: { name: 'hijacked' } }), 403, 'being a player in Bob\'s campaign gives no GM powers there');
  await ok(rpc(tokens.alice, 'transfer_campaign_ownership', { p_party_id: bobParty.id, p_user_id: (await database.query('SELECT id FROM users WHERE email = $1', [emails.alice])).rows[0].id }), 403, 'nor can she take it over');
  results.differentRolesPerCampaign = 'passed';

  // --- Observer is just another role in a campaign.
  await database.query("INSERT INTO campaign_memberships (party_id, user_id, role) VALUES ($1, (SELECT id FROM users WHERE email = $2), 'observer')", [aliceParty.id, emails.bob]);
  const watched = (await ok(query(tokens.bob, { table: 'parties', action: 'select', filters: [{ column: 'id', operator: 'eq', value: aliceParty.id }] }), 200, 'observer reads')).data;
  assert.equal(watched[0].campaign_role, 'observer');
  await ok(query(tokens.bob, { table: 'parties', action: 'update', filters: [{ column: 'id', operator: 'eq', value: aliceParty.id }], payload: { name: 'nope' } }), 403, 'an observer cannot change it');
  results.observer = 'passed';

  // --- Following a game by invite link, without a character.
  const inviteOf = async (partyId) => (await database.query('SELECT invite_code FROM parties WHERE id = $1', [partyId])).rows[0].invite_code;
  const code = await inviteOf(aliceParty.id);
  const preview = (await ok(rpc(tokens.legacy, 'preview_party_invite', { p_invite_code: code }), 200, 'invite preview')).data;
  assert.equal(preview.name, `RL Alice ${suffix}`);
  assert.equal(preview.my_role, null, 'a stranger has no role yet');
  await ok(rpc(tokens.legacy, 'preview_party_invite', { p_invite_code: 'NOPE-NOPE' }), 404, 'unknown invite');
  await ok(rpc(tokens.legacy, 'join_party_as_observer', { p_invite_code: 'NOPE-NOPE' }), 404, 'unknown invite cannot be joined');
  assert.equal((await ok(rpc(tokens.legacy, 'join_party_as_observer', { p_invite_code: code }), 200, 'observer join')).data, aliceParty.id);
  assert.equal(await roleIn(aliceParty.id, emails.legacy), 'observer');
  await ok(rpc(tokens.legacy, 'join_party_as_observer', { p_invite_code: code }), 200, 'joining twice is harmless');
  assert.equal((await ok(query(tokens.legacy, { table: 'parties', action: 'select', filters: [{ column: 'id', operator: 'eq', value: aliceParty.id }] }), 200, 'new observer reads')).data.length, 1);
  await ok(query(tokens.legacy, { table: 'parties', action: 'update', filters: [{ column: 'id', operator: 'eq', value: aliceParty.id }], payload: { name: 'nope' } }), 403, 'new observer cannot write');
  await ok(rpc(tokens.alice, 'join_party_as_observer', { p_invite_code: code }), 200, 'the owner opening her own link');
  assert.equal(await roleIn(aliceParty.id, emails.alice), 'owner', 'watching never downgrades a role');
  await database.query('DELETE FROM campaign_memberships WHERE party_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)', [aliceParty.id, emails.legacy]);
  results.observerByInvite = 'passed';

  // --- The owner decides whether the link may be used for watching, and can remove people again.
  const partyWhere = (id) => [{ column: 'id', operator: 'eq', value: id }];
  await ok(query(tokens.bob, { table: 'parties', action: 'update', filters: partyWhere(aliceParty.id), payload: { allow_observers: false } }), 403, 'an observer cannot switch observers off');
  await ok(query(tokens.alice, { table: 'parties', action: 'update', filters: partyWhere(aliceParty.id), payload: { allow_observers: false } }), 200, 'the owner switches observers off');
  assert.equal((await ok(rpc(tokens.legacy, 'preview_party_invite', { p_invite_code: code }), 200, 'preview with observers off')).data.allow_observers, false);
  await ok(rpc(tokens.legacy, 'join_party_as_observer', { p_invite_code: code }), 403, 'nobody new can watch while it is off');
  await ok(query(tokens.alice, { table: 'parties', action: 'update', filters: partyWhere(aliceParty.id), payload: { allow_observers: true } }), 200, 'the owner switches it back on');
  await ok(rpc(tokens.legacy, 'join_party_as_observer', { p_invite_code: code }), 200, 'watching works again');
  const legacyId = (await database.query('SELECT id FROM users WHERE email = $1', [emails.legacy])).rows[0].id;
  const byUser = (partyId, userId) => [{ column: 'party_id', operator: 'eq', value: partyId }, { column: 'user_id', operator: 'eq', value: userId }];
  await ok(query(tokens.bob, { table: 'campaign_memberships', action: 'delete', filters: byUser(aliceParty.id, legacyId) }), 403, 'an observer cannot remove another observer');
  await ok(query(tokens.alice, { table: 'campaign_memberships', action: 'delete', filters: byUser(aliceParty.id, legacyId) }), 200, 'the owner removes an observer');
  assert.equal(await roleIn(aliceParty.id, emails.legacy), null, 'the removed observer has no role any more');

  // --- Fog of war lives on the map: only a GM can change it, and everyone in the campaign can read it.
  const map = (await ok(query(tokens.alice, { table: 'party_maps', action: 'insert', payload: { party_id: aliceParty.id, name: `RL Map ${suffix}`, image_url: 'https://example.com/map.png' } }), 200, 'GM adds a map')).data[0];
  assert.equal(map.fog_enabled, false, 'fog is off by default');
  const fog = [{ id: randomUUID(), shape: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.3 }];
  await ok(query(tokens.bob, { table: 'party_maps', action: 'update', filters: partyWhere(map.id), payload: { fog_enabled: true, fog_areas: fog } }), 403, 'an observer cannot change the fog');
  await ok(query(tokens.alice, { table: 'party_maps', action: 'update', filters: partyWhere(map.id), payload: { fog_enabled: true, fog_areas: fog } }), 200, 'the GM covers the map and reveals an area');
  const seen = (await ok(query(tokens.bob, { table: 'party_maps', action: 'select', filters: partyWhere(map.id) }), 200, 'an observer reads the fog')).data[0];
  assert.equal(seen.fog_enabled, true);
  assert.deepEqual(seen.fog_areas, fog);
  results.observerManagementAndFog = 'passed';

  // --- Solo play is available to anyone who runs a campaign, and to nobody who merely watches.
  const soloHero = (await ok(query(tokens.alice, { table: 'characters', action: 'insert', payload: { name: `RL Solo Hero ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } }), 200, 'solo hero')).data[0];
  const soloParty = (await ok(rpc(tokens.alice, 'create_campaign', { p_name: `RL Solo ${suffix}`, p_character_ids: [soloHero.id] }), 200, 'Alice starts a solo campaign')).data;
  const revisionOf = async (partyId, token) => (await ok(call('GET', `/v1/campaigns/${partyId}/solo/options`, { token }), 200, 'solo options')).data.campaignRevision;
  const enable = (partyId, token, revision, characterId) => call('POST', `/v1/campaigns/${partyId}/solo`, {
    token,
    headers: { 'if-match': `"${revision}"`, 'idempotency-key': `roles-${randomUUID()}` },
    body: { player_character_id: characterId, mode: 'custom', reason: 'Roles smoke test' },
  });
  await ok(enable(aliceParty.id, tokens.bob, await revisionOf(aliceParty.id, tokens.alice), soloHero.id), 403, 'an observer cannot switch solo play on');
  const enabled = await ok(enable(soloParty.id, tokens.alice, await revisionOf(soloParty.id, tokens.alice), soloHero.id), 200, 'an ordinary user switches solo play on in their own campaign');
  assert.ok(enabled.data, 'solo play is enabled');
  assert.equal((await ok(call('GET', `/v1/campaigns/${soloParty.id}/solo`, { token: tokens.alice }), 200, 'solo state')).data.solo.enabled, true);
  results.soloForOwners = 'passed';

  // --- A legacy "dm" account is no different from anyone else.
  const legacyParty = (await ok(rpc(tokens.legacy, 'create_campaign', { p_name: `RL Legacy ${suffix}`, p_character_ids: [] }), 200, 'legacy dm creates')).data;
  assert.equal(await roleIn(legacyParty.id, emails.legacy), 'owner');
  assert.equal((await ok(query(tokens.bob, { table: 'parties', action: 'select', filters: [{ column: 'id', operator: 'eq', value: legacyParty.id }] }), 200, 'dm campaigns are as private')).data.length, 0);
  results.legacyDm = 'passed';

  // --- The number of campaigns one person owns is limited, through both ways in. Administrators are not limited.
  const limit = 10;
  const owned = Number((await database.query('SELECT count(*) AS n FROM parties WHERE created_by = (SELECT id FROM users WHERE email = $1)', [emails.alice])).rows[0].n);
  for (let index = owned; index < limit; index += 1) {
    await ok(rpc(tokens.alice, 'create_campaign', { p_name: `RL Alice filler ${index} ${suffix}`, p_character_ids: [] }), 200, `Alice campaign ${index + 1}`);
  }
  const refused = await rpc(tokens.alice, 'create_campaign', { p_name: `RL Alice one too many ${suffix}`, p_character_ids: [] });
  assert.equal(refused.status, 409, `the eleventh campaign is refused (${JSON.stringify(refused.payload)})`);
  assert.equal(refused.payload.error?.code, 'CAMPAIGN_LIMIT');
  await ok(query(tokens.alice, { table: 'parties', action: 'insert', payload: { name: `RL direct ${suffix}` } }), 409, 'the direct data route is limited too');
  await ok(query(admin, { table: 'parties', action: 'insert', payload: { name: `RL admin ${suffix}` } }), 200, 'administrators are not limited');
  await database.query('DELETE FROM parties WHERE name = $1', [`RL admin ${suffix}`]);
  results.campaignLimit = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
