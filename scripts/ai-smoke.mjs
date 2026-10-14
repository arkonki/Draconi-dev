/* global fetch */
// End-to-end check of the built-in AI against the local stack, with a stand-in for OpenRouter so no real key or
// money is involved. The API must be started with AI_KEY_ENCRYPTION_SECRET set and OPENROUTER_BASE_URL pointing at
// this script's stand-in (http://host.docker.internal:4010 when the API runs in Docker).
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import pg from 'pg';

const { Client } = pg;
const apiBase = (process.env.AI_TEST_API || 'http://localhost:8080/api').replace(/\/$/, '');
const databaseUrl = process.env.AI_TEST_DATABASE_URL;
const adminEmail = process.env.AI_TEST_EMAIL || 'admin@example.com';
const adminPassword = process.env.AI_TEST_PASSWORD;
const mockPort = Number(process.env.AI_TEST_MOCK_PORT || 4010);
if (!adminPassword || !databaseUrl) throw new Error('Set AI_TEST_PASSWORD and AI_TEST_DATABASE_URL for the disposable test data.');

const VALID_KEY = 'sk-or-test-valid-key-0001';
const suffix = randomUUID().slice(0, 8);
const password = `Ai-${suffix}-123!`;
const emails = { alice: `ai-alice-${suffix}@example.com`, bob: `ai-bob-${suffix}@example.com` };
const database = new Client({ connectionString: databaseUrl });
const results = {};
const seenRequests = [];

// --- A stand-in for OpenRouter ---
const mock = http.createServer((request, response) => {
  const authorized = request.headers.authorization === `Bearer ${VALID_KEY}`;
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    response.setHeader('content-type', 'application/json');
    if (!authorized) { response.statusCode = 401; response.end(JSON.stringify({ error: { message: 'bad key' } })); return; }
    if (request.url.endsWith('/auth/key')) { response.end(JSON.stringify({ data: { label: 'test' } })); return; }
    const parsed = JSON.parse(body || '{}');
    seenRequests.push(parsed);
    const isSummary = String(parsed.messages?.[0]?.content ?? '').includes('You keep the running record');
    const isNarrator = String(parsed.messages?.[0]?.content ?? '').includes('narrator of a solo game');
    const isRecap = String(parsed.messages?.[0]?.content ?? '').includes('write the recap');
    const isMission = String(parsed.messages?.[0]?.content ?? '').includes('design missions for solo play');
    const text = isSummary
      ? 'Mara crossed the old bridge and now stands at the shrine gate.'
      : isMission
        ? '```json\n{"title":"The Drowned Lighthouse","objective":"Relight the lighthouse before the fleet returns.","opening":{"title":"The harbour wall","description":"Fog rolls in."},"foreseen":[{"title":"The salt marsh","description":"A causeway."}],"unknown_waypoints":1,"threat":{"description":"The tide rises","recurring":false,"trigger_effect":"The causeway floods."}}\n```'
      : isRecap
        ? 'The party fought bravely and won the day.'
        : isNarrator
        ? 'You step onto the bridge. It groans.\n1. Cross quickly\n2. Test the planks\nACTIONS: [{"type":"check","name":"STR","modifier":"bane","label":"Cross the bridge"},{"type":"npc","name":"Bridge Troll","template":"boss","roles":["melee","ranged","wizard"],"notes":"Mossy and huge"},{"type":"check","name":"Flying","label":"Fly away"},{"type":"damage","amount":9},{"type":"scene","location":"The old bridge","description":"A rope bridge over a gorge.","situation":"Wind is rising.","threads":["The troll"]},{"type":"fortune","question":"Is the bridge safe?"}]'
        : 'You step onto the bridge. It groans.\n1. Cross quickly\n2. Test the planks';
    const usage = { prompt_tokens: 321, completion_tokens: 45, prompt_tokens_details: { cached_tokens: 128 }, cost: 0.0002 };
    if (parsed.stream) {
      response.setHeader('content-type', 'text/event-stream');
      response.write(': OPENROUTER PROCESSING\n\n');
      for (const piece of text.match(/[\s\S]{1,12}/g)) response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
      response.end('data: [DONE]\n\n');
      return;
    }
    response.end(JSON.stringify({ choices: [{ message: { content: text } }], usage }));
  });
});

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

async function cleanup() {
  await database.query('DELETE FROM parties WHERE created_by IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM characters WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [Object.values(emails)]);
  await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
}

await new Promise((resolve) => mock.listen(mockPort, '0.0.0.0', resolve));
await database.connect();
try {
  const admin = (await call('POST', '/auth/sign-in', { body: { email: adminEmail, password: adminPassword } })).payload.session?.access_token;
  assert.ok(admin, 'Administrator sign-in failed');
  const tokens = {};
  for (const [key, email] of Object.entries(emails)) {
    await ok(call('POST', '/auth/sign-up', { token: admin, body: { email, password, options: { data: { username: email.split('@')[0], role: 'player' } } } }), 201, `create ${key}`);
    tokens[key] = (await call('POST', '/auth/sign-in', { body: { email, password } })).payload.session.access_token;
  }

  // --- Saving a key: validated, encrypted, never returned ---
  const fresh = await ok(call('GET', '/account/ai', { token: tokens.alice }), 200, 'fresh settings');
  assert.equal(fresh.storageAvailable, true, 'the server needs AI_KEY_ENCRYPTION_SECRET for this test');
  assert.equal(fresh.hasKey, false);
  await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { apiKey: 'sk-or-not-accepted-1234' } }), 400, 'a rejected key is not saved');
  await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { apiKey: 'tiny' } }), 400, 'an obviously wrong key');
  const saved = await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { apiKey: VALID_KEY } }), 200, 'a valid key');
  assert.equal(saved.hasKey, true);
  assert.equal(saved.keyHint, '…0001');
  assert.ok(!JSON.stringify(saved).includes(VALID_KEY), 'the key is never sent back');
  const stored = (await database.query('SELECT api_key_encrypted, key_hint FROM user_ai_settings WHERE user_id = (SELECT id FROM users WHERE email = $1)', [emails.alice])).rows[0];
  assert.ok(stored.api_key_encrypted.startsWith('v1:') && !stored.api_key_encrypted.includes(VALID_KEY), 'it is stored encrypted');
  await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { model: 'bad model!' } }), 400, 'a bad model id');
  assert.equal((await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { model: 'openai/gpt-4o-mini' } }), 200, 'a model')).model, 'openai/gpt-4o-mini');
  assert.equal((await ok(call('GET', '/account/ai', { token: tokens.bob }), 200, 'Bob sees his own')).hasKey, false, 'keys are per person');
  results.keyStorage = 'passed';

  // --- The Story Helper ---
  await ok(call('POST', '/ai/story', { token: tokens.bob, body: { prompt: 'A tavern' } }), 409, 'no key, no story');
  const story = await ok(call('POST', '/ai/story', { token: tokens.alice, body: { prompt: 'Describe a tavern.' } }), 200, 'a story');
  assert.match(story.text, /bridge/);
  assert.equal(seenRequests.at(-1).model, 'openai/gpt-4o-mini', 'the chosen model is used');
  assert.equal(seenRequests.at(-1).messages.at(-1).content, 'Describe a tavern.');
  await ok(call('POST', '/ai/story', { token: tokens.alice, body: { prompt: '   ' } }), 400, 'an empty prompt');
  const counted = (await ok(call('GET', '/account/ai', { token: tokens.alice }), 200, 'usage')).usageThisMonth;
  assert.deepEqual({ calls: counted.calls, promptTokens: counted.promptTokens, completionTokens: counted.completionTokens }, { calls: 1, promptTokens: 321, completionTokens: 45 });
  assert.equal(counted.costUsd, 0.0002);
  results.story = 'passed';

  // --- The Solo narrator ---
  const hero = (await ok(query(tokens.alice, { table: 'characters', action: 'insert', payload: { name: `AI Hero ${suffix}`, max_hp: 10, current_hp: 6, max_wp: 8, current_wp: 8, attributes: { STR: 13, CON: 12, AGL: 14, INT: 10, WIL: 11, CHA: 9 } } }), 200, 'hero')).data[0];
  const party = (await ok(rpc(tokens.alice, 'create_campaign', { p_name: `AI Solo ${suffix}`, p_character_ids: [hero.id] }), 200, 'campaign')).data;
  const narrate = (token, body) => call('POST', '/ai/solo-narrator', { token, body });
  const soloSnapshotEarly = async () => (await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'solo state')).data;
  const conversation = (token, partyId = party.id) => call('GET', `/ai/solo-narrator?partyId=${partyId}`, { token });
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'I look around' }), 409, 'solo must be switched on first');
  const options = (await ok(call('GET', `/v1/campaigns/${party.id}/solo/options`, { token: tokens.alice }), 200, 'solo options')).data;
  await ok(call('POST', `/v1/campaigns/${party.id}/solo`, {
    token: tokens.alice,
    headers: { 'if-match': `"${options.campaignRevision}"`, 'idempotency-key': `ai-${randomUUID()}` },
    body: { player_character_id: hero.id, mode: 'custom', reason: 'AI smoke test' },
  }), 200, 'switch solo on');

  const turn = await ok(narrate(tokens.alice, { partyId: party.id, message: 'I step onto the bridge' }), 200, 'a narrator turn');
  assert.match(turn.text, /bridge/);
  assert.ok(!turn.text.includes('ACTIONS'), 'the machine line is not part of the story');
  const sent = seenRequests.at(-1).messages;
  assert.equal(sent[0].role, 'system');
  assert.ok(sent[0].content.includes('Never roll dice'), 'the fixed instructions come first');
  assert.ok(!sent[0].content.includes('HERO:'), 'and hold nothing that changes from turn to turn, so providers can cache them');
  assert.ok(sent.at(-1).content.includes('CURRENT GAME STATE') && sent.at(-1).content.includes(`HERO: AI Hero ${suffix}. HP 6/10`), 'the game state comes last, with what the player said');
  assert.deepEqual(sent.slice(1).map((entry) => entry.role), ['user'], 'the first turn has no history');
  assert.ok(JSON.stringify(sent).length < 12_000, 'the request stays small');
  // Actions: only what the game can honour, with names fixed up.
  const kinds = turn.actions.map((action) => `${action.type}:${action.name ?? ''}`);
  assert.deepEqual(kinds, ['check:STR', 'npc:Bridge Troll', 'scene:'], `unsupported actions were dropped and at most three kept (got ${kinds.join(', ')})`);
  assert.equal(turn.actions[0].modifier, 'bane');
  assert.deepEqual(turn.actions[1], { type: 'npc', name: 'Bridge Troll', template: 'boss', roles: ['melee', 'ranged'], notes: 'Mossy and huge', label: 'Face Bridge Troll' });
  assert.deepEqual(turn.actions[2], { type: 'scene', location: 'The old bridge', description: 'A rope bridge over a gorge.', situation: 'Wind is rising.', threads: ['The troll'], label: 'Update the scene' });

  // The story is remembered on the server, and the next turn is given it.
  const remembered = (await ok(conversation(tokens.alice), 200, 'conversation')).turns;
  assert.deepEqual(remembered.map((entry) => entry.role), ['user', 'assistant']);
  assert.equal(remembered[1].actions.length, 3, 'the proposed actions are kept with the reply');
  assert.equal(remembered[1].tokens, 366, 'and what the reply used');
  assert.equal(remembered[1].costUsd, 0.0002);
  assert.equal(remembered[0].tokens, null, 'the player\'s own message has no usage');
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'I cross' }), 200, 'a second turn');
  assert.deepEqual(seenRequests.at(-1).messages.slice(1).map((entry) => entry.role), ['user', 'assistant', 'user'], 'the earlier exchange is sent as history');

  // The narrator is told what the hero carries right now, and a change of gear reaches the very next turn.
  const setGear = (equipped) => database.query('UPDATE characters SET equipment = $1::jsonb WHERE id = $2', [JSON.stringify({ equipped, inventory: [] }), hero.id]);
  const lastContext = () => seenRequests.at(-1).messages.at(-1).content;
  await narrate(tokens.alice, { partyId: party.id, message: 'I draw my weapon' });
  assert.ok(lastContext().includes('Weapons in hand: none. The hero is unarmed.') && lastContext().includes('Armor worn: none.'), 'an empty-handed hero is described as unarmed');
  await setGear({ armor: 'Chainmail', weapons: [{ name: 'Battle axe', grip: '2H', range: '2', damage: '2D8', durability: 9, features: ['SLASHING'] }] });
  await narrate(tokens.alice, { partyId: party.id, message: 'I swing' });
  assert.ok(lastContext().includes('Weapons in hand: Battle axe (damage 2D8, range 2, two hands, slashing, durability 9).'), 'the weapon in hand is listed with its numbers');
  assert.match(lastContext(), /Armor worn: Chainmail/, 'and so is the armor');
  const withGear = (await soloSnapshotEarly()).playerCharacter;
  assert.equal(withGear.weapons[0].name, 'Battle axe', 'the solo state carries the weapons for the sidebar');
  assert.equal(withGear.bodyArmor.name, 'Chainmail');
  await setGear({ weapons: [] });
  results.narratorGear = 'passed';

  // Streaming: the answer arrives in pieces and ends with the finished turn.
  const streamResponse = await fetch(`${apiBase}/ai/solo-narrator/stream`, { method: 'POST', headers: { authorization: `Bearer ${tokens.alice}`, 'content-type': 'application/json' }, body: JSON.stringify({ partyId: party.id, message: 'I look down' }) });
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get('content-type'), /text\/event-stream/);
  const raw = await streamResponse.text();
  const deltas = [...raw.matchAll(/event: delta\ndata: (.*)\n/g)].map((match) => JSON.parse(match[1]).text);
  assert.ok(deltas.length > 3, `several pieces arrive (got ${deltas.length})`);
  const done = JSON.parse(raw.match(/event: done\ndata: (.*)\n/)[1]);
  assert.match(done.text, /bridge/);
  assert.equal(done.actions.length, 3);
  assert.equal(done.usage.promptTokens, 321, 'usage comes from the final chunk');
  assert.equal((await ok(conversation(tokens.alice), 200, 'after streaming')).turns.length, 10, 'a streamed turn is stored too');
  const failedStream = await fetch(`${apiBase}/ai/solo-narrator/stream`, { method: 'POST', headers: { authorization: `Bearer ${tokens.bob}`, 'content-type': 'application/json' }, body: JSON.stringify({ partyId: party.id, message: 'hi' }) });
  assert.equal(failedStream.status, 403, 'a problem before the first word is an ordinary error');

  // Long conversations are folded into the story so far.
  for (let index = 0; index < 6; index += 1) await ok(narrate(tokens.alice, { partyId: party.id, message: `Step ${index}` }), 200, `turn ${index}`);
  let memory;
  for (let attempt = 0; attempt < 20 && !memory; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const summary = (await ok(conversation(tokens.alice), 200, 'memory')).summary;
    if (summary) memory = summary;
  }
  assert.match(memory, /shrine gate/, 'older turns were folded into a summary');
  assert.equal((await database.query('SELECT count(*)::int AS n FROM solo_narrator_turns WHERE party_id = $1 AND summarized', [party.id])).rows[0].n > 0, true);
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'And then?' }), 200, 'a turn after summarising');
  assert.ok(seenRequests.at(-1).messages.some((message) => message.role === 'system' && message.content.includes('THE STORY SO FAR') && message.content.includes('shrine gate')), 'the summary is given to the narrator');
  assert.ok((await database.query("SELECT count(*)::int AS n FROM ai_usage WHERE purpose = 'solo-summary'")).rows[0].n >= 1, 'the summary call is counted as usage');

  // --- One story, whoever plays: an assistant over MCP and the built-in narrator share the campaign record ---
  const mcpHeaders = (revision) => ({ 'if-match': `"${revision}"`, 'idempotency-key': `mcp-${randomUUID()}`, 'x-helper-client': 'dragonbane-mcp' });
  const revisionNow = async () => (await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'solo state')).data.campaignRevision;
  const startedSession = (await ok(call('POST', `/v1/campaigns/${party.id}/sessions/start`, { token: tokens.alice, headers: mcpHeaders(await revisionNow()), body: { title: 'MCP session', reason: 'smoke' } }), 200, 'an assistant starts a session')).data;
  const sessionId = startedSession.state_excerpt.session.id;
  await ok(call('POST', `/v1/campaigns/${party.id}/sessions/${sessionId}/checkpoints`, {
    token: tokens.alice,
    headers: mcpHeaders(await revisionNow()),
    body: { summary: 'MCP checkpoint: the hero reached the shrine gate at dusk.', scene: { location: 'The shrine gate', description: 'Moss-covered stone.' }, unresolved_threads: ['Who lit the beacon?'], reason: 'smoke' },
  }), 200, 'an assistant saves a checkpoint');
  await ok(call('POST', `/v1/campaigns/${party.id}/events`, { token: tokens.alice, headers: mcpHeaders(await revisionNow()), body: { type: 'story.beat', visibility: 'players', payload: { summary: 'The gate swung open by itself.' }, reason: 'smoke' } }), 200, 'an assistant records a story beat');

  const revisionBefore = await revisionNow();
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'I enter the gate' }), 200, 'the narrator continues the assistant story');
  const system = seenRequests.at(-1).messages.at(-1).content;
  assert.ok(system.includes('LATEST CHECKPOINT') && system.includes('MCP checkpoint: the hero reached the shrine gate at dusk.'), 'the narrator reads the assistant\'s checkpoint');
  assert.ok(system.includes('SCENE: The shrine gate'), 'and the scene it saved');
  assert.ok(system.includes('OPEN THREADS: Who lit the beacon?'), 'and the open threads');
  assert.ok(system.includes('story.beat (from an AI assistant)') && system.includes('The gate swung open by itself.'), 'and the events it recorded');
  const seen = (await ok(conversation(tokens.alice), 200, 'campaign context')).campaign;
  assert.match(seen.checkpoint.summary, /shrine gate at dusk/);
  assert.deepEqual(seen.openThreads, ['Who lit the beacon?']);

  // And back: what the narrator told is visible to the assistant, without touching the game state.
  assert.equal(await revisionNow(), revisionBefore, 'narration does not change the campaign revision');
  const soloNow = (await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'solo state with story')).data;
  assert.ok(soloNow.story && soloNow.story.recentExchanges.length > 0, 'the solo state carries the story');
  assert.equal(soloNow.story.recentExchanges.at(-1).role, 'narrator');
  const eventTypes = soloNow.journal.recentEvents.map((event) => `${event.type}:${event.sourceType}`);
  assert.ok(eventTypes.includes('story.beat:chatgpt') && eventTypes.includes('narration.recorded:user'), `the journal lists every source (got ${eventTypes.join(', ')})`);
  const narrationEvent = soloNow.journal.recentEvents.find((event) => event.type === 'narration.recorded');
  assert.equal(narrationEvent.payload.source, 'narrator');
  assert.equal(narrationEvent.previousRevision, narrationEvent.resultingRevision);
  const resume = (await ok(call('GET', `/v1/campaigns/${party.id}/resume-state?detail=focused`, { token: tokens.alice }), 200, 'resume state')).data;
  assert.ok(resume.story && resume.story.recentExchanges.length > 0, 'the resume state carries the story too');
  results.sharedStory = 'passed';

  // --- Ending a story: the mission's leftovers are cleaned up for every client, and a success leads to advancement ---
  const writeHeaders = (revision) => ({ 'if-match': `"${revision}"`, 'idempotency-key': `end-${randomUUID()}` });
  const soloSnapshot = async () => (await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'solo state')).data;
  const startMission = async (title) => ok(call('POST', `/v1/campaigns/${party.id}/solo/missions`, {
    token: tokens.alice,
    headers: writeHeaders((await soloSnapshot()).campaignRevision),
    body: { title, objective: 'Find the lantern', waypoint_count: 3, unknown_waypoint_count: 0, foreseen_waypoints: [], opening_waypoint: { title: 'The gate', description: 'A rusted gate.' }, threat: { description: 'The water rises', recurring: false, trigger_effect: {} }, reason: 'smoke' },
  }), 200, `start ${title}`);
  const leaveBehind = async () => {
    const state = await soloSnapshot();
    const npc = await ok(call('POST', `/v1/campaigns/${party.id}/solo/npcs`, { token: tokens.alice, headers: writeHeaders(state.campaignRevision), body: { name: 'Gate Warden', template: 'minion', roles: ['melee'], mission_id: state.activeMission.id, waypoint_id: state.currentWaypoint.id, reason: 'smoke' } }), 200, 'a creature in the mission');
    assert.ok(npc.data.summary);
    await database.query("INSERT INTO solo_dangers (campaign_id, mission_id, waypoint_id, description) VALUES ($1, $2, $3, 'Loose rubble')", [party.id, state.activeMission.id, state.currentWaypoint.id]);
    return state.activeMission.id;
  };
  const statusOf = async (table, missionId) => (await database.query(`SELECT status FROM ${table} WHERE mission_id = $1`, [missionId])).rows.map((row) => row.status);

  await database.query("UPDATE parties SET game_time = '{\"elapsedSeconds\": 5000}'::jsonb WHERE id = $1", [party.id]);
  await startMission('The first story');
  assert.equal((await soloSnapshot()).gameTime.storyStartElapsedSeconds, 5000, 'a story remembers when its own clock began');
  const failedMission = await leaveBehind();
  await database.query("UPDATE parties SET current_scene = '{\"location\": \"The old bridge\"}'::jsonb WHERE id = $1", [party.id]);
  const failed = (await ok(call('POST', `/v1/campaigns/${party.id}/solo/missions/${failedMission}/complete`, { token: tokens.alice, headers: writeHeaders((await soloSnapshot()).campaignRevision), body: { outcome: 'failure', summary: 'The hero fled.', rewards: {}, reason: 'smoke' } }), 200, 'fail the mission')).data;
  assert.deepEqual(failed.state_excerpt.cleanup, { settledDangers: 1, retiredNpcs: 1 }, 'leftovers are counted');
  assert.deepEqual(await statusOf('solo_dangers', failedMission), ['avoided'], 'a danger left behind is avoided after a failure');
  assert.deepEqual(await statusOf('solo_npcs', failedMission), ['retired'], 'the mission\'s creature leaves play');
  const afterFailure = await soloSnapshot();
  assert.equal(afterFailure.journal.currentScene.location, '', 'the scene of a finished story is cleared');
  await database.query("UPDATE parties SET current_scene = '{\"location\": \"Left over\"}'::jsonb WHERE id = $1", [party.id]);
  assert.equal((await soloSnapshot()).journal.currentScene.location, '', 'a scene that nothing has set since the story ended is not shown');
  assert.ok(!afterFailure.pendingAdvancement, 'a failed story earns no advancement');
  assert.equal(afterFailure.activeDangers.length, 0);
  assert.ok(afterFailure.npcs.some((npc) => npc.status === 'retired'), 'the retired creature is still on record');
  const concluded = afterFailure.journal.recentEvents.find((event) => event.type === 'solo.mission_completed');
  assert.deepEqual(concluded.payload.cleanup, { settledDangers: 1, retiredNpcs: 1 }, 'and the event log says what was cleaned');

  await startMission('The second story');
  const wonMission = await leaveBehind();
  await database.query('UPDATE solo_missions SET current_waypoint_index = (SELECT position FROM solo_waypoints WHERE id = solo_missions.objective_waypoint_id) WHERE id = $1', [wonMission]);
  const won = (await ok(call('POST', `/v1/campaigns/${party.id}/solo/missions/${wonMission}/complete`, { token: tokens.alice, headers: writeHeaders((await soloSnapshot()).campaignRevision), body: { outcome: 'success', summary: 'The lantern was found.', rewards: {}, reason: 'smoke' } }), 200, 'win the mission')).data;
  assert.deepEqual(won.state_excerpt.cleanup, { settledDangers: 1, retiredNpcs: 1 });
  assert.deepEqual(await statusOf('solo_dangers', wonMission), ['resolved'], 'a danger is resolved after a success');
  const afterSuccess = await soloSnapshot();
  assert.equal(afterSuccess.pendingAdvancement?.status, 'selecting_marks', 'a success starts the advancement');
  assert.ok(afterSuccess.allowedNextActions.includes('select_solo_mission_marks'));
  results.storyEnd = 'passed';

  // --- Planning the next story ---
  const proposal = (token, body) => call('POST', '/ai/solo-mission', { token, body });
  const proposed = await ok(proposal(tokens.alice, { partyId: party.id, idea: 'A haunted lighthouse' }), 200, 'a mission proposal');
  assert.equal(proposed.mission.title, 'The Drowned Lighthouse');
  assert.equal(proposed.mission.opening.title, 'The harbour wall');
  assert.deepEqual(proposed.mission.foreseen, [{ title: 'The salt marsh', description: 'A causeway.' }]);
  assert.equal(proposed.mission.unknownWaypoints, 1);
  assert.equal(proposed.mission.threat.recurring, false);
  const planning = seenRequests.at(-1).messages;
  assert.ok(planning[1].content.includes("THE PLAYER'S IDEA FOR THE NEXT STORY\nA haunted lighthouse"), 'the idea is sent');
  assert.ok(planning[1].content.includes('EARLIER MISSIONS') && planning[1].content.includes('The first story (failure): The hero fled.') && planning[1].content.includes('The second story (success): The lantern was found.'), 'with the earlier missions and how they ended');
  await ok(proposal(tokens.alice, { partyId: party.id, idea: '' }), 200, 'a follow-on proposal needs no idea');
  assert.ok(seenRequests.at(-1).messages[1].content.includes('(none: propose something that follows'));
  await ok(proposal(tokens.bob, { partyId: party.id, idea: 'x' }), 403, 'a stranger cannot plan');
  assert.ok((await database.query("SELECT count(*)::int AS n FROM ai_usage WHERE purpose = 'solo-mission'")).rows[0].n >= 2, 'planning is counted as usage');
  results.planStory = 'passed';

  // --- The story library ---
  const stories = (await ok(call('GET', `/ai/solo-stories?partyId=${party.id}`, { token: tokens.alice }), 200, 'the library')).stories;
  assert.deepEqual(stories.map((story) => [story.title, story.outcome]), [['The second story', 'success'], ['The first story', 'failure']], 'newest first, with how each ended');
  assert.equal(stories[0].summary, 'The lantern was found.');
  assert.equal(stories[1].summary, 'The hero fled.');
  assert.equal(stories[0].narrative, '', 'nothing was kept of the telling yet');
  await database.query("INSERT INTO solo_narrator_memory (party_id, summary) VALUES ($1, 'Mara found the lantern in the flooded vault.') ON CONFLICT (party_id) DO UPDATE SET summary = EXCLUDED.summary", [party.id]);
  const archived = await ok(call('POST', '/ai/solo-stories', { token: tokens.alice, body: { partyId: party.id, title: 'The second story', outcome: 'unfinished', summary: 'The lantern was found.' } }), 200, 'put the story away');
  assert.equal(archived.hasNarrative, true);
  const kept = (await ok(call('GET', `/ai/solo-stories?partyId=${party.id}`, { token: tokens.alice }), 200, 'the library again')).stories;
  assert.equal(kept.length, 2, 'it joins the mission it belongs to, not a second entry');
  assert.match(kept[0].narrative, /flooded vault/);
  assert.equal(kept[0].outcome, 'success', 'and takes that mission\'s outcome');
  await ok(call('POST', '/ai/solo-stories', { token: tokens.alice, body: { partyId: party.id, title: '', outcome: 'success' } }), 400, 'a story needs a title');
  await ok(call('POST', '/ai/solo-stories', { token: tokens.bob, body: { partyId: party.id, title: 'x' } }), 403, 'a stranger cannot add to it');
  await ok(call('GET', `/ai/solo-stories?partyId=${party.id}`, { token: tokens.bob }), 403, 'or read it');

  const continued = await ok(call('POST', '/ai/solo-stories/continue', { token: tokens.alice, body: { partyId: party.id, storyId: kept[0].id } }), 200, 'continue from a story');
  assert.match(continued.summary, /^Earlier story, “The second story” \(success\): Mara found the lantern/);
  const afterContinue = await ok(conversation(tokens.alice), 200, 'the narrator after continuing');
  assert.equal(afterContinue.summary, continued.summary, 'the story becomes the narrator\'s story so far');
  assert.deepEqual(afterContinue.turns, [], 'and the conversation starts clean');
  await ok(call('POST', '/ai/solo-stories/continue', { token: tokens.alice, body: { partyId: party.id, storyId: `mission:${randomUUID()}` } }), 404, 'an unknown story');
  await ok(call('POST', '/ai/solo-stories/continue', { token: tokens.alice, body: { partyId: party.id, storyId: 'nonsense' } }), 400, 'a bad id');
  await ok(call('POST', '/ai/solo-stories/continue', { token: tokens.bob, body: { partyId: party.id, storyId: kept[0].id } }), 403, 'a stranger cannot continue it');
  results.storyLibrary = 'passed';

  const polish = (token, body) => call('POST', '/ai/recap', { token, body });
  // --- Story language: one setting for the campaign, read by the narrator and by assistants ---
  const setLanguage = (token, language) => call('PUT', '/ai/solo-narrator/language', { token, body: { partyId: party.id, language } });
  assert.equal((await ok(conversation(tokens.alice), 200, 'default language')).language, 'en');
  await ok(setLanguage(tokens.alice, 'fr'), 400, 'an unsupported language');
  await ok(setLanguage(tokens.bob, 'et'), 403, 'a stranger cannot change the language');
  const revisionBeforeLanguage = await revisionNow();
  await ok(setLanguage(tokens.alice, 'et'), 200, 'switch to Estonian');
  assert.equal(await revisionNow(), revisionBeforeLanguage, 'the language is a setting, not game state');
  assert.equal((await ok(conversation(tokens.alice), 200, 'Estonian')).language, 'et');
  assert.equal((await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'solo state')).data.solo.narrationLanguage, 'et', 'assistants see it in the solo state');
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'Ma astun sillale' }), 200, 'an Estonian turn');
  const estonianSystem = seenRequests.at(-1).messages[0].content;
  assert.ok(estonianSystem.includes('LANGUAGE: Write everything the player reads in Estonian (eesti keel)'), 'the narrator is told to write Estonian');
  assert.ok(estonianSystem.includes('exactly as specified in English'), 'and to keep the machine fields in English');
  assert.ok(estonianSystem.includes('Hit points = Elupunktid'), 'with the built-in glossary of game terms');
  await ok(polish(tokens.alice, { partyId: party.id, draft: 'Goblin ambush: 4 rounds.' }), 200, 'an Estonian recap');
  assert.ok(seenRequests.at(-1).messages[0].content.includes('Estonian (eesti keel)'), 'the recap follows the campaign language');
  await ok(setLanguage(tokens.alice, 'en'), 200, 'back to English');
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'And now?' }), 200, 'an English turn again');
  assert.ok(!seenRequests.at(-1).messages[0].content.includes('LANGUAGE:'), 'English needs no instruction');
  results.storyLanguage = 'passed';

  // --- The campaign's own glossary of game terms ---
  const glossary = (token, text) => call('PUT', '/ai/solo-narrator/glossary', { token, body: { partyId: party.id, glossary: text } });
  assert.equal((await ok(conversation(tokens.alice), 200, 'glossary default')).glossary.custom, null);
  await ok(setLanguage(tokens.alice, 'et'), 200, 'Estonian again');
  await ok(glossary(tokens.bob, 'Dragon = Lohe'), 403, 'a stranger cannot change the glossary');
  await ok(glossary(tokens.alice, 'x'.repeat(2001)), 400, 'a glossary that is too long');
  assert.equal((await ok(glossary(tokens.alice, 'Hit points = Elu\nDragon = Lohe'), 200, 'a custom glossary')).glossary.custom, 'Hit points = Elu\nDragon = Lohe');
  const soloWithGlossary = (await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'solo state')).data.solo;
  assert.equal(soloWithGlossary.narrationGlossary, 'Hit points = Elu\nDragon = Lohe', 'assistants get the campaign\'s own terms');
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'Edasi' }), 200, 'a turn with custom terms');
  const customSystem = seenRequests.at(-1).messages[0].content;
  assert.ok(customSystem.includes('Hit points = Elu; Dragon = Lohe') && !customSystem.includes('Elupunktid'), 'the narrator uses the custom terms instead of the built-in ones');
  assert.equal((await ok(glossary(tokens.alice, ''), 200, 'back to the built-in list')).glossary.custom, null);
  await ok(setLanguage(tokens.alice, 'en'), 200, 'English again');
  assert.equal((await ok(call('GET', `/v1/campaigns/${party.id}/solo`, { token: tokens.alice }), 200, 'English state')).data.solo.narrationGlossary, undefined, 'English campaigns publish no glossary');
  results.glossary = 'passed';

  // --- Prompt caching is counted ---
  const cachedUse = (await ok(call('GET', '/account/ai', { token: tokens.alice }), 200, 'usage with cache')).usageThisMonth;
  assert.ok(cachedUse.cachedTokens >= 128 && cachedUse.cachedTokens % 128 === 0, `cached tokens are recorded per call (got ${cachedUse.cachedTokens})`);
  const cachedTurn = (await ok(conversation(tokens.alice), 200, 'turn usage')).turns.filter((turn) => turn.role === 'assistant').at(-1);
  assert.equal(cachedTurn.cachedTokens, 128, 'and shown on the reply');

  // --- The administrator sees who uses it ---
  const aliceId = (await database.query('SELECT id FROM users WHERE email = $1', [emails.alice])).rows[0].id;
  const overview = await ok(call('GET', '/admin/ai-usage', { token: admin }), 200, 'admin usage');
  const mine = overview.users.find((user) => user.userId === aliceId);
  assert.ok(mine && mine.calls >= 5 && mine.hasKey === true, 'the person who used it is listed');
  assert.ok(mine.byPurpose.solo.calls >= 1 && mine.byPurpose.story.calls >= 1, 'with what it was used for');
  assert.ok(overview.totals.calls >= mine.calls && overview.totals.cachedTokens >= 128 && overview.months.length === 6);
  assert.ok(!JSON.stringify(overview).includes(VALID_KEY) && !JSON.stringify(overview).includes('v1:'), 'no key, encrypted or not, is ever shown');
  await ok(call('GET', '/admin/ai-usage', { token: tokens.bob }), 403, 'an ordinary user cannot see it');
  await ok(call('GET', '/admin/ai-usage?month=October', { token: admin }), 400, 'a bad month');
  assert.equal((await ok(call('GET', '/admin/ai-usage?month=2020-01', { token: admin }), 200, 'an old month')).totals.calls, 0);
  results.adminAiUsage = 'passed';

  // The player can correct the summary, and start over.
  await ok(call('PUT', '/ai/solo-narrator', { token: tokens.alice, body: { partyId: party.id, summary: 'Mara is at the gate. The wolf is dead.' } }), 200, 'edit the summary');
  assert.equal((await ok(conversation(tokens.alice), 200, 'edited')).summary, 'Mara is at the gate. The wolf is dead.');
  await ok(call('PUT', '/ai/solo-narrator', { token: tokens.alice, body: { partyId: party.id, summary: 'x'.repeat(2001) } }), 400, 'a summary that is too long');
  await ok(conversation(tokens.bob), 403, 'a stranger cannot read the story');
  await ok(call('PUT', '/ai/solo-narrator', { token: tokens.bob, body: { partyId: party.id, summary: 'hack' } }), 403, 'nor change it');
  await ok(call('DELETE', `/ai/solo-narrator?partyId=${party.id}`, { token: tokens.bob }), 403, 'nor erase it');
  await ok(narrate(tokens.bob, { partyId: party.id, message: 'hi' }), 403, 'a stranger cannot use the narrator');
  await ok(narrate(tokens.alice, { partyId: 'not-a-uuid', message: 'hi' }), 400, 'a bad campaign id');
  await ok(narrate(tokens.alice, { partyId: party.id, message: '  ' }), 400, 'an empty message');
  const reset = await ok(call('DELETE', `/ai/solo-narrator?partyId=${party.id}`, { token: tokens.alice }), 200, 'start over');
  assert.deepEqual(reset, { turns: [], summary: '', language: 'en', glossary: { custom: null, builtIn: '', terms: 0 }, campaign: null });
  assert.equal((await database.query('SELECT count(*)::int AS n FROM solo_narrator_turns WHERE party_id = $1', [party.id])).rows[0].n, 0);
  results.soloNarrator = 'passed';

  // --- Polishing a session recap ---
  const polished = await ok(polish(tokens.alice, { partyId: party.id, draft: 'Goblin ambush: 4 rounds. Defeated Goblin.' }), 200, 'a polished recap');
  assert.match(polished.text, /fought bravely/);
  assert.ok(seenRequests.at(-1).messages[0].content.includes('Do not invent'), 'the model is told not to invent');
  assert.equal(seenRequests.at(-1).messages[1].content, 'Goblin ambush: 4 rounds. Defeated Goblin.');
  await ok(polish(tokens.alice, { partyId: party.id, draft: '  ' }), 400, 'nothing to polish');
  await ok(polish(tokens.bob, { partyId: party.id, draft: 'x' }), 403, 'a stranger cannot polish');
  assert.ok((await database.query("SELECT count(*)::int AS n FROM ai_usage WHERE purpose = 'recap'")).rows[0].n >= 1);
  results.recapPolish = 'passed';

  // --- Monthly limits ---
  await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { monthlyTokenCap: 10 } }), 400, 'a token limit that is too small');
  await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { monthlyCostCapUsd: -2 } }), 400, 'a negative money limit');
  const capped = await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { monthlyTokenCap: 1000 } }), 200, 'a token limit');
  assert.equal(capped.limits.monthlyTokenCap, 1000);
  assert.equal(capped.limits.reached, true, 'the month already used more than that');
  const blocked = await call('POST', '/ai/story', { token: tokens.alice, body: { prompt: 'Over the limit' } });
  assert.equal(blocked.status, 402, 'a call over the limit is refused');
  assert.equal(blocked.payload.error.code, 'AI_LIMIT_REACHED');
  assert.match(blocked.payload.error.message, /1,000 tokens/);
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'hi' }), 402, 'the narrator stops at the limit too');
  await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { monthlyTokenCap: null, monthlyCostCapUsd: 0.0005 } }), 200, 'switch to a money limit');
  assert.equal((await call('POST', '/ai/story', { token: tokens.alice, body: { prompt: 'Over the money limit' } })).status, 402, 'the money limit counts reported costs');
  const lifted = await ok(call('PUT', '/account/ai', { token: tokens.alice, body: { monthlyCostCapUsd: null } }), 200, 'remove the limits');
  assert.deepEqual([lifted.limits.monthlyCostCapUsd, lifted.limits.monthlyTokenCap, lifted.limits.reached], [null, null, false]);
  await ok(call('POST', '/ai/story', { token: tokens.alice, body: { prompt: 'Free again' } }), 200, 'works again without limits');
  results.monthlyLimits = 'passed';

  // --- Removing the key ---
  assert.equal((await ok(call('DELETE', '/account/ai', { token: tokens.alice }), 200, 'remove')).hasKey, false);
  await ok(call('POST', '/ai/story', { token: tokens.alice, body: { prompt: 'Again' } }), 409, 'no story without a key');
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'hi' }), 409, 'no narrator without a key');
  results.removal = 'passed';

  console.log(JSON.stringify(results, null, 2));
} finally {
  await cleanup().catch((error) => console.error('cleanup failed', error));
  await database.end();
  mock.close();
}
