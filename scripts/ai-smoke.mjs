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
    const text = isSummary
      ? 'Mara crossed the old bridge and now stands at the shrine gate.'
      : isNarrator
        ? 'You step onto the bridge. It groans.\n1. Cross quickly\n2. Test the planks\nACTIONS: [{"type":"check","name":"STR","modifier":"bane","label":"Cross the bridge"},{"type":"fortune","question":"Is the bridge safe?"},{"type":"check","name":"Flying","label":"Fly away"},{"type":"damage","amount":9}]'
        : 'You step onto the bridge. It groans.\n1. Cross quickly\n2. Test the planks';
    const usage = { prompt_tokens: 321, completion_tokens: 45, cost: 0.0002 };
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
  assert.ok(sent[0].content.includes('GAME SUMMARY') && sent[0].content.includes(`HERO: AI Hero ${suffix}. HP 6/10`), 'the system message carries the hero');
  assert.ok(sent[0].content.includes('Never roll dice'), 'and the rules for the narrator');
  assert.deepEqual(sent.slice(1).map((entry) => entry.role), ['user'], 'the first turn has no history');
  assert.ok(JSON.stringify(sent).length < 12_000, 'the request stays small');
  // Actions: only what the game can honour, with names fixed up.
  const kinds = turn.actions.map((action) => `${action.type}:${action.name ?? ''}`);
  assert.deepEqual(kinds, ['check:STR', 'fortune:'], `unsupported actions were dropped (got ${kinds.join(', ')})`);
  assert.equal(turn.actions[0].modifier, 'bane');
  assert.equal(turn.actions[1].category, 'yes_no');

  // The story is remembered on the server, and the next turn is given it.
  const remembered = (await ok(conversation(tokens.alice), 200, 'conversation')).turns;
  assert.deepEqual(remembered.map((entry) => entry.role), ['user', 'assistant']);
  assert.equal(remembered[1].actions.length, 2, 'the proposed actions are kept with the reply');
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'I cross' }), 200, 'a second turn');
  assert.deepEqual(seenRequests.at(-1).messages.slice(1).map((entry) => entry.role), ['user', 'assistant', 'user'], 'the earlier exchange is sent as history');

  // Streaming: the answer arrives in pieces and ends with the finished turn.
  const streamResponse = await fetch(`${apiBase}/ai/solo-narrator/stream`, { method: 'POST', headers: { authorization: `Bearer ${tokens.alice}`, 'content-type': 'application/json' }, body: JSON.stringify({ partyId: party.id, message: 'I look down' }) });
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get('content-type'), /text\/event-stream/);
  const raw = await streamResponse.text();
  const deltas = [...raw.matchAll(/event: delta\ndata: (.*)\n/g)].map((match) => JSON.parse(match[1]).text);
  assert.ok(deltas.length > 3, `several pieces arrive (got ${deltas.length})`);
  const done = JSON.parse(raw.match(/event: done\ndata: (.*)\n/)[1]);
  assert.match(done.text, /bridge/);
  assert.equal(done.actions.length, 2);
  assert.equal(done.usage.promptTokens, 321, 'usage comes from the final chunk');
  assert.equal((await ok(conversation(tokens.alice), 200, 'after streaming')).turns.length, 6, 'a streamed turn is stored too');
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
  assert.ok(seenRequests.at(-1).messages[0].content.includes('THE STORY SO FAR') && seenRequests.at(-1).messages[0].content.includes('shrine gate'), 'the summary is given to the narrator');
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
  const system = seenRequests.at(-1).messages[0].content;
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
  assert.deepEqual(reset, { turns: [], summary: '', campaign: null });
  assert.equal((await database.query('SELECT count(*)::int AS n FROM solo_narrator_turns WHERE party_id = $1', [party.id])).rows[0].n, 0);
  results.soloNarrator = 'passed';

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
