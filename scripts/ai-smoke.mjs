/* global fetch */
// End-to-end check of the built-in AI against the local stack, with a stand-in for OpenRouter so no real key or
// money is involved. The API must be started with AI_KEY_ENCRYPTION_SECRET set and OPENROUTER_BASE_URL pointing at
// this script's stand-in (http://host.docker.internal:4010 when the API runs in Docker).
import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import process from 'node:process';
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
    response.end(JSON.stringify({
      choices: [{ message: { content: 'You step onto the bridge. It groans.\n1. Cross quickly\n2. Test the planks' } }],
      usage: { prompt_tokens: 321, completion_tokens: 45, cost: 0.0002 },
    }));
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
  const hero = (await ok(query(tokens.alice, { table: 'characters', action: 'insert', payload: { name: `AI Hero ${suffix}`, max_hp: 10, current_hp: 6, max_wp: 8, current_wp: 8 } }), 200, 'hero')).data[0];
  const party = (await ok(rpc(tokens.alice, 'create_campaign', { p_name: `AI Solo ${suffix}`, p_character_ids: [hero.id] }), 200, 'campaign')).data;
  const narrate = (token, body) => call('POST', '/ai/solo-narrator', { token, body });
  await ok(narrate(tokens.alice, { partyId: party.id, message: 'I look around' }), 409, 'solo must be switched on first');
  const options = (await ok(call('GET', `/v1/campaigns/${party.id}/solo/options`, { token: tokens.alice }), 200, 'solo options')).data;
  await ok(call('POST', `/v1/campaigns/${party.id}/solo`, {
    token: tokens.alice,
    headers: { 'if-match': `"${options.campaignRevision}"`, 'idempotency-key': `ai-${randomUUID()}` },
    body: { player_character_id: hero.id, mode: 'custom', reason: 'AI smoke test' },
  }), 200, 'switch solo on');
  const turn = await ok(narrate(tokens.alice, { partyId: party.id, message: 'I step onto the bridge', history: [{ role: 'user', content: 'Where am I?' }, { role: 'assistant', content: 'In a forest.' }] }), 200, 'a narrator turn');
  assert.match(turn.text, /bridge/);
  const sent = seenRequests.at(-1).messages;
  assert.equal(sent[0].role, 'system');
  assert.ok(sent[0].content.includes('GAME SUMMARY') && sent[0].content.includes(`HERO: AI Hero ${suffix}. HP 6/10`), 'the system message carries the hero');
  assert.ok(sent[0].content.includes('never roll dice') || sent[0].content.includes('Never roll dice'), 'and the rules for the narrator');
  assert.deepEqual(sent.slice(1).map((entry) => entry.role), ['user', 'assistant', 'user'], 'the history comes before the new message');
  assert.ok(JSON.stringify(sent).length < 12_000, 'the request stays small');
  await ok(narrate(tokens.bob, { partyId: party.id, message: 'hi' }), 403, 'a stranger cannot use the narrator');
  await ok(narrate(tokens.alice, { partyId: 'not-a-uuid', message: 'hi' }), 400, 'a bad campaign id');
  await ok(narrate(tokens.alice, { partyId: party.id, message: '  ' }), 400, 'an empty message');
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
