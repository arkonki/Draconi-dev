import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { pool, withTransaction } from '../db.js';

const apiBaseUrl = process.env.HELPER_SMOKE_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const mcpUrl = process.env.MCP_SMOKE_URL;
const token = process.env.DEVELOPMENT_TOKEN;
const email = String(process.env.DEVELOPMENT_USER_EMAIL || process.env.ADMIN_EMAIL || '').toLowerCase();

if (!token || !email) {
  throw new Error('DEVELOPMENT_TOKEN and DEVELOPMENT_USER_EMAIL (or ADMIN_EMAIL) are required.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}, accessToken = token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  return { response, payload };
}

let campaignId;
let actorId;
let combatId;
let combatantId;
let playerUserId;
let mcpClient;

try {
  const { rows: users } = await pool.query(
    'SELECT id FROM users WHERE lower(email) = $1 AND is_active = true',
    [email],
  );
  assert(users[0], 'Development user does not exist.');

  await withTransaction(async (client) => {
    const campaign = await client.query(
      `INSERT INTO parties (name, description, created_by, gm_context, open_threads)
       VALUES ($1, $2, $3, '{"secret":"smoke-gm-only"}'::jsonb, '["hidden thread"]'::jsonb)
       RETURNING id`,
      [`Helper smoke ${randomUUID()}`, 'Disposable Helper API integration test', users[0].id],
    );
    campaignId = campaign.rows[0].id;
    const actor = await client.query(
      `INSERT INTO characters (
         user_id, party_id, name, max_hp, current_hp, max_wp, current_wp,
         conditions, equipment
       ) VALUES (
         $1, $2, 'Smoke Hero', 14, 14, 8, 8,
         '{"exhausted":false,"sickly":false,"dazed":false,"angry":false,"scared":false,"disheartened":false}'::jsonb,
         '{"inventory":[],"equipped":{"weapons":[]},"money":{}}'::jsonb
       ) RETURNING id`,
      [users[0].id, campaignId],
    );
    actorId = actor.rows[0].id;

    const encounter = await client.query(
      `INSERT INTO encounters (party_id, name, status, current_round)
       VALUES ($1, 'Smoke combat', 'active', 1)
       RETURNING id`,
      [campaignId],
    );
    combatId = encounter.rows[0].id;
    const combatant = await client.query(
      `INSERT INTO encounter_combatants (
         encounter_id, is_player_character, display_name, current_hp, max_hp,
         current_wp, max_wp
       ) VALUES ($1, false, 'Smoke Goblin', 7, 7, 0, 0)
       RETURNING id`,
      [combatId],
    );
    combatantId = combatant.rows[0].id;
  });

  const combatBefore = await pool.query(
    'SELECT helper_revision FROM encounters WHERE id = $1',
    [combatId],
  );
  await pool.query(
    'UPDATE encounter_combatants SET current_hp = current_hp - 1 WHERE id = $1',
    [combatantId],
  );
  const combatAfter = await pool.query(
    'SELECT helper_revision FROM encounters WHERE id = $1',
    [combatId],
  );
  assert(
    Number(combatAfter.rows[0].helper_revision) === Number(combatBefore.rows[0].helper_revision) + 1,
    'Combat revision did not increase after a participant changed.',
  );

  const state = await api(`/api/v1/campaigns/${campaignId}/state`);
  assert(state.response.status === 200, `Campaign state failed: ${JSON.stringify(state.payload)}`);
  const originalRevision = state.payload.data.campaign.revision;
  assert(Number.isInteger(originalRevision), 'Campaign state did not contain an integer revision.');

  const idempotencyKey = `smoke-damage-${randomUUID()}`;
  const damageBody = {
    reason: 'Automated integration-test sword hit',
    changes: [{ type: 'damage', amount: 6, damage_type: 'slashing' }],
  };
  const damageHeaders = {
    'if-match': `"${originalRevision}"`,
    'idempotency-key': idempotencyKey,
  };
  const damage = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    { method: 'POST', headers: damageHeaders, body: JSON.stringify(damageBody) },
  );
  assert(damage.response.status === 200, `Damage failed: ${JSON.stringify(damage.payload)}`);
  assert(damage.payload.data.state_excerpt.actor.hp.current === 8, 'Damage did not set HP to 8.');
  const damageRevision = damage.payload.data.campaign_revision;

  const duplicate = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    { method: 'POST', headers: damageHeaders, body: JSON.stringify(damageBody) },
  );
  assert(duplicate.response.status === 200, 'Idempotent replay failed.');
  assert(duplicate.payload.data.event_ids[0] === damage.payload.data.event_ids[0], 'Replay returned a different event.');
  const hpAfterReplay = await pool.query('SELECT current_hp FROM characters WHERE id = $1', [actorId]);
  assert(hpAfterReplay.rows[0].current_hp === 8, 'Idempotent replay applied damage twice.');

  const idempotencyConflict = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    {
      method: 'POST',
      headers: damageHeaders,
      body: JSON.stringify({
        reason: 'Different request with a reused key',
        changes: [{ type: 'heal', amount: 1 }],
      }),
    },
  );
  assert(idempotencyConflict.response.status === 409, 'Reused idempotency key did not return HTTP 409.');
  assert(
    idempotencyConflict.payload.error.code === 'IDEMPOTENCY_CONFLICT',
    'Reused idempotency key returned the wrong error code.',
  );

  await pool.query('UPDATE characters SET current_wp = current_wp - 1 WHERE id = $1', [actorId]);
  const stale = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${damageRevision}"`,
        'idempotency-key': `smoke-stale-${randomUUID()}`,
      },
      body: JSON.stringify({ reason: 'Stale write test', changes: [{ type: 'heal', amount: 1 }] }),
    },
  );
  assert(stale.response.status === 409, 'Stale revision did not return HTTP 409.');
  assert(stale.payload.error.code === 'REVISION_CONFLICT', 'Stale revision returned the wrong error code.');

  const refreshed = await api(`/api/v1/campaigns/${campaignId}/state`);
  const eventRevision = refreshed.payload.data.campaign.revision;
  const failedTransaction = await api(
    `/api/v1/campaigns/${campaignId}/actors/${actorId}/changes`,
    {
      method: 'POST',
      headers: {
        'if-match': `"${eventRevision}"`,
        'idempotency-key': `smoke-rollback-${randomUUID()}`,
      },
      body: JSON.stringify({
        reason: 'Atomic rollback test',
        changes: [
          { type: 'heal', amount: 1 },
          { type: 'spend_wp', amount: 999 },
        ],
      }),
    },
  );
  assert(failedTransaction.response.status === 400, 'Invalid atomic change set did not fail.');
  const afterFailedTransaction = await pool.query(
    'SELECT current_hp FROM characters WHERE id = $1',
    [actorId],
  );
  assert(afterFailedTransaction.rows[0].current_hp === 8, 'Failed atomic change set changed actor HP.');

  const appended = await api(`/api/v1/campaigns/${campaignId}/events`, {
    method: 'POST',
    headers: {
      'if-match': `"${eventRevision}"`,
      'idempotency-key': `smoke-event-${randomUUID()}`,
    },
    body: JSON.stringify({
      type: 'campaign.smoke_test',
      visibility: 'gm',
      payload: { disposable: true },
      reason: 'Automated Helper API integration test',
    }),
  });
  assert(appended.response.status === 200, `Event append failed: ${JSON.stringify(appended.payload)}`);

  const events = await api(`/api/v1/campaigns/${campaignId}/events?limit=10`);
  assert(events.payload.data.length === 2, 'Expected exactly one damage event and one narrative event.');
  assert(events.payload.data[0].sequence > events.payload.data[1].sequence, 'Events are not ordered newest first.');

  const playerToken = `smoke-player-${randomUUID()}`;
  const playerIdentity = randomUUID();
  await withTransaction(async (client) => {
    const player = await client.query(
      `INSERT INTO users (email, username, role)
       VALUES ($1, $2, 'player') RETURNING id`,
      [`${playerIdentity}@example.invalid`, `smoke-${playerIdentity}`],
    );
    playerUserId = player.rows[0].id;
    const playerCharacter = await client.query(
      `INSERT INTO characters (user_id, party_id, name)
       VALUES ($1, $2, 'Smoke Player') RETURNING id`,
      [playerUserId, campaignId],
    );
    await client.query(
      `INSERT INTO party_members (party_id, character_id, user_id)
       VALUES ($1, $2, $3)`,
      [campaignId, playerCharacter.rows[0].id, playerUserId],
    );
    await client.query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [createHash('sha256').update(playerToken).digest('hex'), playerUserId],
    );
  });
  const playerState = await api(`/api/v1/campaigns/${campaignId}/state`, {}, playerToken);
  assert(playerState.response.status === 200, 'Authenticated player could not read campaign state.');
  assert(!Object.hasOwn(playerState.payload.data, 'gmContext'), 'Player received GM-only context.');
  assert(playerState.payload.data.openThreads.length === 0, 'Player received GM-only open threads.');

  const openapi = await fetch(`${apiBaseUrl}/openapi.json`);
  assert(openapi.ok, 'OpenAPI document is unavailable.');

  if (mcpUrl) {
    mcpClient = new Client({ name: 'dragonbane-helper-smoke', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    await mcpClient.connect(transport);
    const tools = await mcpClient.listTools();
    assert(tools.tools.some(({ name }) => name === 'apply_actor_changes'), 'MCP modifying tool is missing.');
    const mcpState = await mcpClient.callTool({
      name: 'get_campaign_state',
      arguments: { campaign_id: campaignId },
    });
    assert(mcpState.structuredContent?.success === true, 'MCP campaign state call was not structured.');
  }

  console.log(JSON.stringify({
    success: true,
    checks: [
      'campaign state',
      'combat revision',
      'damage write',
      'idempotent replay',
      'idempotency conflict',
      'revision conflict',
      'atomic rollback',
      'append-only event sequence',
      'GM context isolation',
      'OpenAPI document',
      ...(mcpUrl ? ['MCP discovery and state call'] : []),
    ],
  }));
} finally {
  if (mcpClient) await mcpClient.close().catch(() => {});
  if (campaignId) await pool.query('DELETE FROM parties WHERE id = $1', [campaignId]).catch(() => {});
  if (playerUserId) await pool.query('DELETE FROM users WHERE id = $1', [playerUserId]).catch(() => {});
  await pool.end();
}
