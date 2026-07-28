import { createHash } from 'node:crypto';
import { pool, withTransaction } from '../db.js';
import { actorForOutput, loadActor, persistActor } from './actors.js';
import { requireCampaignAccess } from './auth.js';
import { HelperError } from './errors.js';
import { conditionId } from './identifiers.js';
import { applyActorChangeSet } from './rules.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function requestHash(operation, value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ operation, value })))
    .digest('hex');
}

function campaignForOutput(campaign, role) {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    system: 'dragonbane',
    rulesVersion: campaign.rules_version,
    status: campaign.helper_status,
    activeSessionId: campaign.active_session_id,
    currentScene: campaign.current_scene || {},
    gameTime: campaign.game_time || {},
    revision: Number(campaign.helper_revision || 0),
    role,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
  };
}

async function idempotentResult(client, user, campaignId, key, operation, input) {
  const hash = requestHash(operation, input);
  const { rows } = await client.query(
    `SELECT request_hash, response_body
     FROM helper_idempotency_keys
     WHERE campaign_id = $1 AND user_id = $2 AND idempotency_key = $3`,
    [campaignId, user.id, key],
  );
  if (!rows[0]) return { hash, response: null };
  if (rows[0].request_hash !== hash) {
    throw new HelperError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This idempotency key has already been used with different arguments.',
    );
  }
  return { hash, response: rows[0].response_body };
}

async function storeIdempotentResult(client, {
  campaignId,
  userId,
  key,
  operation,
  hash,
  response,
}) {
  await client.query(
    `INSERT INTO helper_idempotency_keys (
       campaign_id, user_id, idempotency_key, operation,
       request_hash, response_status, response_body
     ) VALUES ($1, $2, $3, $4, $5, 200, $6::jsonb)`,
    [campaignId, userId, key, operation, hash, JSON.stringify(response)],
  );
}

function assertRevision(campaign, expectedRevision) {
  const current = Number(campaign.helper_revision || 0);
  if (current !== expectedRevision) {
    throw new HelperError(
      409,
      'REVISION_CONFLICT',
      `Campaign revision is ${current}, not ${expectedRevision}. Read the current state and reassess the action.`,
      { expectedRevision, currentRevision: current },
    );
  }
  return current;
}

function assertCampaignWritable(campaign) {
  if (!['active', 'paused'].includes(campaign.helper_status)) {
    throw new HelperError(409, 'INACTIVE_CAMPAIGN', 'The campaign is not active or paused.');
  }
}

async function nextEventSequence(client, campaignId) {
  const { rows } = await client.query(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM campaign_events WHERE campaign_id = $1',
    [campaignId],
  );
  return Number(rows[0].sequence);
}

async function insertEvent(client, {
  campaign,
  user,
  sequence,
  type,
  actorId = null,
  targetId = null,
  payload = {},
  visibility = 'gm',
  sourceClient,
  sourceConversationId = null,
  idempotencyKey,
  previousRevision,
  resultingRevision,
}) {
  const { rows } = await client.query(
    `INSERT INTO campaign_events (
       campaign_id, session_id, sequence, type, actor_id, target_id, payload,
       visibility, source_type, source_user_id, source_client,
       source_conversation_id, idempotency_key, previous_revision, resulting_revision
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::jsonb,
       $8, $9, $10, $11, $12, $13, $14, $15
     ) RETURNING id`,
    [
      campaign.id,
      campaign.active_session_id,
      sequence,
      type,
      actorId,
      targetId,
      JSON.stringify(payload),
      visibility,
      sourceClient === 'dragonbane-mcp' ? 'chatgpt' : 'user',
      user.id,
      sourceClient || 'dragonbane-rest',
      sourceConversationId,
      idempotencyKey,
      previousRevision,
      resultingRevision,
    ],
  );
  return rows[0].id;
}

async function eventRows(client, access, campaignId, filters) {
  const values = [campaignId];
  const clauses = ['campaign_id = $1'];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.afterSequence !== undefined) add('sequence > ?', filters.afterSequence);
  if (filters.beforeSequence !== undefined) add('sequence < ?', filters.beforeSequence);
  if (filters.type) add('type = ?', filters.type);
  if (filters.actorId) {
    values.push(filters.actorId);
    clauses.push(`(actor_id = $${values.length} OR target_id = $${values.length})`);
  }
  if (filters.sessionId) add('session_id = ?', filters.sessionId);
  if (!access.isGm) clauses.push(`visibility IN ('public', 'players')`);
  values.push(filters.limit);
  const { rows } = await client.query(
    `SELECT id, campaign_id, session_id, sequence, type, actor_id, target_id,
       payload, visibility, source_type, previous_revision, resulting_revision, created_at
     FROM campaign_events
     WHERE ${clauses.join(' AND ')}
     ORDER BY sequence DESC
     LIMIT $${values.length}`,
    values,
  );
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    sequence: Number(row.sequence),
    type: row.type,
    actorId: row.actor_id,
    targetId: row.target_id,
    payload: row.payload,
    visibility: row.visibility,
    sourceType: row.source_type,
    previousRevision: Number(row.previous_revision),
    resultingRevision: Number(row.resulting_revision),
    createdAt: row.created_at,
  }));
}

export async function listCampaigns(user, { status, limit, cursor }) {
  const values = [user.id];
  const clauses = [
    `(p.created_by = $1 OR $2::boolean OR EXISTS (
       SELECT 1 FROM party_members pm WHERE pm.party_id = p.id AND pm.user_id = $1
     ))`,
  ];
  values.push(user.role === 'admin');
  if (status) {
    values.push(status);
    clauses.push(`p.helper_status = $${values.length}`);
  }
  if (cursor) {
    values.push(cursor);
    clauses.push(`p.id > $${values.length}`);
  }
  values.push(limit);
  const { rows } = await pool.query(
    `SELECT p.*,
       EXISTS (
         SELECT 1 FROM party_members pm WHERE pm.party_id = p.id AND pm.user_id = $1
       ) AS is_member
     FROM parties p
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.id
     LIMIT $${values.length}`,
    values,
  );
  return {
    campaigns: rows.map((campaign) => campaignForOutput(
      campaign,
      campaign.created_by === user.id
        ? 'owner'
        : user.role === 'admin' || (campaign.is_member && user.role === 'dm') ? 'gm' : 'player',
    )),
    nextCursor: rows.length === limit ? rows.at(-1).id : null,
  };
}

export async function getActor(user, campaignId, actorId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const { actor } = await loadActor(pool, campaignId, actorId);
  return actorForOutput(actor, { includeGm: access.isGm });
}

export async function listActors(user, campaignId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const { rows } = await pool.query(
    `SELECT id AS actor_id FROM characters WHERE party_id = $1
     UNION ALL
     SELECT ec.id AS actor_id
     FROM encounter_combatants ec
     JOIN encounters e ON e.id = ec.encounter_id
     WHERE e.party_id = $1 AND e.status = 'active' AND ec.character_id IS NULL`,
    [campaignId],
  );
  const actors = [];
  for (const row of rows) {
    const { actor } = await loadActor(pool, campaignId, row.actor_id);
    actors.push(actorForOutput(actor, { includeGm: access.isGm }));
  }
  return actors;
}

export async function getRecentEvents(user, campaignId, filters = {}) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  return eventRows(pool, access, campaignId, {
    ...filters,
    limit: filters.limit || 20,
  });
}

export async function getCombatState(user, campaignId, combatId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const values = [campaignId];
  let selector = `e.status = 'active'`;
  if (combatId) {
    values.push(combatId);
    selector = `e.id = $2`;
  }
  const { rows: encounters } = await pool.query(
    `SELECT e.* FROM encounters e
     WHERE e.party_id = $1 AND ${selector}
     ORDER BY e.updated_at DESC
     LIMIT 1`,
    values,
  );
  const encounter = encounters[0];
  if (!encounter) return null;
  const { rows } = await pool.query(
    `SELECT * FROM encounter_combatants
     WHERE encounter_id = $1
     ORDER BY initiative_roll NULLS LAST, created_at`,
    [encounter.id],
  );
  return {
    id: encounter.id,
    campaignId,
    name: encounter.name,
    status: encounter.status,
    round: encounter.current_round,
    activeActorId: rows.find((row) => row.id === encounter.active_combatant_id)?.character_id
      || encounter.active_combatant_id,
    revision: Number(encounter.helper_revision || 0),
    participants: rows.map((row) => ({
      id: row.id,
      actorId: row.character_id || row.id,
      name: row.display_name,
      type: row.is_player_character ? 'pc' : row.monster_id ? 'monster' : 'npc',
      initiative: row.initiative_roll,
      hp: { current: row.current_hp, max: row.max_hp },
      wp: { current: row.current_wp ?? 0, max: row.max_wp ?? 0 },
      conditions: access.isGm || row.is_player_character
        ? row.status_effects || []
        : [],
      hasActed: row.has_acted,
      isActiveTurn: row.is_active_turn || row.id === encounter.active_combatant_id,
      defeated: row.current_hp <= 0,
    })),
  };
}

export async function getCampaignState(user, campaignId, { recentEventLimit = 20 } = {}) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const campaign = campaignForOutput(access.campaign, access.role);
  const { rows: sessions } = access.campaign.active_session_id
    ? await pool.query(
      `SELECT id, campaign_id, title, status, summary, started_at, ended_at,
         starting_revision, ending_revision
       FROM game_sessions WHERE id = $1`,
      [access.campaign.active_session_id],
    )
    : { rows: [] };
  const [characters, combat, recentEvents] = await Promise.all([
    listActors(user, campaignId),
    getCombatState(user, campaignId),
    eventRows(pool, access, campaignId, { limit: recentEventLimit }),
  ]);
  const result = {
    campaign,
    activeSession: sessions[0] ? {
      id: sessions[0].id,
      campaignId: sessions[0].campaign_id,
      title: sessions[0].title,
      status: sessions[0].status,
      summary: sessions[0].summary,
      startedAt: sessions[0].started_at,
      endedAt: sessions[0].ended_at,
      startingRevision: sessions[0].starting_revision === null
        ? null
        : Number(sessions[0].starting_revision),
      endingRevision: sessions[0].ending_revision === null
        ? null
        : Number(sessions[0].ending_revision),
    } : null,
    scene: access.campaign.current_scene || {},
    actors: characters,
    combat,
    recentEvents,
    openThreads: access.isGm ? access.campaign.open_threads || [] : [],
  };
  if (access.isGm) result.gmContext = access.campaign.gm_context || {};
  return result;
}

export async function applyActorChanges(user, input, { sourceClient } = {}) {
  const operation = 'apply_actor_changes';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id);

    const idem = await idempotentResult(
      client,
      user,
      input.campaign_id,
      input.idempotency_key,
      operation,
      input,
    );
    if (idem.response) return idem.response;

    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const { actor, storage } = await loadActor(
      client,
      input.campaign_id,
      input.actor_id,
      { forUpdate: true },
    );
    if (!access.isGm && (storage.type !== 'character' || storage.row.user_id !== user.id)) {
      throw new HelperError(403, 'PERMISSION_DENIED', 'Players may only modify their own character.');
    }

    const resolution = applyActorChangeSet(actor, input.changes, conditionId);
    const resultingRevision = previousRevision + 1;
    resolution.result.revision = resultingRevision;

    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await persistActor(client, resolution.result, storage);
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );

    let sequence = await nextEventSequence(client, input.campaign_id);
    const eventIds = [];
    for (const event of resolution.events) {
      eventIds.push(await insertEvent(client, {
        campaign: access.campaign,
        user,
        sequence,
        type: event.type,
        actorId: input.actor_id,
        payload: {
          ...event.payload,
          reason: input.reason,
          warnings: resolution.warnings,
        },
        visibility: 'players',
        sourceClient,
        idempotencyKey: input.idempotency_key,
        previousRevision,
        resultingRevision,
      }));
      sequence += 1;
    }

    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: eventIds,
      summary: resolution.explanation,
      state_excerpt: {
        actor: actorForOutput(resolution.result, { includeGm: access.isGm }),
        warnings: resolution.warnings,
      },
    };
    await storeIdempotentResult(client, {
      campaignId: input.campaign_id,
      userId: user.id,
      key: input.idempotency_key,
      operation,
      hash: idem.hash,
      response,
    });
    return response;
  });
}

export async function appendCampaignEvent(user, input, { sourceClient } = {}) {
  const operation = 'append_campaign_event';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(
      client,
      user,
      input.campaign_id,
      input.idempotency_key,
      operation,
      input,
    );
    if (idem.response) return idem.response;

    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const resultingRevision = previousRevision + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: input.type,
      actorId: input.actor_id,
      targetId: input.target_id,
      payload: { ...input.payload, reason: input.reason },
      visibility: input.visibility,
      sourceClient,
      sourceConversationId: input.source_conversation_id,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `Campaign event "${input.type}" was recorded.`,
      state_excerpt: {
        event: {
          id: eventId,
          sequence,
          type: input.type,
          actorId: input.actor_id || null,
          targetId: input.target_id || null,
          visibility: input.visibility,
        },
      },
    };
    await storeIdempotentResult(client, {
      campaignId: input.campaign_id,
      userId: user.id,
      key: input.idempotency_key,
      operation,
      hash: idem.hash,
      response,
    });
    return response;
  });
}
