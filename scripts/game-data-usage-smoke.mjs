/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.GAMEDATA_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.GAMEDATA_TEST_DATABASE_URL;
const adminEmail = process.env.GAMEDATA_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.GAMEDATA_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set GAMEDATA_TEST_PASSWORD and GAMEDATA_TEST_DATABASE_URL for the disposable test data.');
}

const suffix = randomUUID().slice(0, 8);
const password = `GameData-${suffix}-123!`;
const playerEmail = `gd-player-${suffix}@example.com`;
const database = new Client({ connectionString: databaseUrl });
const created = []; // [table, id] for cleanup, newest last
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

const insert = async (token, table, row) => {
  const payload = await ok(call('POST', '/data/query', { token, body: { table, action: 'insert', payload: row } }), 200, `insert ${table}`);
  created.push([table, payload.data[0].id]);
  return payload.data[0];
};

const usage = (token, category, id) => call('GET', `/admin/game-data/${category}/${id}/usage`, { token });
const byKey = (payload) => Object.fromEntries(payload.usage.map((entry) => [entry.key, entry]));

async function cleanup() {
  for (const [table, id] of [...created].reverse()) {
    await database.query(`DELETE FROM "${table}" WHERE id = $1`, [id]).catch(() => undefined);
  }
  await database.query('DELETE FROM parties WHERE created_by IN (SELECT id FROM users WHERE email = $1)', [playerEmail]);
  await database.query('DELETE FROM users WHERE email = $1', [playerEmail]);
}

await database.connect();
try {
  const adminSession = await call('POST', '/auth/sign-in', { body: { email: adminEmail, password: adminPassword } });
  const admin = adminSession.payload.session?.access_token;
  assert.ok(admin, 'Administrator sign-in failed');

  const signUp = await ok(call('POST', '/auth/sign-up', { token: admin, body: { email: playerEmail, password, options: { data: { username: `gd-player-${suffix}`, role: 'player' } } } }), 201, 'create player');
  const player = (await call('POST', '/auth/sign-in', { body: { email: playerEmail, password } })).payload.session.access_token;
  assert.ok(signUp.user.id && player);

  // --- Authorisation and input validation.
  const probe = await insert(admin, 'game_items', { name: `GD Probe ${suffix}`, category: 'TOOLS' });
  await ok(call('GET', `/admin/game-data/items/${probe.id}/usage`, {}), 401, 'anonymous');
  await ok(usage(player, 'items', probe.id), 403, 'player');
  await ok(usage(admin, 'nonsense', probe.id), 400, 'unknown category');
  await ok(usage(admin, 'items', 'not-a-uuid'), 400, 'bad id');
  await ok(usage(admin, 'items', randomUUID()), 404, 'unknown entry');
  results.authorisationAndValidation = 'passed';

  // --- Items: carried by a character (twice, still one character), in a party stash; unused control.
  const item = await insert(admin, 'game_items', { name: `GD Sword ${suffix}`, category: 'MELEE WEAPONS' });
  const hero = await insert(player, 'characters', {
    name: `GD Hero ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8,
    equipment: { inventory: [{ id: randomUUID(), name: item.name.toUpperCase(), quantity: 1 }], equipped: { weapons: [{ name: item.name }] }, money: { gold: 0, silver: 0, copper: 0 } },
    kin: `GD Kin ${suffix}`, profession: `GD Profession ${suffix}`,
  });
  const party = await insert(player, 'parties', { name: `GD Party ${suffix}`, description: 'disposable' });
  await insert(player, 'party_inventory', { party_id: party.id, name: item.name, quantity: 2 });
  const itemUsage = await ok(usage(admin, 'items', item.id), 200, 'item usage');
  assert.equal(itemUsage.name, item.name);
  assert.equal(itemUsage.total, 2, 'one character plus one stash');
  assert.equal(byKey(itemUsage).characters.count, 1, 'a character holding it twice counts once, case-insensitively');
  assert.deepEqual(byKey(itemUsage).characters.examples, [hero.name]);
  assert.equal(byKey(itemUsage).stashes.count, 1);
  const unused = await ok(usage(admin, 'items', probe.id), 200, 'unused item');
  assert.deepEqual([unused.total, unused.usage], [0, []]);
  results.items = 'passed';

  // --- Spells: known and prepared.
  const spell = await insert(admin, 'game_spells', { name: `GD Spell ${suffix}`, rank: 1, school: 'Elementalism', description: 'x' });
  await database.query('UPDATE characters SET spells = $2::jsonb, prepared_spells = $3::text[] WHERE id = $1', [hero.id, JSON.stringify({ school: { name: 'Elementalism', spells: [spell.name] }, general: [] }), [spell.name]]);
  const spellUsage = await ok(usage(admin, 'spells', spell.id), 200, 'spell usage');
  assert.equal(byKey(spellUsage).characters.count, 1);
  results.spells = 'passed';

  // --- Heroic abilities: character, kin that grants it.
  const ability = await insert(admin, 'heroic_abilities', { name: `GD Ability ${suffix}`, description: 'x' });
  await database.query('UPDATE characters SET heroic_ability = $2::text[] WHERE id = $1', [hero.id, [ability.name]]);
  const kin = await insert(admin, 'kin', { name: `GD Kin ${suffix}`, description: 'x', heroic_ability: ability.name });
  const abilityUsage = await ok(usage(admin, 'abilities', ability.id), 200, 'ability usage');
  assert.equal(byKey(abilityUsage).characters.count, 1);
  assert.equal(byKey(abilityUsage).kin.count, 1);
  results.abilities = 'passed';

  // --- Skills: rated and trained on a character; listed by a profession.
  const skill = await insert(admin, 'game_skills', { name: `GD Skill ${suffix}`, description: 'x', base_attribute: 'STR' });
  await database.query('UPDATE characters SET skill_levels = $2::jsonb, trained_skills = $3::text[] WHERE id = $1', [hero.id, JSON.stringify({ [skill.name]: 10 }), [skill.name]]);
  const profession = await insert(admin, 'professions', { name: `GD Profession ${suffix}`, description: 'x', skills: [skill.name] });
  const skillUsage = await ok(usage(admin, 'skills', skill.id), 200, 'skill usage');
  assert.equal(byKey(skillUsage).characters.count, 1);
  assert.equal(byKey(skillUsage).professions.count, 1);
  results.skills = 'passed';

  // --- Kin and professions: referenced by name on characters.
  const kinUsage = await ok(usage(admin, 'kin', kin.id), 200, 'kin usage');
  assert.equal(byKey(kinUsage).characters.count, 1);
  const professionUsage = await ok(usage(admin, 'profession', profession.id), 200, 'profession usage');
  assert.equal(byKey(professionUsage).characters.count, 1);
  results.kinAndProfessions = 'passed';

  // --- Monsters: used in an encounter.
  const monster = await insert(admin, 'monsters', { name: `GD Monster ${suffix}`, category: 'Test', stats: { HP: 5 }, attacks: [] });
  assert.equal((await ok(usage(admin, 'monsters', monster.id), 200, 'unused monster')).total, 0);
  const encounter = await insert(player, 'encounters', { party_id: party.id, name: `GD Encounter ${suffix}` });
  await insert(player, 'encounter_combatants', { encounter_id: encounter.id, monster_id: monster.id, display_name: 'Goblin', is_player_character: false, current_hp: 5, max_hp: 5 });
  const monsterUsage = await ok(usage(admin, 'monsters', monster.id), 200, 'monster usage');
  assert.equal(byKey(monsterUsage).encounters.count, 1);
  assert.deepEqual(byKey(monsterUsage).encounters.examples, [encounter.name]);
  results.monsters = 'passed';

  // --- Bio data has no references.
  const bio = await insert(admin, 'bio_data', { name: `GD Bio ${suffix}`, appearance: [], mementos: [], flaws: [] });
  assert.deepEqual((await ok(usage(admin, 'bio', bio.id), 200, 'bio usage')).usage, []);
  results.bio = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
