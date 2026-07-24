/* global fetch */
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.WORKFLOW_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.WORKFLOW_TEST_DATABASE_URL;
const adminEmail = process.env.WORKFLOW_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.WORKFLOW_TEST_PASSWORD;

if (!adminPassword || !databaseUrl) {
  throw new Error('Set WORKFLOW_TEST_PASSWORD and WORKFLOW_TEST_DATABASE_URL for the disposable workflow rehearsal.');
}

const suffix = randomUUID().slice(0, 8);
const testPassword = `Workflow-${suffix}-123!`;
const accounts = {
  owner: { email: `workflow-owner-${suffix}@example.com`, username: `workflow-owner-${suffix}`, role: 'dm' },
  member: { email: `workflow-member-${suffix}@example.com`, username: `workflow-member-${suffix}`, role: 'player' },
};
const testEmails = Object.values(accounts).map((account) => account.email);
const database = new Client({ connectionString: databaseUrl });
const cleanupRecords = [];
const storagePath = `workflow/${suffix}.txt`;
let adminToken;

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

async function rpc(token, name, args, status = 200) {
  return expectStatus(await postJson(`/rpc/${name}`, args, token), status).data;
}

async function signIn(account) {
  const payload = expectStatus(await postJson('/auth/sign-in', {
    email: account.email,
    password: account.password || testPassword,
  }), 200);
  return { ...account, id: payload.user.id, token: payload.session.access_token };
}

async function insert(token, table, payload, track = false) {
  const [row] = await dataQuery(token, { table, action: 'insert', payload });
  assert.ok(row?.id, `${table} insert did not return an id`);
  if (track) cleanupRecords.push({ table, id: row.id });
  return row;
}

async function update(token, table, id, payload) {
  const rows = await dataQuery(token, {
    table,
    action: 'update',
    filters: [{ operator: 'eq', column: 'id', value: id }],
    payload,
  });
  assert.equal(rows.length, 1, `${table} update did not affect exactly one row`);
  return rows[0];
}

async function remove(token, table, id) {
  const rows = await dataQuery(token, {
    table,
    action: 'delete',
    filters: [{ operator: 'eq', column: 'id', value: id }],
  });
  assert.equal(rows.length, 1, `${table} delete did not affect exactly one row`);
  return rows[0];
}

await database.connect();
try {
  const admin = await signIn({ email: adminEmail, password: adminPassword });
  adminToken = admin.token;
  const databaseAdmin = await database.query('SELECT id FROM users WHERE lower(email) = lower($1)', [adminEmail]);
  assert.equal(databaseAdmin.rows[0]?.id, admin.id, 'The API and workflow database URL do not target the same database');

  for (const account of Object.values(accounts)) {
    expectStatus(await postJson('/auth/sign-up', {
      email: account.email,
      password: testPassword,
      options: { data: { username: account.username, role: account.role } },
    }, admin.token), 201);
  }
  const owner = await signIn(accounts.owner);
  const member = await signIn(accounts.member);

  await dataQuery(member.token, {
    table: 'game_items', action: 'insert', payload: { name: `Forbidden Item ${suffix}` },
  }, 403);

  const school = await insert(admin.token, 'magic_schools', {
    name: `Workflow School ${suffix}`, description: 'Disposable migration rehearsal school',
  }, true);
  const item = await insert(admin.token, 'game_items', {
    name: `Workflow Item ${suffix}`, category: 'Workflow', cost: '5 gold', weight: 1.5,
    description: 'Disposable admin editor item', features: ['portable'], quantity: 1,
  }, true);
  const ability = await insert(admin.token, 'heroic_abilities', {
    name: `Workflow Ability ${suffix}`, description: 'Disposable ability', willpower_cost: 2,
    requirement: JSON.stringify({ Agility: 12 }), profession: 'Workflow', kin: 'Workflow',
  }, true);
  const kin = await insert(admin.token, 'kin', {
    name: `Workflow Kin ${suffix}`, description: 'Disposable kin', heroic_ability: ability.name,
    abilities: [{ description: 'Workflow trait', willpower_points: 1 }], kin_abilities: [],
    key_attribute: 'STR', typical_profession: 'Workflow profession',
  }, true);
  const profession = await insert(admin.token, 'professions', {
    name: `Workflow Profession ${suffix}`, description: 'Disposable profession', key_attribute: 'STR',
    skills: ['Workflow Skill'], heroic_ability: ability.name, magic_school_id: school.id,
    is_magic: true, associated_skill: 'Workflow Skill', starting_equipment: [], equipment_description: [],
  }, true);
  const skill = await insert(admin.token, 'game_skills', {
    name: `Workflow Skill ${suffix}`, description: 'Disposable skill', base_attribute: 'STR',
    attribute: 'STR', category: 'Workflow',
  }, true);
  const spell = await insert(admin.token, 'game_spells', {
    name: `Workflow Spell ${suffix}`, rank: 1, school: school.name, school_id: school.id,
    requirement: 'Gesture', casting_time: 'Action', range: '10m', duration: 'Instant',
    description: 'Disposable spell', willpower_cost: 2, dice: '1d6', power_level: '1',
  }, true);
  const monster = await insert(admin.token, 'monsters', {
    created_by: admin.id, name: `Workflow Monster ${suffix}`, description: 'Disposable monster',
    category: 'Workflow', stats: { HP: 12, WP: 3, ARMOR: 1 }, attacks: [], effectsSummary: 'None',
  }, true);
  const bio = await insert(admin.token, 'bio_data', {
    name: `Workflow Bio ${suffix}`, appearance: ['Green cloak'], mementos: ['Old coin'], flaws: ['Impatient'],
  }, true);
  const compendium = await insert(admin.token, 'compendium', {
    title: `Workflow Compendium ${suffix}`, content: '# Workflow\nDisposable content.',
    category: 'Workflow', tags: ['workflow'], image_urls: [], is_public: true,
  }, true);
  const template = await insert(admin.token, 'compendium_templates', {
    name: `Workflow Template ${suffix}`, description: 'Disposable template',
    content: '# Template', category: 'Workflow', is_public: true,
  }, true);

  const editorUpdates = [
    ['magic_schools', school.id, { description: 'Updated school' }, 'description', 'Updated school'],
    ['game_items', item.id, { description: 'Updated item' }, 'description', 'Updated item'],
    ['heroic_abilities', ability.id, { willpower_cost: 3 }, 'willpower_cost', 3],
    ['kin', kin.id, { description: 'Updated kin' }, 'description', 'Updated kin'],
    ['professions', profession.id, { description: 'Updated profession' }, 'description', 'Updated profession'],
    ['game_skills', skill.id, { description: 'Updated skill' }, 'description', 'Updated skill'],
    ['game_spells', spell.id, { description: 'Updated spell' }, 'description', 'Updated spell'],
    ['monsters', monster.id, { effectsSummary: 'Updated summary' }, 'effectsSummary', 'Updated summary'],
    ['bio_data', bio.id, { flaws: ['Updated flaw'] }, 'flaws', ['Updated flaw']],
    ['compendium', compendium.id, { content: '# Updated' }, 'content', '# Updated'],
    ['compendium_templates', template.id, { content: '# Updated template' }, 'content', '# Updated template'],
  ];
  for (const [table, id, payload, field, expected] of editorUpdates) {
    const updated = await update(admin.token, table, id, payload);
    assert.deepEqual(updated[field], expected, `${table} update was not persisted`);
  }
  const publicEntries = await dataQuery(member.token, {
    table: 'compendium', filters: [{ operator: 'eq', column: 'id', value: compendium.id }],
  });
  assert.equal(publicEntries.length, 1, 'Public compendium content is not visible to players');

  const ownerCharacter = await insert(owner.token, 'characters', {
    name: `Workflow Owner Hero ${suffix}`, max_hp: 14, current_hp: 14, max_wp: 8, current_wp: 8,
  });
  const memberCharacter = await insert(member.token, 'characters', {
    name: `Workflow Member Hero ${suffix}`, max_hp: 12, current_hp: 12, max_wp: 6, current_wp: 6,
  });
  const party = await insert(owner.token, 'parties', {
    name: `Workflow Party ${suffix}`, description: 'Disposable workflow party',
  });
  await insert(owner.token, 'party_members', { party_id: party.id, character_id: ownerCharacter.id });
  const [linkedOwnerCharacter] = await dataQuery(owner.token, {
    table: 'characters', filters: [{ operator: 'eq', column: 'id', value: ownerCharacter.id }],
  });
  assert.equal(linkedOwnerCharacter.party_id, party.id, 'Direct party creation did not synchronize character.party_id');

  await dataQuery(owner.token, {
    table: 'party_members', action: 'insert', payload: { party_id: party.id, character_id: memberCharacter.id },
  }, 403);
  await dataQuery(member.token, {
    table: 'party_members', action: 'insert', payload: { party_id: party.id, character_id: memberCharacter.id },
  }, 403);
  assert.equal(await rpc(member.token, 'join_party_with_character', {
    invite_code: party.invite_code, character_id: memberCharacter.id,
  }), party.id);

  const ownerMessage = await insert(owner.token, 'messages', { party_id: party.id, content: 'Owner workflow message' });
  const memberMessage = await insert(member.token, 'messages', { party_id: party.id, content: 'Member workflow message' });
  await dataQuery(member.token, {
    table: 'messages', action: 'delete', filters: [{ operator: 'eq', column: 'id', value: ownerMessage.id }],
  }, 403);
  await remove(owner.token, 'messages', memberMessage.id);
  await remove(owner.token, 'messages', ownerMessage.id);

  const inventory = await insert(owner.token, 'party_inventory', {
    party_id: party.id, name: `Workflow Rations ${suffix}`, quantity: 3,
    description: 'Disposable supplies', category: 'Supplies',
  });
  assert.equal((await update(member.token, 'party_inventory', inventory.id, { quantity: 2 })).quantity, 2);
  const destroyedLog = await insert(owner.token, 'party_inventory_log', {
    party_id: party.id, item_name: inventory.name, quantity: 1,
    from_type: 'party', from_id: party.id, to_type: 'void', to_id: 'destroyed',
  });
  const merchantLog = await insert(member.token, 'party_inventory_log', {
    party_id: party.id, item_name: `Workflow Purchase ${suffix}`, quantity: 1,
    from_type: 'character', from_id: 'merchant', to_type: 'party', to_id: party.id,
  });
  assert.equal(destroyedLog.to_id, 'destroyed');
  assert.equal(merchantLog.from_id, 'merchant');

  const task = await insert(member.token, 'party_tasks', {
    party_id: party.id, title: `Workflow Task ${suffix}`, description: 'Complete the rehearsal',
  });
  assert.equal((await update(owner.token, 'party_tasks', task.id, {
    status: 'completed', completed_at: new Date().toISOString(),
  })).status, 'completed');
  const tracker = await insert(owner.token, 'time_trackers', {
    party_id: party.id, current_day: 1, current_shift: 1, grid_state: { weather: 'clear' },
  });
  assert.equal((await update(member.token, 'time_trackers', tracker.id, { current_shift: 2 })).current_shift, 2);
  const randomTable = await insert(owner.token, 'random_tables', {
    party_id: party.id, name: `Workflow Rumors ${suffix}`, category: 'Rumors', die_type: 'd6',
    rows: [{ min: 1, max: 6, result: 'A local workflow rumor' }],
  });
  assert.equal((await update(member.token, 'random_tables', randomTable.id, { description: 'Updated table' })).description, 'Updated table');
  const story = await insert(member.token, 'story_ideas', {
    party_id: party.id, prompt: 'Create a workflow hook', response: 'A missing migration.', context: { tone: 'test' },
  });
  assert.equal(story.user_id, member.id);
  const note = await insert(member.token, 'notes', {
    party_id: party.id, title: `Workflow Note ${suffix}`, content: 'Disposable note', category: 'party',
  });
  assert.equal((await update(member.token, 'notes', note.id, { content: 'Updated note' })).content, 'Updated note');

  const upload = await jsonRequest(`/storage/images/${storagePath}`, {
    token: owner.token, method: 'PUT', headers: { 'content-type': 'text/plain' }, body: `workflow-${suffix}`,
  });
  expectStatus(upload, 201);
  const listed = expectStatus(await jsonRequest('/storage/images/workflow?limit=100', { token: owner.token }), 200).data;
  assert.ok(listed.some((entry) => entry.name === `${suffix}.txt`), 'Uploaded workflow object was not listed');
  const publicObject = await fetch(`${apiBase}/storage/public/images/${storagePath}`);
  assert.equal(publicObject.status, 200);
  assert.equal(await publicObject.text(), `workflow-${suffix}`);

  const map = await insert(owner.token, 'party_maps', {
    party_id: party.id, name: `Workflow Map ${suffix}`,
    image_url: `${apiBase}/storage/public/images/${storagePath}`, is_active: true,
    grid_type: 'square', grid_enabled: true, grid_size: 50,
  });
  const pin = await insert(member.token, 'party_map_pins', {
    map_id: map.id, party_id: party.id, x: 25, y: 30, label: 'Workflow pin', type: 'location',
  });
  assert.equal((await update(member.token, 'party_map_pins', pin.id, { label: 'Updated pin' })).label, 'Updated pin');
  const drawing = await insert(member.token, 'party_map_drawings', {
    map_id: map.id, party_id: party.id, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    color: '#ff0000', thickness: 3,
  });

  const encounter = await insert(owner.token, 'encounters', {
    party_id: party.id, name: `Workflow Encounter ${suffix}`, description: 'Disposable encounter',
    status: 'active',
  });
  await rpc(member.token, 'add_character_to_encounter', {
    p_encounter_id: encounter.id, p_character_id: memberCharacter.id, p_initiative_roll: 7,
  }, 403);
  const characterCombatant = await rpc(owner.token, 'add_character_to_encounter', {
    p_encounter_id: encounter.id, p_character_id: memberCharacter.id, p_initiative_roll: 7,
  });
  await update(owner.token, 'encounter_combatants', characterCombatant.id, {
    current_hp: 9, max_hp: 13, current_wp: 5, max_wp: 7,
  });
  const [characterAfterCombatUpdate] = await dataQuery(member.token, {
    table: 'characters', filters: [{ operator: 'eq', column: 'id', value: memberCharacter.id }],
  });
  assert.deepEqual(
    {
      current_hp: characterAfterCombatUpdate.current_hp,
      max_hp: characterAfterCombatUpdate.max_hp,
      current_wp: characterAfterCombatUpdate.current_wp,
      max_wp: characterAfterCombatUpdate.max_wp,
    },
    { current_hp: 9, max_hp: 13, current_wp: 5, max_wp: 7 },
    'Active encounter HP/WP did not synchronize to the character',
  );
  await update(member.token, 'characters', memberCharacter.id, {
    current_hp: 8, max_hp: 14, current_wp: 4, max_wp: 8,
  });
  const [combatantAfterCharacterUpdate] = await dataQuery(owner.token, {
    table: 'encounter_combatants',
    filters: [{ operator: 'eq', column: 'id', value: characterCombatant.id }],
  });
  assert.deepEqual(
    {
      current_hp: combatantAfterCharacterUpdate.current_hp,
      max_hp: combatantAfterCharacterUpdate.max_hp,
      current_wp: combatantAfterCharacterUpdate.current_wp,
      max_wp: combatantAfterCharacterUpdate.max_wp,
    },
    { current_hp: 8, max_hp: 14, current_wp: 4, max_wp: 8 },
    'Character HP/WP did not synchronize to the active encounter',
  );
  const monsterCombatant = await rpc(owner.token, 'add_monster_to_encounter', {
    p_encounter_id: encounter.id, p_monster_id: monster.id, p_custom_name: `Encounter Monster ${suffix}`,
    p_initiative_roll: 4,
  });
  const rolled = await rpc(owner.token, 'roll_initiative_for_combatants', {
    p_encounter_id: encounter.id, p_combatant_ids: [characterCombatant.id, monsterCombatant.id],
  });
  assert.equal(rolled.length, 2);
  await rpc(owner.token, 'swap_initiative', { id1: characterCombatant.id, id2: monsterCombatant.id });
  await rpc(member.token, 'append_to_log', {
    p_encounter_id: encounter.id, p_log_entry: { type: 'workflow', message: 'Member log entry' },
  });
  await rpc(owner.token, 'advance_encounter_round', { p_encounter_id: encounter.id });
  const duplicate = await rpc(owner.token, 'duplicate_encounter_with_combatants', {
    p_encounter_id: encounter.id, p_new_name: `Workflow Encounter Copy ${suffix}`,
  });
  const copiedCombatants = await dataQuery(owner.token, {
    table: 'encounter_combatants', filters: [{ operator: 'eq', column: 'encounter_id', value: duplicate.id }],
  });
  assert.equal(copiedCombatants.length, 2);

  await remove(member.token, 'party_map_drawings', drawing.id);
  await remove(member.token, 'party_map_pins', pin.id);
  await remove(owner.token, 'party_maps', map.id);
  await remove(owner.token, 'encounters', duplicate.id);
  await remove(owner.token, 'encounters', encounter.id);
  await remove(member.token, 'notes', note.id);
  await remove(member.token, 'story_ideas', story.id);
  await remove(owner.token, 'random_tables', randomTable.id);
  await remove(owner.token, 'time_trackers', tracker.id);
  await remove(owner.token, 'party_tasks', task.id);
  await remove(owner.token, 'party_inventory_log', merchantLog.id);
  await remove(owner.token, 'party_inventory_log', destroyedLog.id);
  await remove(owner.token, 'party_inventory', inventory.id);
  await remove(owner.token, 'parties', party.id);
  const [unlinkedMemberCharacter] = await dataQuery(member.token, {
    table: 'characters', filters: [{ operator: 'eq', column: 'id', value: memberCharacter.id }],
  });
  assert.equal(unlinkedMemberCharacter.party_id, null, 'Deleting a party did not clear character.party_id');

  expectStatus(await jsonRequest('/storage/images', {
    token: owner.token, method: 'DELETE', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: [storagePath] }),
  }), 200);

  for (const record of [...cleanupRecords].reverse()) {
    await remove(admin.token, record.table, record.id);
  }

  console.log(JSON.stringify({
    adminEditors: 'passed',
    adminCompendium: 'passed',
    partyMembership: 'passed',
    chatAuthorization: 'passed',
    inventoryAndTimelineTools: 'passed',
    notesAndStoryTools: 'passed',
    mapsAndStorage: 'passed',
    encounterTools: 'passed',
    encounterVitalsSync: 'passed',
    disposableCleanup: 'passed',
  }, null, 2));
} finally {
  try {
    if (adminToken) {
      await jsonRequest('/storage/images', {
        token: adminToken, method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paths: [storagePath] }),
      }).catch(() => undefined);
    }
    await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [testEmails]);
    for (const { table, id } of [...cleanupRecords].reverse()) {
      await database.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
    }
  } finally {
    await database.end();
  }
}
