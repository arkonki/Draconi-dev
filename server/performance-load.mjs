import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import pg from 'pg';

const { Client: PgClient } = pg;

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const config = {
  apiBase: (process.env.PERF_TEST_API || 'http://localhost:8080/api').replace(/\/$/, ''),
  mcpUrl: process.env.PERF_TEST_MCP_URL || 'http://localhost:3100/mcp',
  databaseUrl: process.env.PERF_TEST_DATABASE_URL || process.env.DATABASE_URL
    || 'postgresql://dragonbane:dragonbane-local-password@localhost:5432/dragonbane',
  adminEmail: process.env.PERF_TEST_EMAIL || process.env.DEVELOPMENT_USER_EMAIL
    || process.env.ADMIN_EMAIL || 'admin@example.com',
  developmentToken: process.env.PERF_TEST_DEVELOPMENT_TOKEN || process.env.DEVELOPMENT_TOKEN,
  users: integerSetting('PERF_TEST_USERS', 6, 2, 40),
  durationSeconds: integerSetting('PERF_TEST_DURATION_SECONDS', 20, 5, 600),
  thinkTimeMs: integerSetting('PERF_TEST_THINK_TIME_MS', 125, 0, 10_000),
  output: process.env.PERF_TEST_OUTPUT || '',
  allowRemote: process.env.PERF_TEST_ALLOW_REMOTE === 'true',
};

if (!config.databaseUrl || !config.developmentToken) {
  throw new Error(
    'DATABASE_URL and DEVELOPMENT_TOKEN are required. '
      + 'Use PERF_TEST_DATABASE_URL or PERF_TEST_DEVELOPMENT_TOKEN to override them.',
  );
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

if (!config.allowRemote) {
  const apiHost = new URL(config.apiBase).hostname;
  const databaseHost = new URL(config.databaseUrl).hostname;
  if (!isLoopback(apiHost) || !isLoopback(databaseHost)) {
    throw new Error('The performance rehearsal is local-only. Set PERF_TEST_ALLOW_REMOTE=true for an intentional remote run.');
  }
}

const suffix = randomUUID().slice(0, 8);
const accounts = Array.from({ length: config.users }, (_, index) => ({
  email: `performance-${suffix}-${index}@example.com`,
  username: `performance-${suffix}-${index}`,
  role: index === 0 ? 'dm' : 'player',
}));
const timings = new Map();
const sockets = [];
const realtimeMarkerStarts = new Map();
const realtimeLatencies = [];
const recordIds = new Set();
const failures = [];
const database = new PgClient({ connectionString: config.databaseUrl });
let mcpClient;
let partyId;
let adminSessionHash;

function percentile(samples, requestedPercentile) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((requestedPercentile / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(2));
}

function addTiming(operation, duration, failed = false) {
  const metric = timings.get(operation) || { durations: [], errors: 0 };
  metric.durations.push(duration);
  if (failed) metric.errors += 1;
  timings.set(operation, metric);
}

function summarizeSamples(samples) {
  return {
    count: samples.length,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    p99Ms: percentile(samples, 99),
    maxMs: Number(Math.max(0, ...samples).toFixed(2)),
  };
}

function summarizeOperations() {
  return Object.fromEntries([...timings.entries()].map(([name, metric]) => [name, {
    ...summarizeSamples(metric.durations),
    errors: metric.errors,
    errorRatePercent: metric.durations.length
      ? Number(((metric.errors / metric.durations.length) * 100).toFixed(2))
      : 0,
  }]));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function jsonRequest(path, { token, operation, ...init } = {}) {
  const startedAt = performance.now();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('authorization', `Bearer ${token}`);
  let failed = false;
  try {
    const response = await fetch(`${config.apiBase}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => ({}));
    failed = !response.ok;
    if (failed) {
      throw new Error(`${init.method || 'GET'} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (operation) addTiming(operation, performance.now() - startedAt, failed);
  }
}

function postJson(path, body, token, operation) {
  return jsonRequest(path, {
    token,
    operation,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function dataQuery(token, query, operation) {
  const payload = await postJson('/data/query', query, token, operation);
  return payload.data;
}

async function insert(token, table, payload) {
  const [row] = await dataQuery(token, { table, action: 'insert', payload });
  assert.ok(row?.id, `${table} insert did not return an id`);
  recordIds.add(row.id);
  return row;
}

function sessionHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function createDisposableSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await database.query(
    "INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
    [sessionHash(token), userId],
  );
  return token;
}

function realtimeUrl() {
  const url = new URL(`${config.apiBase}/realtime/socket`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function waitForSocketMessage(socket, predicate, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', handleMessage);
      reject(new Error('Timed out waiting for a realtime WebSocket response'));
    }, timeoutMs);
    const handleMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', handleMessage);
      resolve(message);
    };
    socket.addEventListener('message', handleMessage);
  });
}

async function openRealtimeSocket(token, afterId, bindings) {
  const socket = new WebSocket(realtimeUrl());
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Unable to open a realtime WebSocket')), { once: true });
  });
  const authenticated = waitForSocketMessage(socket, (message) => message.type === 'authenticated');
  socket.send(JSON.stringify({ type: 'authenticate', accessToken: token }));
  await authenticated;
  const subscribed = waitForSocketMessage(socket, (message) => message.type === 'subscribed');
  socket.send(JSON.stringify({ type: 'subscribe', afterId, bindings }));
  await subscribed;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    for (const change of message.events || []) {
      if (change.table_name !== 'messages') continue;
      const marker = change.new_record?.content;
      const startedAt = realtimeMarkerStarts.get(marker);
      if (startedAt !== undefined) realtimeLatencies.push(performance.now() - startedAt);
    }
  });
  sockets.push(socket);
}

function binding(table) {
  const foreignKey = table === 'encounter_combatants' ? 'encounter_id' : 'party_id';
  const value = table === 'encounter_combatants' ? null : partyId;
  return value ? { schema: 'public', table, event: '*', filter: `${foreignKey}=eq.${value}` }
    : { schema: 'public', table, event: '*' };
}

async function measuredMcpCall(name, args) {
  const startedAt = performance.now();
  let failed = false;
  try {
    return await mcpClient.callTool({ name, arguments: args });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    addTiming(`mcp:${name}`, performance.now() - startedAt, failed);
  }
}

async function userLoop(user, character, encounter, projectorToken, deadline) {
  let iteration = 0;
  let currentWp = 10;
  while (performance.now() < deadline) {
    try {
      switch (iteration % 6) {
        case 0:
          await dataQuery(user.token, {
            table: 'parties', action: 'select',
            filters: [{ operator: 'eq', column: 'id', value: partyId }], limit: 1,
          }, 'party:view');
          break;
        case 1:
          await dataQuery(user.token, {
            table: 'messages', action: 'select',
            filters: [{ operator: 'eq', column: 'party_id', value: partyId }],
            orders: [{ column: 'created_at', ascending: false }], limit: 50,
          }, 'chat:read');
          break;
        case 2:
          currentWp = currentWp === 10 ? 9 : 10;
          await dataQuery(user.token, {
            table: 'characters', action: 'update',
            filters: [{ operator: 'eq', column: 'id', value: character.id }],
            payload: { current_wp: currentWp },
          }, 'character:update');
          break;
        case 3:
          await Promise.all([
            dataQuery(user.token, {
              table: 'encounters', action: 'select',
              filters: [{ operator: 'eq', column: 'id', value: encounter.id }], limit: 1,
            }, 'encounter:read'),
            dataQuery(user.token, {
              table: 'encounter_combatants', action: 'select',
              filters: [{ operator: 'eq', column: 'encounter_id', value: encounter.id }],
              orders: [{ column: 'created_at', ascending: true }],
            }, 'encounter:combatants'),
          ]);
          break;
        case 4: {
          const marker = `performance-message-${suffix}-${user.id}-${iteration}`;
          realtimeMarkerStarts.set(marker, performance.now());
          await dataQuery(user.token, {
            table: 'messages', action: 'insert', payload: { party_id: partyId, content: marker },
          }, 'chat:write');
          break;
        }
        default:
          await postJson('/functions/get-player-display-state', {
            sessionToken: projectorToken,
          }, undefined, 'projector:read');
      }
    } catch (error) {
      failures.push({ operation: `user-${iteration % 6}`, message: error.message });
    }
    iteration += 1;
    if (config.thinkTimeMs) await sleep(config.thinkTimeMs);
  }
}

async function mcpLoop(actorId, deadline) {
  while (performance.now() < deadline) {
    try {
      const result = await measuredMcpCall('get_resume_state', {
        campaign_id: partyId,
        actor_id: actorId,
        detail: 'compact',
      });
      if (result.isError) throw new Error('MCP get_resume_state returned an error result');
    } catch (error) {
      failures.push({ operation: 'mcp:get_resume_state', message: error.message });
    }
    await sleep(750);
  }
}

async function pgStatStatementsAvailable() {
  const { rows } = await database.query(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS available",
  );
  return Boolean(rows[0]?.available);
}

async function pgStatStatementsSnapshot() {
  const { rows } = await database.query(
    `SELECT calls::integer, rows::integer,
            round(total_exec_time::numeric, 2)::float8 AS total_exec_ms,
            round(mean_exec_time::numeric, 2)::float8 AS mean_exec_ms,
            round(max_exec_time::numeric, 2)::float8 AS max_exec_ms,
            left(regexp_replace(query, '\\s+', ' ', 'g'), 240) AS query
     FROM pg_stat_statements
     WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND query NOT ILIKE '%pg_stat_statements%'
     ORDER BY total_exec_time DESC
     LIMIT 12`,
  );
  return rows;
}

await database.connect();
const startedAt = new Date();
try {
  const databaseAdmin = await database.query('SELECT id FROM users WHERE lower(email) = lower($1)', [config.adminEmail]);
  assert.ok(databaseAdmin.rows[0]?.id, `Administrator ${config.adminEmail} does not exist in the rehearsal database`);
  const adminToken = await createDisposableSession(databaseAdmin.rows[0].id);
  adminSessionHash = sessionHash(adminToken);
  const adminPayload = await jsonRequest('/auth/user', { token: adminToken });
  assert.equal(adminPayload.user.user_metadata?.role, 'admin', 'PERF_TEST_EMAIL must identify an administrator');
  const admin = { id: databaseAdmin.rows[0].id, token: adminToken };

  const users = [];
  for (const account of accounts) {
    const { rows } = await database.query(
      `INSERT INTO users (email, username, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, role`,
      [account.email, account.username, account.role],
    );
    recordIds.add(rows[0].id);
    users.push({ ...rows[0], token: await createDisposableSession(rows[0].id) });
  }
  const characters = [];
  for (let index = 0; index < users.length; index += 1) {
    characters.push(await insert(users[index].token, 'characters', {
      name: `Performance Hero ${suffix} ${index + 1}`,
      max_hp: 12,
      current_hp: 12,
      max_wp: 10,
      current_wp: 10,
      attributes: { STR: 12, CON: 12, AGL: 12, INT: 12, WIL: 12, CHA: 12 },
    }));
  }
  const party = await insert(users[0].token, 'parties', {
    name: `Performance Party ${suffix}`,
    description: 'Disposable Phase 6 multi-user performance rehearsal',
  });
  partyId = party.id;
  await insert(users[0].token, 'party_members', { party_id: partyId, character_id: characters[0].id });
  for (let index = 1; index < users.length; index += 1) {
    const joined = await postJson('/rpc/join_party_with_character', {
      invite_code: party.invite_code,
      character_id: characters[index].id,
    }, users[index].token);
    assert.equal(joined.data, partyId);
  }

  const encounter = await insert(users[0].token, 'encounters', {
    party_id: partyId,
    name: `Performance Encounter ${suffix}`,
    status: 'active',
    current_round: 1,
  });
  for (let index = 0; index < characters.length; index += 1) {
    await insert(users[0].token, 'encounter_combatants', {
      encounter_id: encounter.id,
      character_id: characters[index].id,
      is_player_character: true,
      display_name: characters[index].name,
      current_hp: 12,
      max_hp: 12,
      current_wp: 10,
      max_wp: 10,
    });
  }
  await insert(users[0].token, 'encounter_combatants', {
    encounter_id: encounter.id,
    is_player_character: false,
    display_name: `Performance Goblin ${suffix}`,
    current_hp: 8,
    max_hp: 8,
    current_wp: 0,
    max_wp: 0,
  });

  const display = await postJson('/functions/create-party-display-session', { partyId }, users[0].token);
  recordIds.add(display.session.id);

  const bindings = [binding('messages'), binding('characters'), binding('encounters'), binding('encounter_combatants')];
  for (const user of users) {
    const baseline = await postJson('/realtime/events', { afterId: null, bindings }, user.token);
    await openRealtimeSocket(user.token, baseline.lastId, bindings);
  }

  mcpClient = new McpClient({ name: 'draconi-performance-rehearsal', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    requestInit: { headers: { authorization: `Bearer ${config.developmentToken}` } },
  });
  await mcpClient.connect(transport);

  const hasPgStatStatements = await pgStatStatementsAvailable();
  if (hasPgStatStatements) await database.query('SELECT pg_stat_statements_reset()');
  await postJson('/admin/performance/reset', {}, admin.token);

  const loadStartedAt = performance.now();
  const deadline = loadStartedAt + config.durationSeconds * 1_000;
  await Promise.all([
    ...users.map((user, index) => userLoop(user, characters[index], encounter, display.sessionToken, deadline)),
    mcpLoop(characters[0].id, deadline),
  ]);
  await sleep(1_000);

  const serverMetrics = await jsonRequest('/admin/performance', { token: admin.token });
  const operations = summarizeOperations();
  const allRequestSamples = [...timings.values()].flatMap((metric) => metric.durations);
  const totalErrors = [...timings.values()].reduce((total, metric) => total + metric.errors, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    scenario: {
      users: config.users,
      durationSeconds: config.durationSeconds,
      thinkTimeMs: config.thinkTimeMs,
      covered: ['party view', 'chat read/write', 'character updates', 'encounters', 'projector', 'MCP reads'],
    },
    client: {
      requests: {
        ...summarizeSamples(allRequestSamples),
        errors: totalErrors,
        errorRatePercent: allRequestSamples.length
          ? Number(((totalErrors / allRequestSamples.length) * 100).toFixed(2))
          : 0,
      },
      operations,
      realtimeDelivery: summarizeSamples(realtimeLatencies),
      realtimeExpectedMaximumSamples: realtimeMarkerStarts.size * users.length,
    },
    server: serverMetrics,
    postgresStatements: hasPgStatStatements ? await pgStatStatementsSnapshot() : null,
    failures: failures.slice(0, 25),
  };

  console.log(JSON.stringify(report, null, 2));
  if (config.output) await writeFile(config.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (failures.length || totalErrors) process.exitCode = 1;
} finally {
  await mcpClient?.close().catch(() => {});
  sockets.forEach((socket) => socket.close());
  try {
    if (adminSessionHash) {
      await database.query('DELETE FROM app_sessions WHERE token_hash = $1', [adminSessionHash]);
    }
    if (partyId) await database.query('DELETE FROM parties WHERE id = $1', [partyId]);
    await database.query('DELETE FROM users WHERE email = ANY($1::text[])', [accounts.map((account) => account.email)]);
    if (recordIds.size || partyId) {
      await database.query(
        `DELETE FROM app_change_events
         WHERE record_id = ANY($1::uuid[])
            OR old_record->>'party_id' = $3
            OR new_record->>'party_id' = $3
            OR old_record->>'encounter_id' = ANY($2::text[])
            OR new_record->>'encounter_id' = ANY($2::text[])
            OR old_record->>'session_id' = ANY($2::text[])
            OR new_record->>'session_id' = ANY($2::text[])`,
        [[...recordIds], [...recordIds], partyId || ''],
      );
    }
  } finally {
    await database.end();
  }
  const elapsed = Number(((Date.now() - startedAt.getTime()) / 1_000).toFixed(1));
  console.error(`Performance rehearsal completed in ${elapsed}s; disposable users and campaign were removed.`);
}
