/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.COMBAT_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.COMBAT_TEST_DATABASE_URL;
const adminEmail = process.env.COMBAT_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.COMBAT_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set COMBAT_TEST_PASSWORD and COMBAT_TEST_DATABASE_URL for the disposable test data.');
}

const suffix = randomUUID().slice(0, 8);
const password = `Combat-${suffix}-123!`;
const emails = { gm: `cb-gm-${suffix}@example.com`, player: `cb-player-${suffix}@example.com`, observer: `cb-observer-${suffix}@example.com` };
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
const damage = (token, encounterId, entries) => rpc(token, 'apply_encounter_damage', { p_encounter_id: encounterId, p_attacker_name: 'Test Attacker', p_attack_name: 'Test Blow', p_entries: entries });
const combatant = async (id) => (await database.query('SELECT * FROM encounter_combatants WHERE id = $1', [id])).rows[0];
const character = async (id) => (await database.query('SELECT current_hp, death_rolls_passed, death_rolls_failed, is_rallied FROM characters WHERE id = $1', [id])).rows[0];

async function cleanup() {
  await database.query('DELETE FROM parties WHERE created_by IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM characters WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM monsters WHERE name = $1', [`CB Wolf ${suffix}`]);
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

  // --- A campaign with a GM, a player with a hero, and an observer.
  const party = (await ok(query(tokens.gm, { table: 'parties', action: 'insert', payload: { name: `CB Party ${suffix}` } }), 200, 'party')).data[0];
  const hero = (await ok(query(tokens.player, { table: 'characters', action: 'insert', payload: { name: `CB Hero ${suffix}`, max_hp: 10, current_hp: 10, max_wp: 8, current_wp: 8 } }), 200, 'hero')).data[0];
  await database.query('INSERT INTO party_members (party_id, character_id, user_id) VALUES ($1, $2, $3)', [party.id, hero.id, await userId(emails.player)]);
  await database.query("INSERT INTO campaign_memberships (party_id, user_id, role) VALUES ($1, $2, 'observer')", [party.id, await userId(emails.observer)]);
  const monster = (await ok(query(admin, { table: 'monsters', action: 'insert', payload: { name: `CB Wolf ${suffix}`, category: 'Test', stats: { HP: 12, ARMOR: 1 }, attacks: [] } }), 200, 'monster')).data[0];

  const encounter = (await ok(query(tokens.gm, { table: 'encounters', action: 'insert', payload: { party_id: party.id, name: `CB Fight ${suffix}`, status: 'active', current_round: 1, log: [] } }), 200, 'encounter')).data[0];
  const heroC = (await ok(rpc(tokens.gm, 'add_character_to_encounter', { p_encounter_id: encounter.id, p_character_id: hero.id }), 200, 'add hero')).data;
  const wolf1 = (await ok(rpc(tokens.gm, 'add_monster_to_encounter', { p_encounter_id: encounter.id, p_monster_id: monster.id, p_custom_name: 'Wolf (Act 1)' }), 200, 'add wolf 1')).data;
  const wolf2 = (await ok(rpc(tokens.gm, 'add_monster_to_encounter', { p_encounter_id: encounter.id, p_monster_id: monster.id, p_custom_name: 'Wolf (Act 2)' }), 200, 'add wolf 2')).data;
  const log = async () => (await database.query('SELECT log FROM encounters WHERE id = $1', [encounter.id])).rows[0].log;

  // --- Armor, parry and piercing.
  await ok(damage(tokens.observer, encounter.id, [{ combatant_id: wolf1.id, damage: 3, armor: 0 }]), 403, 'observer cannot apply damage');
  await ok(damage(tokens.gm, encounter.id, []), 400, 'no targets');
  await ok(damage(tokens.gm, encounter.id, [{ combatant_id: wolf1.id, damage: 3.5, armor: 0 }]), 400, 'fractional damage');
  await ok(damage(tokens.gm, encounter.id, [{ combatant_id: randomUUID(), damage: 3, armor: 0 }]), 404, 'unknown target');
  let outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: wolf1.id, damage: 5, armor: 2 }]), 200, 'armor')).data.outcomes[0];
  assert.deepEqual([outcome.damage, outcome.absorbed, outcome.hpBefore, outcome.hpAfter], [3, 2, 12, 9]);
  assert.equal((await combatant(wolf2.id)).current_hp, 9, 'both actions of one monster share their hit points');
  outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: wolf2.id, damage: 4, armor: 3, parried: true }]), 200, 'parry')).data.outcomes[0];
  assert.deepEqual([outcome.damage, outcome.hpAfter, outcome.parried], [0, 9, true]);
  outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: wolf1.id, damage: 4, armor: 3, ignore_armor: true }]), 200, 'piercing')).data.outcomes[0];
  assert.deepEqual([outcome.damage, outcome.absorbed, outcome.hpAfter], [4, 0, 5]);
  outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: wolf1.id, damage: -20, armor: 9 }]), 200, 'healing')).data.outcomes[0];
  assert.equal(outcome.hpAfter, 12, 'healing stops at the maximum');
  results.armorParryPiercing = 'passed';

  // --- A monster that drops is defeated once, and the log says so.
  outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: wolf2.id, damage: 99, armor: 1 }]), 200, 'defeat')).data.outcomes[0];
  assert.deepEqual([outcome.hpAfter, outcome.defeated, outcome.dying], [0, true, false]);
  assert.equal((await combatant(wolf1.id)).current_hp, 0);
  results.defeatedMonster = 'passed';

  // --- A player character: going down, being hit while down, instant death, and standing up again.
  outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: heroC.id, damage: 14, armor: 4 }]), 200, 'hero drops')).data.outcomes[0];
  assert.deepEqual([outcome.damage, outcome.hpAfter, outcome.dying, outcome.instantDeath], [10, 0, true, false]);
  assert.deepEqual(await character(hero.id), { current_hp: 0, death_rolls_passed: 0, death_rolls_failed: 0, is_rallied: false });
  outcome = (await ok(damage(tokens.player, encounter.id, [{ combatant_id: heroC.id, damage: 2, armor: 0 }]), 200, 'hit while down (the player may record it)')).data.outcomes[0];
  assert.equal(outcome.deathFailures, 1);
  assert.equal((await character(hero.id)).death_rolls_failed, 1, 'being hit while down is a failed death roll');
  await ok(damage(tokens.gm, encounter.id, [{ combatant_id: heroC.id, damage: 3, armor: 5 }]), 200, 'armor stops the whole hit');
  assert.equal((await character(hero.id)).death_rolls_failed, 1, 'a hit that does no damage is not a failure');
  outcome = (await ok(damage(tokens.gm, encounter.id, [{ combatant_id: heroC.id, damage: 30, armor: 0 }]), 200, 'overkill')).data.outcomes[0];
  assert.deepEqual([outcome.instantDeath, outcome.deathFailures], [true, 3]);
  await ok(damage(tokens.gm, encounter.id, [{ combatant_id: heroC.id, damage: -4, armor: 0 }]), 200, 'healed');
  assert.deepEqual(await character(hero.id), { current_hp: 4, death_rolls_passed: 0, death_rolls_failed: 0, is_rallied: false });
  results.playerDeathRolls = 'passed';

  // --- The log carries the detail, in order.
  const entries = (await log()).filter((entry) => entry.type === 'attack_resolve');
  assert.equal(entries.length, 10);
  assert.ok(entries.every((entry) => entry.attacker === 'Test Attacker' && entry.attackName === 'Test Blow' && entry.round === 1));
  assert.equal(entries[0].target, 'Wolf');
  assert.ok(entries.some((entry) => entry.parried && entry.damage === 0));
  results.logDetail = 'passed';

  // --- Next round: one call, GM only, resets turns and writes the marker.
  await database.query("UPDATE encounter_combatants SET has_acted = true, initiative_roll = 3, initiative_slots = ARRAY[3]::integer[], completed_initiative_slots = ARRAY[3]::integer[] WHERE encounter_id = $1", [encounter.id]);
  await ok(rpc(tokens.player, 'advance_encounter_round', { p_encounter_id: encounter.id }), 403, 'player cannot advance the round');
  const advanced = (await ok(rpc(tokens.gm, 'advance_encounter_round', { p_encounter_id: encounter.id }), 200, 'advance')).data;
  assert.equal(advanced.round, 2);
  const after = (await database.query('SELECT count(*) FILTER (WHERE has_acted)::int AS acted, count(*) FILTER (WHERE completed_initiative_slots <> $2::integer[])::int AS stale FROM encounter_combatants WHERE encounter_id = $1', [encounter.id, []])).rows[0];
  assert.deepEqual(after, { acted: 0, stale: 0 });
  assert.deepEqual((await log()).at(-1), { type: 'round_advanced', ts: (await log()).at(-1).ts, round: 2 });
  results.nextRound = 'passed';

  // --- Ending: conditions are cleared only when asked.
  await database.query(`UPDATE characters SET conditions = '{"dazed":true,"scared":true}'::jsonb WHERE id = $1`, [hero.id]);
  await ok(rpc(tokens.player, 'finish_encounter', { p_encounter_id: encounter.id }), 403, 'player cannot end the encounter');
  const finished = (await ok(rpc(tokens.gm, 'finish_encounter', { p_encounter_id: encounter.id, p_clear_conditions: false }), 200, 'finish')).data;
  assert.deepEqual(finished, { rounds: 2, clearedConditions: 0 });
  assert.equal((await database.query('SELECT status FROM encounters WHERE id = $1', [encounter.id])).rows[0].status, 'completed');
  assert.equal((await database.query('SELECT conditions->>\'dazed\' AS dazed FROM characters WHERE id = $1', [hero.id])).rows[0].dazed, 'true');
  assert.equal((await log()).at(-1).type, 'encounter_ended');
  await ok(rpc(tokens.gm, 'finish_encounter', { p_encounter_id: encounter.id, p_clear_conditions: true }), 200, 'finish again, clearing conditions');
  assert.equal((await database.query('SELECT conditions->>\'dazed\' AS dazed FROM characters WHERE id = $1', [hero.id])).rows[0].dazed, 'false');
  results.finishEncounter = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
  await database.end();
}
