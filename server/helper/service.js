import { createHash } from 'node:crypto';
import { pool, withTransaction } from '../db.js';
import {
  actorForOutput,
  combineConditions,
  loadActor,
  persistActor,
} from './actors.js';
import { requireCampaignAccess } from './auth.js';
import { HelperError } from './errors.js';
import { conditionId } from './identifiers.js';
import { applyActorChangeSet, validateActorCanAct } from './rules.js';

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
  sessionId = campaign.active_session_id,
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
      sessionId,
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

function sessionForOutput(row, { includeGm = false } = {}) {
  const session = {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    status: row.status,
    summary: row.summary,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startingRevision: row.starting_revision === null ? null : Number(row.starting_revision),
    endingRevision: row.ending_revision === null ? null : Number(row.ending_revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeGm) session.gmNotes = row.gm_notes;
  return session;
}

export async function listCampaigns(user, { status, limit, cursor }) {
  const values = [user.id];
  const clauses = [
    `(p.created_by = $1 OR $2::boolean OR EXISTS (
       SELECT 1 FROM campaign_memberships cm WHERE cm.party_id = p.id AND cm.user_id = $1
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
    `SELECT p.*, cm.role AS campaign_role
     FROM parties p
     LEFT JOIN campaign_memberships cm
       ON cm.party_id = p.id AND cm.user_id = $1
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
        : user.role === 'admin' ? 'gm' : campaign.campaign_role,
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

export async function getSessionHistory(user, campaignId, { limit = 20 } = {}) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const { rows } = await pool.query(
    `SELECT * FROM game_sessions
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [campaignId, limit],
  );
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    sessions: rows.map((row) => sessionForOutput(row, { includeGm: access.isGm })),
  };
}

export async function startSession(user, input, { sourceClient } = {}) {
  const operation = 'start_session';
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
    if (access.campaign.active_session_id) {
      throw new HelperError(409, 'INVALID_STATE', 'This campaign already has an active game session.');
    }
    const { rows: activeSessions } = await client.query(
      `SELECT id FROM game_sessions
       WHERE campaign_id = $1 AND status = 'active'
       LIMIT 1 FOR UPDATE`,
      [input.campaign_id],
    );
    if (activeSessions[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'This campaign already has an active game session.');
    }

    const resultingRevision = previousRevision + 1;
    const { rows } = await client.query(
      `INSERT INTO game_sessions (
         campaign_id, title, status, gm_notes, started_at, starting_revision, created_by
       ) VALUES ($1, $2, 'active', $3, now(), $4, $5)
       RETURNING *`,
      [input.campaign_id, input.title, input.gm_notes || null, previousRevision, user.id],
    );
    const session = rows[0];
    await client.query(
      `UPDATE parties
       SET active_session_id = $1,
         current_scene = COALESCE($2::jsonb, current_scene),
         helper_revision = $3
       WHERE id = $4`,
      [
        session.id,
        input.opening_scene === undefined ? null : JSON.stringify(input.opening_scene),
        resultingRevision,
        input.campaign_id,
      ],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sessionId: session.id,
      sequence,
      type: 'session.started',
      payload: {
        sessionId: session.id,
        title: session.title,
        ...(input.opening_scene === undefined ? {} : { openingScene: input.opening_scene }),
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${session.title} started.`,
      state_excerpt: {
        session: sessionForOutput(session, { includeGm: true }),
        campaign: {
          id: input.campaign_id,
          activeSessionId: session.id,
          currentScene: input.opening_scene ?? access.campaign.current_scene ?? {},
          openThreads: access.campaign.open_threads || [],
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

export async function completeSession(user, input, { sourceClient } = {}) {
  const operation = 'complete_session';
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
    if (access.campaign.active_session_id !== input.session_id) {
      throw new HelperError(409, 'INACTIVE_SESSION', 'The requested session is not active for this campaign.');
    }
    const { rows } = await client.query(
      `SELECT * FROM game_sessions
       WHERE id = $1 AND campaign_id = $2
       FOR UPDATE`,
      [input.session_id, input.campaign_id],
    );
    const session = rows[0];
    if (!session || session.status !== 'active') {
      throw new HelperError(409, 'INACTIVE_SESSION', 'The requested session is not active.');
    }

    const resultingRevision = previousRevision + 1;
    const { rows: completedRows } = await client.query(
      `UPDATE game_sessions
       SET status = 'completed', summary = $1, ended_at = now(), ending_revision = $2
       WHERE id = $3
       RETURNING *`,
      [input.summary, resultingRevision, input.session_id],
    );
    await client.query(
      `UPDATE parties
       SET active_session_id = NULL,
         open_threads = $1::jsonb,
         current_scene = COALESCE($2::jsonb, current_scene),
         helper_revision = $3
       WHERE id = $4`,
      [
        JSON.stringify(input.unresolved_threads),
        input.ending_scene === undefined ? null : JSON.stringify(input.ending_scene),
        resultingRevision,
        input.campaign_id,
      ],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sessionId: input.session_id,
      sequence,
      type: 'session.completed',
      payload: {
        sessionId: input.session_id,
        title: session.title,
        summary: input.summary,
        unresolvedThreads: input.unresolved_threads,
        ...(input.ending_scene === undefined ? {} : { endingScene: input.ending_scene }),
        reason: input.reason,
      },
      visibility: 'gm',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const completed = completedRows[0];
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${completed.title} completed and its campaign summary was saved.`,
      state_excerpt: {
        session: sessionForOutput(completed, { includeGm: true }),
        campaign: {
          id: input.campaign_id,
          activeSessionId: null,
          currentScene: input.ending_scene ?? access.campaign.current_scene ?? {},
          openThreads: input.unresolved_threads,
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

function participantActorId(row) {
  return row.character_id || row.id;
}

function orderedCombatants(rows) {
  return [...rows].sort((left, right) => {
    const leftInitiative = left.initiative_roll ?? Number.MAX_SAFE_INTEGER;
    const rightInitiative = right.initiative_roll ?? Number.MAX_SAFE_INTEGER;
    if (leftInitiative !== rightInitiative) return leftInitiative - rightInitiative;
    const created = String(left.created_at).localeCompare(String(right.created_at));
    return created || left.id.localeCompare(right.id);
  });
}

function currentCombatant(encounter, rows) {
  const ordered = orderedCombatants(rows);
  return ordered.find((row) => row.id === encounter.active_combatant_id)
    || ordered.find((row) => row.is_active_turn)
    || ordered.find((row) => row.current_hp > 0 && !row.has_acted)
    || null;
}

function combatForOutput(access, encounter, rows) {
  return {
    id: encounter.id,
    campaignId: encounter.party_id,
    name: encounter.name,
    status: encounter.status,
    round: encounter.current_round,
    activeActorId: rows.find((row) => row.id === encounter.active_combatant_id)?.character_id
      || encounter.active_combatant_id,
    revision: Number(encounter.helper_revision || 0),
    participants: orderedCombatants(rows).map((row) => ({
      id: row.id,
      actorId: participantActorId(row),
      name: row.display_name,
      type: row.is_player_character ? 'pc' : row.monster_id ? 'monster' : 'npc',
      initiative: row.initiative_roll,
      hp: { current: row.current_hp, max: row.max_hp },
      wp: { current: row.current_wp ?? 0, max: row.max_wp ?? 0 },
      conditions: access.isGm || row.is_player_character
        ? combineConditions(
          participantActorId(row),
          row.character_conditions,
          row.status_effects,
        )
        : [],
      hasActed: row.has_acted,
      isActiveTurn: row.is_active_turn || row.id === encounter.active_combatant_id,
      defeated: row.current_hp <= 0,
    })),
  };
}

async function loadCombatContext(client, campaignId, combatId, { forUpdate = false } = {}) {
  const values = [campaignId];
  let selector = `e.status = 'active'`;
  if (combatId) {
    values.push(combatId);
    selector = `e.id = $2`;
  }
  const { rows: encounters } = await client.query(
    `SELECT e.* FROM encounters e
     WHERE e.party_id = $1 AND ${selector}
     ORDER BY e.updated_at DESC
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE OF e' : ''}`,
    values,
  );
  const encounter = encounters[0];
  if (!encounter) return null;
  const { rows } = await client.query(
    `SELECT ec.*,
       c.conditions AS character_conditions,
       c.current_hp AS character_current_hp,
       c.max_hp AS character_max_hp,
       c.current_wp AS character_current_wp,
       c.max_wp AS character_max_wp
     FROM encounter_combatants ec
     LEFT JOIN characters c ON c.id = ec.character_id
     WHERE ec.encounter_id = $1
     ORDER BY ec.initiative_roll NULLS LAST, ec.created_at
     ${forUpdate ? 'FOR UPDATE OF ec' : ''}`,
    [encounter.id],
  );
  return { encounter, rows };
}

function requireCombatContext(context) {
  if (!context) throw new HelperError(404, 'NOT_FOUND', 'Combat encounter not found.');
  return context;
}

function assertCombatStatus(encounter, expectedStatus) {
  if (encounter.status !== expectedStatus) {
    throw new HelperError(
      409,
      expectedStatus === 'active' ? 'INACTIVE_COMBAT' : 'INVALID_STATE',
      `Combat encounter is ${encounter.status}, not ${expectedStatus}.`,
    );
  }
}

async function appendCombatLog(client, combatId, entry) {
  await client.query(
    `UPDATE encounters
     SET log = COALESCE(log, '[]'::jsonb) || jsonb_build_array($1::jsonb)
     WHERE id = $2`,
    [JSON.stringify(entry), combatId],
  );
}

async function combatStateFromContext(client, access, campaignId, combatId) {
  const context = requireCombatContext(await loadCombatContext(client, campaignId, combatId));
  return combatForOutput(access, context.encounter, context.rows);
}

export async function getCombatState(user, campaignId, combatId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const context = await loadCombatContext(pool, campaignId, combatId);
  return context ? combatForOutput(access, context.encounter, context.rows) : null;
}

function fixedMonsterFerocity(value) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

function resolvedMonsterFerocity(value, pcCount) {
  if (typeof value === 'string') {
    const normalized = value
      .toLowerCase()
      .replace(/[−–—]/g, '-')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized === 'no. of pcs-1 (min. 1)') return Math.max(1, Math.floor(pcCount) - 1);
  }
  return fixedMonsterFerocity(value);
}

function monsterStat(stats, upper, lower, fallback) {
  const parsed = Number(stats?.[upper] ?? stats?.[lower] ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export async function getEncounterSetupOptions(user, campaignId, {
  monsterSearch,
  monsterLimit = 50,
} = {}) {
  const access = await requireCampaignAccess(pool, user, campaignId, { gm: true });
  const search = String(monsterSearch || '').trim();
  const monsterValues = [];
  const monsterClauses = [];
  if (search) {
    monsterValues.push(`%${search}%`);
    monsterClauses.push(`(name ILIKE $1 OR COALESCE(category, '') ILIKE $1)`);
  }
  monsterValues.push(monsterLimit);
  const monsterLimitParameter = `$${monsterValues.length}`;
  const [charactersResult, encountersResult, monstersResult] = await Promise.all([
    pool.query(
      `SELECT id, name, kin, profession, current_hp, max_hp, current_wp, max_wp
       FROM characters
       WHERE party_id = $1
       ORDER BY name, id`,
      [campaignId],
    ),
    pool.query(
      `SELECT e.id, e.name, e.description, e.helper_revision, e.created_at,
         COUNT(ec.id)::integer AS participant_count
       FROM encounters e
       LEFT JOIN encounter_combatants ec ON ec.encounter_id = e.id
       WHERE e.party_id = $1 AND e.status = 'planning'
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [campaignId],
    ),
    pool.query(
      `SELECT id, name, description, category, stats
       FROM monsters
       ${monsterClauses.length ? `WHERE ${monsterClauses.join(' AND ')}` : ''}
       ORDER BY name, id
       LIMIT ${monsterLimitParameter}`,
      monsterValues,
    ),
  ]);
  const pcCount = charactersResult.rows.length;
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    characters: charactersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kin: row.kin,
      profession: row.profession,
      hp: { current: row.current_hp, max: row.max_hp },
      wp: { current: row.current_wp, max: row.max_wp },
    })),
    monsters: monstersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      hp: monsterStat(row.stats, 'HP', 'hp', 1),
      wp: monsterStat(row.stats, 'WP', 'wp', 0),
      ferocity: row.stats?.FEROCITY ?? row.stats?.ferocity ?? 1,
      resolvedFerocity: resolvedMonsterFerocity(
        row.stats?.FEROCITY ?? row.stats?.ferocity,
        pcCount,
      ),
    })),
    plannedEncounters: encountersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      revision: Number(row.helper_revision || 0),
      participantCount: Number(row.participant_count || 0),
      createdAt: row.created_at,
    })),
  };
}

export async function createEncounter(user, input, { sourceClient } = {}) {
  const operation = 'create_encounter';
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
    const { rows } = await client.query(
      `INSERT INTO encounters (party_id, name, description, status, current_round, log)
       VALUES ($1, $2, $3, 'planning', 0, '[]'::jsonb)
       RETURNING *`,
      [input.campaign_id, input.name, input.description || null],
    );
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'combat.created',
      payload: {
        combatId: rows[0].id,
        combatName: rows[0].name,
        description: rows[0].description,
        reason: input.reason,
      },
      visibility: 'gm',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const combat = await combatStateFromContext(client, access, input.campaign_id, rows[0].id);
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${rows[0].name} was created as a planned encounter.`,
      state_excerpt: { combat },
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

export async function addEncounterParticipants(user, input, { sourceClient } = {}) {
  const operation = 'add_encounter_participants';
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
    const context = requireCombatContext(await loadCombatContext(
      client,
      input.campaign_id,
      input.combat_id,
      { forUpdate: true },
    ));
    assertCombatStatus(context.encounter, 'planning');

    const characterIds = input.character_ids;
    const { rows: characters } = characterIds.length
      ? await client.query(
        `SELECT id, name, current_hp, max_hp, current_wp, max_wp
         FROM characters WHERE party_id = $1 AND id = ANY($2::uuid[])
         ORDER BY name, id`,
        [input.campaign_id, characterIds],
      )
      : { rows: [] };
    if (characters.length !== characterIds.length) {
      throw new HelperError(
        400,
        'VALIDATION_ERROR',
        'Every selected character must belong to this campaign.',
      );
    }
    const existingCharacterIds = new Set(
      context.rows.filter((row) => row.character_id).map((row) => row.character_id),
    );
    const duplicateCharacter = characters.find((character) => existingCharacterIds.has(character.id));
    if (duplicateCharacter) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        `${duplicateCharacter.name} is already in this encounter.`,
      );
    }

    const selectedMonsterIds = [...new Set(input.monsters.map((entry) => entry.monster_id))];
    const { rows: monsters } = selectedMonsterIds.length
      ? await client.query(
        `SELECT id, name, stats FROM monsters WHERE id = ANY($1::uuid[])`,
        [selectedMonsterIds],
      )
      : { rows: [] };
    if (monsters.length !== selectedMonsterIds.length) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'One or more selected monsters do not exist.');
    }
    const monstersById = new Map(monsters.map((monster) => [monster.id, monster]));
    const pcCount = context.rows.filter((row) => row.is_player_character).length + characters.length;
    const expandedMonsters = input.monsters.flatMap((selection) => {
      const monster = monstersById.get(selection.monster_id);
      const ferocity = selection.use_ferocity
        ? resolvedMonsterFerocity(monster.stats?.FEROCITY ?? monster.stats?.ferocity, pcCount)
        : 1;
      const baseName = selection.custom_name || monster.name;
      return Array.from({ length: selection.count }, (_, creatureIndex) => {
        const creatureName = selection.count > 1
          ? `${baseName} ${creatureIndex + 1}`
          : baseName;
        return Array.from({ length: ferocity }, (_, actionIndex) => ({
          monster,
          displayName: ferocity > 1 ? `${creatureName} (Act ${actionIndex + 1})` : creatureName,
        }));
      }).flat();
    });
    if (context.rows.length + characters.length + expandedMonsters.length > 100) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'An encounter may contain at most 100 participants.');
    }

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    const addedRows = [];
    for (const character of characters) {
      const { rows } = await client.query(
        `INSERT INTO encounter_combatants (
           encounter_id, character_id, is_player_character, display_name,
           current_hp, max_hp, current_wp, max_wp, initiative_roll
         ) VALUES ($1, $2, true, $3, $4, $5, $6, $7, NULL)
         RETURNING *`,
        [
          input.combat_id,
          character.id,
          character.name,
          character.current_hp,
          character.max_hp,
          character.current_wp,
          character.max_wp,
        ],
      );
      addedRows.push(rows[0]);
    }
    for (const selection of expandedMonsters) {
      const maxHp = monsterStat(selection.monster.stats, 'HP', 'hp', 1);
      const maxWp = monsterStat(selection.monster.stats, 'WP', 'wp', 0);
      const { rows } = await client.query(
        `INSERT INTO encounter_combatants (
           encounter_id, monster_id, is_player_character, display_name,
           current_hp, max_hp, current_wp, max_wp, initiative_roll
         ) VALUES ($1, $2, false, $3, $4, $4, $5, $5, NULL)
         RETURNING *`,
        [input.combat_id, selection.monster.id, selection.displayName, maxHp, maxWp],
      );
      addedRows.push(rows[0]);
    }
    await client.query(
      'UPDATE encounters SET helper_revision = $1 WHERE id = $2',
      [resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: 'participants_added',
      ts: Date.now(),
      participantActorIds: addedRows.map(participantActorId),
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'combat.participants_added',
      payload: {
        combatId: input.combat_id,
        participantActorIds: addedRows.map(participantActorId),
        participantNames: addedRows.map((row) => row.display_name),
        reason: input.reason,
      },
      visibility: 'gm',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const combat = await combatStateFromContext(client, access, input.campaign_id, input.combat_id);
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `Added ${addedRows.length} participant${addedRows.length === 1 ? '' : 's'} to ${context.encounter.name}.`,
      state_excerpt: {
        added_actor_ids: addedRows.map(participantActorId),
        combat,
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

export async function removeEncounterParticipant(user, input, { sourceClient } = {}) {
  const operation = 'remove_encounter_participant';
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
    const context = requireCombatContext(await loadCombatContext(
      client,
      input.campaign_id,
      input.combat_id,
      { forUpdate: true },
    ));
    assertCombatStatus(context.encounter, 'planning');
    const participant = context.rows.find((row) => participantActorId(row) === input.actor_id);
    if (!participant) {
      throw new HelperError(404, 'NOT_FOUND', 'Encounter participant not found.');
    }

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query('DELETE FROM encounter_combatants WHERE id = $1', [participant.id]);
    await client.query(
      'UPDATE encounters SET helper_revision = $1 WHERE id = $2',
      [resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: 'participant_removed',
      ts: Date.now(),
      participantActorId: input.actor_id,
      participantName: participant.display_name,
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'combat.participant_removed',
      actorId: input.actor_id,
      payload: {
        combatId: input.combat_id,
        participantName: participant.display_name,
        reason: input.reason,
      },
      visibility: 'gm',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const combat = await combatStateFromContext(client, access, input.campaign_id, input.combat_id);
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${participant.display_name} was removed from ${context.encounter.name}.`,
      state_excerpt: { combat },
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

export async function getCampaignState(user, campaignId, { recentEventLimit = 20 } = {}) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const campaign = campaignForOutput(access.campaign, access.role);
  const { rows: sessions } = access.campaign.active_session_id
    ? await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1',
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
    activeSession: sessions[0]
      ? sessionForOutput(sessions[0], { includeGm: access.isGm })
      : null,
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
    const access = await requireCampaignAccess(client, user, input.campaign_id, { write: true });

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

export async function startCombat(user, input, { sourceClient } = {}) {
  const operation = 'start_combat';
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
    const context = requireCombatContext(await loadCombatContext(
      client,
      input.campaign_id,
      input.combat_id,
      { forUpdate: true },
    ));
    assertCombatStatus(context.encounter, 'planning');
    if (context.rows.length === 0) {
      throw new HelperError(409, 'INVALID_STATE', 'Combat cannot start without participants.');
    }

    const { rows: otherActive } = await client.query(
      `SELECT id FROM encounters
       WHERE party_id = $1 AND status = 'active' AND id <> $2
       LIMIT 1`,
      [input.campaign_id, input.combat_id],
    );
    if (otherActive[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'Another combat encounter is already active.');
    }

    const participantsByActor = new Map(
      context.rows.map((row) => [participantActorId(row), row]),
    );
    for (const assignment of input.initiatives) {
      if (!participantsByActor.has(assignment.actor_id)) {
        throw new HelperError(
          400,
          'VALIDATION_ERROR',
          `Initiative actor ${assignment.actor_id} is not a participant in this combat.`,
        );
      }
    }
    const initiatives = new Map(
      input.initiatives.map((assignment) => [assignment.actor_id, assignment.initiative]),
    );
    const preparedRows = context.rows.map((row) => ({
      ...row,
      initiative_roll: initiatives.get(participantActorId(row)) ?? row.initiative_roll,
      current_hp: row.character_id
        ? row.character_current_hp ?? row.current_hp
        : row.current_hp,
      max_hp: row.character_id
        ? row.character_max_hp ?? row.max_hp
        : row.max_hp,
      current_wp: row.character_id
        ? row.character_current_wp ?? row.current_wp
        : row.current_wp,
      max_wp: row.character_id
        ? row.character_max_wp ?? row.max_wp
        : row.max_wp,
      has_acted: false,
      is_active_turn: false,
    }));
    const first = orderedCombatants(preparedRows).find((row) => row.current_hp > 0);
    if (!first) {
      throw new HelperError(409, 'INVALID_STATE', 'Combat cannot start because every participant is defeated.');
    }

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query(
      `UPDATE encounter_combatants ec
       SET current_hp = c.current_hp, max_hp = c.max_hp,
         current_wp = c.current_wp, max_wp = c.max_wp
       FROM characters c
       WHERE ec.encounter_id = $1 AND ec.character_id = c.id`,
      [input.combat_id],
    );
    for (const assignment of input.initiatives) {
      await client.query(
        `UPDATE encounter_combatants
         SET initiative_roll = $1
         WHERE encounter_id = $2 AND (id = $3 OR character_id = $3)`,
        [assignment.initiative, input.combat_id, assignment.actor_id],
      );
    }
    await client.query(
      `UPDATE encounter_combatants
       SET has_acted = false, is_active_turn = (id = $2)
       WHERE encounter_id = $1`,
      [input.combat_id, first.id],
    );
    await client.query(
      `UPDATE encounters
       SET status = 'active', current_round = 1, active_combatant_id = $1,
         helper_revision = $2
       WHERE id = $3`,
      [first.id, resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: 'combat_started',
      ts: Date.now(),
      round: 1,
      activeActorId: participantActorId(first),
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );

    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'combat.started',
      actorId: participantActorId(first),
      payload: {
        combatId: input.combat_id,
        combatName: context.encounter.name,
        round: 1,
        participantActorIds: orderedCombatants(preparedRows).map(participantActorId),
        initiatives: Object.fromEntries(
          orderedCombatants(preparedRows).map((row) => [participantActorId(row), row.initiative_roll]),
        ),
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const combat = await combatStateFromContext(
      client,
      access,
      input.campaign_id,
      input.combat_id,
    );
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${context.encounter.name} started. Round 1 begins with ${first.display_name}.`,
      state_excerpt: { combat },
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

export async function resolveGameAction(user, input, { sourceClient } = {}) {
  const operation = 'resolve_game_action';
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
    const context = requireCombatContext(await loadCombatContext(
      client,
      input.campaign_id,
      input.combat_id,
      { forUpdate: true },
    ));
    assertCombatStatus(context.encounter, 'active');
    const active = currentCombatant(context.encounter, context.rows);
    if (!active) {
      throw new HelperError(409, 'INVALID_STATE', 'Combat has no actor available to act.');
    }
    if (participantActorId(active) !== input.actor_id) {
      throw new HelperError(
        409,
        'NOT_ACTORS_TURN',
        `It is ${active.display_name}'s turn, not the requested actor's turn.`,
        { activeActorId: participantActorId(active), requestedActorId: input.actor_id },
      );
    }

    const participantsByActor = new Map(
      context.rows.map((row) => [participantActorId(row), row]),
    );
    for (const effect of input.effects) {
      if (!participantsByActor.has(effect.actor_id)) {
        throw new HelperError(
          400,
          'VALIDATION_ERROR',
          `Effect actor ${effect.actor_id} is not a participant in this combat.`,
        );
      }
    }

    const loadedActors = new Map();
    const acting = await loadActor(client, input.campaign_id, input.actor_id, {
      forUpdate: true,
      combatId: input.combat_id,
    });
    validateActorCanAct(acting.actor);
    loadedActors.set(input.actor_id, acting);
    const resolutions = [];
    for (const effect of input.effects) {
      const loaded = loadedActors.get(effect.actor_id)
        || await loadActor(client, input.campaign_id, effect.actor_id, {
          forUpdate: true,
          combatId: input.combat_id,
        });
      loadedActors.set(effect.actor_id, loaded);
      const resolution = applyActorChangeSet(loaded.actor, effect.changes, conditionId);
      resolutions.push({ actorId: effect.actor_id, storage: loaded.storage, resolution });
      loadedActors.set(effect.actor_id, { actor: resolution.result, storage: loaded.storage });
    }

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    for (const item of resolutions) {
      await persistActor(client, item.resolution.result, item.storage);
    }
    if (input.consume_turn) {
      await client.query(
        `UPDATE encounter_combatants
         SET has_acted = true
         WHERE id = $1 AND encounter_id = $2`,
        [active.id, input.combat_id],
      );
    }
    await client.query(
      'UPDATE encounters SET helper_revision = $1 WHERE id = $2',
      [resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: 'action_resolved',
      ts: Date.now(),
      round: context.encounter.current_round,
      actorId: input.actor_id,
      actorName: active.display_name,
      action: input.action,
      outcome: input.outcome,
      consumeTurn: input.consume_turn,
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );

    let sequence = await nextEventSequence(client, input.campaign_id);
    const eventIds = [];
    for (const item of resolutions) {
      for (const event of item.resolution.events) {
        eventIds.push(await insertEvent(client, {
          campaign: access.campaign,
          user,
          sequence,
          type: event.type,
          actorId: item.actorId,
          payload: {
            ...event.payload,
            combatId: input.combat_id,
            actingActorId: input.actor_id,
            action: input.action,
            outcome: input.outcome,
            reason: input.reason,
            warnings: item.resolution.warnings,
          },
          visibility: 'players',
          sourceClient,
          idempotencyKey: input.idempotency_key,
          previousRevision,
          resultingRevision,
        }));
        sequence += 1;
      }
    }
    eventIds.push(await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'combat.action_resolved',
      actorId: input.actor_id,
      payload: {
        combatId: input.combat_id,
        round: context.encounter.current_round,
        action: input.action,
        outcome: input.outcome,
        consumeTurn: input.consume_turn,
        affectedActorIds: resolutions.map((item) => item.actorId),
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    }));

    const combat = await combatStateFromContext(
      client,
      access,
      input.campaign_id,
      input.combat_id,
    );
    const effectSummary = resolutions
      .map((item) => item.resolution.explanation)
      .filter(Boolean)
      .join(' ');
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: eventIds,
      summary: `${active.display_name}: ${input.action} — ${input.outcome}.${effectSummary ? ` ${effectSummary}` : ''}`,
      state_excerpt: {
        combat,
        warnings: resolutions.flatMap((item) => item.resolution.warnings),
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

export async function advanceCombatTurn(user, input, { sourceClient } = {}) {
  const operation = 'advance_combat_turn';
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
    const context = requireCombatContext(await loadCombatContext(
      client,
      input.campaign_id,
      input.combat_id,
      { forUpdate: true },
    ));
    assertCombatStatus(context.encounter, 'active');
    const active = currentCombatant(context.encounter, context.rows);
    if (active && active.current_hp > 0 && !active.has_acted) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        `${active.display_name} has not resolved or skipped the current turn.`,
        { activeActorId: participantActorId(active) },
      );
    }

    const afterCurrent = context.rows.map((row) => (
      active && row.id === active.id && row.current_hp <= 0 ? { ...row, has_acted: true } : row
    ));
    let round = context.encounter.current_round;
    let next = orderedCombatants(afterCurrent).find((row) => row.current_hp > 0 && !row.has_acted);
    let startedNewRound = false;
    if (!next) {
      const living = orderedCombatants(afterCurrent).filter((row) => row.current_hp > 0);
      if (living.length === 0) {
        throw new HelperError(409, 'INVALID_STATE', 'No living combatant remains. End the combat instead.');
      }
      round += 1;
      startedNewRound = true;
      next = living[0];
    }

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    if (startedNewRound) {
      await client.query(
        `UPDATE encounter_combatants
         SET has_acted = false, is_active_turn = (id = $2)
         WHERE encounter_id = $1`,
        [input.combat_id, next.id],
      );
    } else {
      if (active && active.current_hp <= 0 && !active.has_acted) {
        await client.query(
          'UPDATE encounter_combatants SET has_acted = true WHERE id = $1',
          [active.id],
        );
      }
      await client.query(
        `UPDATE encounter_combatants
         SET is_active_turn = (id = $2)
         WHERE encounter_id = $1`,
        [input.combat_id, next.id],
      );
    }
    await client.query(
      `UPDATE encounters
       SET current_round = $1, active_combatant_id = $2, helper_revision = $3
       WHERE id = $4`,
      [round, next.id, resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: startedNewRound ? 'round_advanced' : 'turn_advanced',
      ts: Date.now(),
      round,
      previousActorId: active ? participantActorId(active) : null,
      activeActorId: participantActorId(next),
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );

    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: startedNewRound ? 'combat.round_started' : 'combat.turn_advanced',
      actorId: participantActorId(next),
      targetId: active ? participantActorId(active) : null,
      payload: {
        combatId: input.combat_id,
        round,
        previousActorId: active ? participantActorId(active) : null,
        activeActorId: participantActorId(next),
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const combat = await combatStateFromContext(
      client,
      access,
      input.campaign_id,
      input.combat_id,
    );
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: startedNewRound
        ? `Round ${round} started. ${next.display_name} acts first.`
        : `The turn advanced to ${next.display_name}.`,
      state_excerpt: { combat },
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

export async function endCombat(user, input, { sourceClient } = {}) {
  const operation = 'end_combat';
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
    const context = requireCombatContext(await loadCombatContext(
      client,
      input.campaign_id,
      input.combat_id,
      { forUpdate: true },
    ));
    assertCombatStatus(context.encounter, 'active');

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query(
      `UPDATE encounter_combatants
       SET is_active_turn = false
       WHERE encounter_id = $1`,
      [input.combat_id],
    );
    await client.query(
      `UPDATE encounters
       SET status = 'completed', active_combatant_id = NULL, helper_revision = $1
       WHERE id = $2`,
      [resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: 'combat_ended',
      ts: Date.now(),
      round: context.encounter.current_round,
      outcome: input.outcome,
      summary: input.summary,
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );

    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'combat.ended',
      payload: {
        combatId: input.combat_id,
        combatName: context.encounter.name,
        finalRound: context.encounter.current_round,
        outcome: input.outcome,
        summary: input.summary,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const combat = await combatStateFromContext(
      client,
      access,
      input.campaign_id,
      input.combat_id,
    );
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${context.encounter.name} ended with outcome: ${input.outcome}. ${input.summary}`,
      state_excerpt: { combat },
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
