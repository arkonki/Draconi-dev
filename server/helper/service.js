import { createHash } from 'node:crypto';
import { pool, withReadSnapshot, withTransaction } from '../db.js';
import {
  advanceEquipmentTime,
  actorForOutput,
  combineConditions,
  loadActor,
  normalizeCharacterEquipment,
  persistActor,
} from './actors.js';
import { requireCampaignAccess } from './auth.js';
import { HelperError } from './errors.js';
import { conditionId } from './identifiers.js';
import { applyActorChangeSet, consumeRalliedAction, validateActorCanAct } from './rules.js';
import {
  parseTrustedDiceExpression,
  resolveTrustedManualRoll,
  resolveTrustedServerRoll,
} from './trustedRolls.js';
import {
  advanceSoloInjuryRecovery,
  advanceThreatState,
  resolveExplorationFind,
  resolveAlternativeReturnRoute,
  resolveFortune,
  resolveInspiration,
  resolveNarrativeDamage,
  resolveRandomLocation,
  resolveSevereInjury,
  resolveSoloCriticalEffect,
  resolveSoloDyingAction as resolveSoloDyingActionRoll,
  resolveSoloInjuryTreatment,
  resolveSoloRest,
  resolveSoloAdvancement as resolveSoloAdvancementRoll,
  resolveSoloSkillCheck,
  secureRollDie,
} from './soloRules.js';

const STANDARD_CONDITION_KEYS = new Set([
  'exhausted',
  'sickly',
  'dazed',
  'angry',
  'scared',
  'disheartened',
]);
const SOLO_REST_SECONDS = { round: 10, stretch: 15 * 60, shift: 6 * 60 * 60 };
const ACTIVE_SOLO_PROMPT_TABLE_VERSION = 'user-solo-v1';
const ACTIVE_SOLO_EXPLORATION_TABLE_VERSION = 'user-solo-v1';
const SOLO_LOCATION_TABLE_KEYS = [
  'solo_location_detail',
  'solo_location_contents',
  'solo_location_environment',
  'solo_location_oddity',
  'solo_location_danger',
];

function gameTimeForOutput(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const elapsedSeconds = Number.isFinite(Number(source.elapsedSeconds))
    ? Math.max(0, Math.floor(Number(source.elapsedSeconds)))
    : 0;
  return {
    ...source,
    schemaVersion: 'game-time-v1',
    elapsedSeconds,
    rounds: Math.floor(elapsedSeconds / 10),
    stretches: Math.floor(elapsedSeconds / (15 * 60)),
    shifts: Math.floor(elapsedSeconds / (6 * 60 * 60)),
  };
}

function advanceGameTime(value, seconds, lastAdvance) {
  const current = gameTimeForOutput(value);
  return gameTimeForOutput({
    ...current,
    elapsedSeconds: current.elapsedSeconds + seconds,
    lastAdvance: { ...lastAdvance, seconds, at: new Date().toISOString() },
  });
}

async function advanceCampaignEquipmentTime(client, campaignId, elapsedSeconds) {
  const { rows } = await client.query(
    'SELECT id, equipment FROM characters WHERE party_id = $1 FOR UPDATE',
    [campaignId],
  );
  const changes = [];
  for (const row of rows) {
    const result = advanceEquipmentTime(row.equipment || {}, elapsedSeconds);
    if (result.changes.length === 0) continue;
    await client.query(
      'UPDATE characters SET equipment = $1::jsonb WHERE id = $2',
      [JSON.stringify(result.document), row.id],
    );
    changes.push(...result.changes.map((change) => ({ characterId: row.id, ...change })));
  }
  return changes;
}

function sceneForOutput(scene, { includeGm = false } = {}) {
  const value = scene && typeof scene === 'object' && !Array.isArray(scene) ? scene : {};
  const visible = (entries) => (Array.isArray(entries) ? entries : [])
    .filter((entry) => includeGm || entry?.visibility !== 'gm');
  return {
    schemaVersion: value.schemaVersion || 'current-scene-v1',
    location: value.location || '',
    description: value.description || '',
    ...(value.situation ? { situation: value.situation } : {}),
    activeObjects: visible(value.activeObjects),
    exits: visible(value.exits),
    dangers: visible(value.dangers),
  };
}

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
    currentScene: sceneForOutput(campaign.current_scene, {
      includeGm: role === 'owner' || role === 'gm',
    }),
    gameTime: gameTimeForOutput(campaign.game_time),
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

async function eventRows(client, access, campaignId, filters, userId) {
  const values = [campaignId];
  const clauses = ['campaign_id = $1'];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.afterSequence !== undefined) add('sequence > ?', filters.afterSequence);
  if (filters.beforeSequence !== undefined) add('sequence < ?', filters.beforeSequence);
  if (filters.type) add('type = ?', filters.type);
  if (filters.sourceType) add('source_type = ?', filters.sourceType);
  if (filters.actorId) {
    values.push(filters.actorId);
    clauses.push(`(actor_id = $${values.length} OR target_id = $${values.length})`);
  }
  if (filters.sessionId) add('session_id = ?', filters.sessionId);
  if (!access.isGm) {
    values.push(userId);
    clauses.push(`(
      visibility IN ('public', 'players')
      OR (visibility = 'assigned' AND payload->>'assignedUserId' = $${values.length})
    )`);
  }
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

function checkpointForOutput(row, { includeGm = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    summary: row.summary,
    scene: sceneForOutput(row.scene, { includeGm }),
    campaignRevision: Number(row.campaign_revision),
    createdAt: row.created_at,
    ...(includeGm ? { unresolvedThreads: row.unresolved_threads || [] } : {}),
  };
}

function soloStateForOutput(row) {
  if (!row) {
    return {
      enabled: false,
      rulesetVersion: null,
      mode: null,
      playerCharacterId: null,
      currentMissionId: null,
      advancementBonusAbilitiesGranted: 0,
      soloHeroicAbilityId: null,
      soloHeroicAbilityGranted: false,
      oracleSettings: { defaultTilt: 'ask' },
    };
  }
  return {
    enabled: row.enabled,
    rulesetVersion: row.ruleset_version,
    mode: row.mode,
    playerCharacterId: row.player_character_id,
    currentMissionId: row.current_mission_id || null,
    advancementBonusAbilitiesGranted: Number(row.advancement_bonus_abilities_granted || 0),
    soloHeroicAbilityId: row.solo_heroic_ability_id || null,
    soloHeroicAbilityGranted: Boolean(row.solo_heroic_ability_granted),
    oracleSettings: { defaultTilt: row.oracle_default_tilt },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function soloMissionForOutput(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    moduleKey: row.module_key,
    title: row.title,
    objective: row.objective,
    status: row.status,
    currentWaypointIndex: Number(row.current_waypoint_index),
    activeThreatId: row.active_threat_id,
    objectiveWaypointId: row.objective_waypoint_id || null,
    returnMode: row.return_mode || null,
    discoveredClues: row.discovered_clues || [],
    storyFlags: row.story_flags || {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function soloAdvancementForOutput(row) {
  if (!row) return null;
  return {
    id: row.id,
    missionId: row.mission_id,
    characterId: row.character_id,
    marksRequired: Number(row.marks_required),
    selectedSkills: row.selected_skills || [],
    rollResults: row.roll_results || [],
    pendingHeroicAbilities: Number(row.pending_heroic_abilities || 0),
    claimedHeroicAbilityIds: row.claimed_heroic_ability_ids || [],
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function soloWaypointForOutput(row) {
  if (!row) return null;
  return {
    id: row.id,
    missionId: row.mission_id,
    position: Number(row.position),
    kind: row.kind,
    status: row.status,
    title: row.title,
    description: row.description,
    dangerIds: row.danger_ids || [],
    npcIds: row.npc_ids || [],
    encounterId: row.encounter_id,
    notes: row.notes || [],
    exploration: {
      searchCount: Number(row.search_count || 0),
      scavengeCount: Number(row.scavenge_count || 0),
      stretchesSpent: Number(row.stretches_spent || 0),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function soloThreatForOutput(row, { revealTriggerEffect = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    missionId: row.mission_id,
    description: row.description,
    counter: Number(row.counter),
    recurring: row.recurring,
    status: row.status,
    ...(revealTriggerEffect || row.status === 'triggered'
      ? { triggerEffect: row.trigger_effect || {} }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordedRollForOutput(row) {
  const output = {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    encounterId: row.encounter_id,
    actorId: row.actor_id,
    purpose: row.purpose,
    source: row.source,
    expression: row.expression,
    dice: row.dice,
    keptIndices: row.kept_indices,
    keptValues: row.kept_values,
    tableKey: row.table_key,
    tableVersion: row.table_version,
    result: row.result,
    previousRollId: row.previous_roll_id,
    campaignRevision: Number(row.campaign_revision),
    createdAt: row.created_at,
  };
  if (row.consequence_id) {
    output.consequence = {
      id: row.consequence_id,
      resolutionMode: row.consequence_resolution_mode,
      options: row.consequence_options || [],
      selectedIndex: row.consequence_selected_index === null
        ? null
        : Number(row.consequence_selected_index),
      selectedDescription: row.consequence_selected_description,
      selectedEffect: row.consequence_selected_effect || {},
      choiceRollId: row.consequence_choice_roll_id || null,
      appliedSummary: row.consequence_applied_summary,
      createdAt: row.consequence_created_at,
    };
  }
  return output;
}

function rollRequestForOutput(row) {
  const expired = Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now());
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    encounterId: row.encounter_id,
    actorId: row.actor_id,
    requestedBy: row.requested_by,
    assignedUserId: row.assigned_user_id,
    purpose: row.purpose,
    expression: row.expression,
    rollKind: row.roll_kind,
    targetValue: row.target_value === null ? null : Number(row.target_value),
    modifier: row.modifier,
    mode: row.mode,
    visibility: row.visibility,
    context: row.context,
    metadata: row.metadata || {},
    pushedFromRequestId: row.pushed_from_request_id || null,
    pushCondition: row.push_condition || null,
    campaignRevision: Number(row.campaign_revision),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    status: row.resolved_roll ? 'resolved' : expired ? 'expired' : 'pending',
    result: row.resolved_roll ? {
      source: row.resolution_source,
      submittedBy: row.result_submitted_by,
      createdAt: row.result_created_at,
      roll: recordedRollForOutput(row.resolved_roll),
    } : null,
  };
}

async function loadRollRequest(client, campaignId, requestId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT request.*, result.resolution_source,
       result.submitted_by AS result_submitted_by,
       result.created_at AS result_created_at,
       source_result.roll_id AS previous_roll_id,
       CASE WHEN roll.id IS NULL THEN NULL ELSE to_jsonb(roll) END AS resolved_roll
     FROM roll_requests request
     LEFT JOIN roll_request_results result ON result.request_id = request.id
     LEFT JOIN recorded_rolls roll ON roll.id = result.roll_id
     LEFT JOIN roll_request_results source_result
       ON source_result.request_id = request.pushed_from_request_id
     WHERE request.id = $1 AND request.campaign_id = $2
     ${forUpdate ? 'FOR UPDATE OF request' : ''}`,
    [requestId, campaignId],
  );
  return rows[0] || null;
}

function assertRollRequestVisible(user, access, request) {
  if (access.isGm || request.visibility === 'players') return;
  if (request.visibility === 'assigned' && request.assigned_user_id === user.id) return;
  throw new HelperError(403, 'PERMISSION_DENIED', 'This roll request is not visible to this campaign member.');
}

function assertPendingRollRequest(user, access, request) {
  assertRollRequestVisible(user, access, request);
  if (request.resolved_roll) throw new HelperError(409, 'INVALID_STATE', 'This roll request is already resolved.');
  if (request.expires_at && new Date(request.expires_at).getTime() <= Date.now()) {
    throw new HelperError(409, 'INVALID_STATE', 'This roll request has expired.');
  }
  if (!access.isGm && request.assigned_user_id !== user.id) {
    throw new HelperError(403, 'PERMISSION_DENIED', 'Only the assigned player or a campaign GM can resolve this roll request.');
  }
}

function soloRestStateForOutput(row) {
  const roundRestTaken = Boolean(row?.round_rest_taken);
  const stretchRestTaken = Boolean(row?.stretch_rest_taken);
  return {
    roundRestTaken,
    stretchRestTaken,
    shiftCount: Number(row?.shift_count || 0),
    lastRestType: row?.last_rest_type || null,
    lastRestAt: row?.last_rest_at || null,
    available: {
      round: !roundRestTaken,
      stretch: !stretchRestTaken,
      shift: true,
    },
  };
}

function characterInjuryForOutput(row) {
  const remainingHealingShifts = row.remaining_healing_shifts === null
    ? null
    : Number(row.remaining_healing_shifts);
  return {
    id: row.id,
    characterId: row.character_id,
    sourceRollId: row.source_roll_id,
    key: row.injury_key,
    name: row.name,
    effect: row.effect,
    healingDays: row.healing_days === null ? null : Number(row.healing_days),
    remainingHealingShifts,
    remainingHealingDays: remainingHealingShifts === null ? null : remainingHealingShifts / 4,
    permanent: row.permanent,
    status: row.status,
    recoveryStatus: row.recovery_status || (row.permanent ? 'permanent' : row.status === 'healed' ? 'healed' : 'untreated'),
    medicalCareApplied: Boolean(row.medical_care_applied),
    treatmentAttempts: Number(row.treatment_attempts || 0),
    lastTreatmentShift: row.last_treatment_shift === null ? null : Number(row.last_treatment_shift),
    healedAt: row.healed_at,
    resolutionReason: row.resolution_reason,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSoloRestState(client, campaignId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT * FROM solo_rest_states WHERE campaign_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [campaignId],
  );
  return rows[0] || null;
}

async function loadCharacterRecoveryState(client, campaignId, characterId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT * FROM character_recovery_states
     WHERE campaign_id = $1 AND character_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [campaignId, characterId],
  );
  return rows[0] || null;
}

async function advanceCharacterRecoveryShift(client, campaignId, characterId, elapsedShifts = 1) {
  const { rows } = await client.query(
    `INSERT INTO character_recovery_states (
       campaign_id, character_id, shift_count, last_shift_at
     ) VALUES ($1, $2, $3, now())
     ON CONFLICT (character_id) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       shift_count = character_recovery_states.shift_count + EXCLUDED.shift_count,
       last_shift_at = now()
     RETURNING *`,
    [campaignId, characterId, elapsedShifts],
  );
  return rows[0];
}

async function loadSoloState(client, campaignId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT * FROM solo_campaign_states WHERE campaign_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [campaignId],
  );
  return rows[0] || null;
}

function requireEnabledSoloState(row) {
  if (!row?.enabled) {
    throw new HelperError(409, 'INVALID_STATE', 'Solo mode is not enabled for this campaign.');
  }
  return row;
}

async function revokeGrantedSoloAbility(client, state) {
  if (
    !state?.player_character_id
    || !state.solo_heroic_ability_id
    || !state.solo_heroic_ability_granted
  ) return null;

  const { rows: abilities } = await client.query(
    'SELECT id, name, rule_key FROM heroic_abilities WHERE id = $1',
    [state.solo_heroic_ability_id],
  );
  const ability = abilities[0];
  if (!ability) return null;

  const { rows: characters } = await client.query(
    'SELECT id, heroic_ability FROM characters WHERE id = $1 FOR UPDATE',
    [state.player_character_id],
  );
  const character = characters[0];
  if (!character) return ability;
  const abilityNames = Array.isArray(character.heroic_ability)
    ? character.heroic_ability.filter(
      (name) => String(name).trim().toLocaleLowerCase() !== ability.name.toLocaleLowerCase(),
    )
    : [];
  await client.query(
    'UPDATE characters SET heroic_ability = $1 WHERE id = $2',
    [abilityNames, character.id],
  );
  return ability;
}

async function loadSoloRuleTable(client, tableKey, version) {
  const { rows } = await client.query(
    `SELECT table_key, version, locale, die_sides, source_kind, display_name, entries
     FROM solo_rule_tables
     WHERE table_key = $1 AND version = $2 AND locale = 'en'`,
    [tableKey, version],
  );
  if (!rows[0]) {
    throw new HelperError(
      409,
      'INVALID_STATE',
      `Solo rule table ${tableKey}@${version} is not installed.`,
    );
  }
  return {
    tableKey: rows[0].table_key,
    version: rows[0].version,
    locale: rows[0].locale,
    dieSides: Number(rows[0].die_sides),
    sourceKind: rows[0].source_kind,
    displayName: rows[0].display_name,
    entries: rows[0].entries,
  };
}

async function insertRecordedRoll(client, {
  campaignId,
  sessionId,
  encounterId = null,
  actorId,
  userId,
  purpose,
  expression,
  dice,
  keptIndices,
  keptValues,
  tableKey,
  tableVersion,
  result,
  previousRollId = null,
  source = 'server',
  campaignRevision,
}) {
  const { rows } = await client.query(
    `INSERT INTO recorded_rolls (
       campaign_id, session_id, encounter_id, actor_id, source_user_id, purpose, source,
       expression, dice, kept_indices, kept_values, table_key, table_version,
       result, previous_roll_id, campaign_revision
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)
     RETURNING *`,
    [
      campaignId,
      sessionId,
      encounterId,
      actorId,
      userId,
      purpose,
      source,
      expression,
      dice,
      keptIndices,
      keptValues,
      tableKey,
      tableVersion,
      JSON.stringify(result),
      previousRollId,
      campaignRevision,
    ],
  );
  return rows[0];
}

async function insertCharacterInjury(client, {
  campaignId,
  characterId,
  rollId,
  injury,
}) {
  const { rows } = await client.query(
    `INSERT INTO character_injuries (
       campaign_id, character_id, source_roll_id, injury_key, name, effect,
       healing_days, permanent, metadata, recovery_status, remaining_healing_shifts
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
     RETURNING *`,
    [
      campaignId,
      characterId,
      rollId,
      injury.key,
      injury.name,
      injury.effect,
      injury.healingDays,
      injury.permanent,
      JSON.stringify({
        tableRoll: injury.tableRoll,
        healingExpression: injury.healingExpression,
        healingDice: injury.healingDice,
      }),
      injury.permanent ? 'permanent' : 'untreated',
      injury.healingDays === null ? null : injury.healingDays * 4,
    ],
  );
  return rows[0];
}

async function advanceActiveInjuryRecovery(client, campaignId, characterId, elapsedShifts = 1) {
  const { rows } = await client.query(
    `SELECT * FROM character_injuries
     WHERE campaign_id = $1 AND character_id = $2 AND status = 'active'
       AND NOT permanent AND remaining_healing_shifts > 0
     ORDER BY created_at
     FOR UPDATE`,
    [campaignId, characterId],
  );
  const changes = [];
  for (const row of rows) {
    const recovery = advanceSoloInjuryRecovery({
      remainingHealingShifts: Number(row.remaining_healing_shifts),
      elapsedShifts,
    });
    const { rows: updated } = await client.query(
      `UPDATE character_injuries SET
         remaining_healing_shifts = $2,
         recovery_status = $3,
         status = CASE WHEN $4 THEN 'healed' ELSE status END,
         healed_at = CASE WHEN $4 THEN now() ELSE healed_at END,
         resolution_reason = CASE WHEN $4 THEN 'Recovery time completed.' ELSE resolution_reason END
       WHERE id = $1
       RETURNING *`,
      [row.id, recovery.remainingHealingShifts, recovery.healed ? 'healed' : 'recovering', recovery.healed],
    );
    changes.push({
      injuryId: row.id,
      name: row.name,
      before: characterInjuryForOutput(row),
      after: characterInjuryForOutput(updated[0]),
      healed: recovery.healed,
      elapsedShifts: recovery.elapsedShifts,
    });
  }
  return changes;
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
  }, user.id);
}

export async function getSessionHistory(user, campaignId, { limit = 20 } = {}) {
  return withReadSnapshot(async (client) => {
    const access = await requireCampaignAccess(client, user, campaignId);
    const [{ rows }, { rows: checkpoints }] = await Promise.all([
      client.query(
        `SELECT * FROM game_sessions
         WHERE campaign_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [campaignId, limit],
      ),
      client.query(
        `SELECT * FROM game_session_checkpoints
         WHERE campaign_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [campaignId, limit],
      ),
    ]);
    const checkpointOutput = checkpoints.map((row) => checkpointForOutput(
      row,
      { includeGm: access.isGm },
    ));
    return {
      campaignRevision: Number(access.campaign.helper_revision || 0),
      sessions: rows.map((row) => sessionForOutput(row, { includeGm: access.isGm })),
      checkpoints: checkpointOutput,
      latestCheckpoint: checkpointOutput[0] || null,
    };
  });
}

export async function createRollRequest(user, input, { sourceClient } = {}) {
  const operation = 'request_roll';
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

    let parsed;
    try {
      parsed = parseTrustedDiceExpression(input.expression);
    } catch (error) {
      throw new HelperError(400, 'VALIDATION_ERROR', error.message);
    }
    const usesKeep = input.modifier === 'boon' || input.modifier === 'bane';
    if (usesKeep && (parsed.count !== 1 || parsed.sides !== 20 || parsed.flatModifier !== 0)) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Boon and bane require an unmodified 1d20 request.');
    }
    if (input.target_value !== undefined
      && (parsed.count !== 1 || parsed.sides !== 20 || parsed.flatModifier !== 0)) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'A target value requires an unmodified 1d20 request.');
    }
    if (input.target_value !== undefined && !['check', 'advancement'].includes(input.roll_kind)) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Target values are supported only for check and advancement rolls.');
    }
    if (['check', 'advancement'].includes(input.roll_kind) && input.target_value === undefined) {
      throw new HelperError(400, 'VALIDATION_ERROR', `${input.roll_kind} rolls require a target value.`);
    }
    if (input.expires_at && new Date(input.expires_at).getTime() <= Date.now()) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Roll request expiry must be in the future.');
    }

    let assignedUserId = input.assigned_user_id || null;
    if (input.actor_id) {
      const loaded = await loadActor(client, input.campaign_id, input.actor_id, {
        combatId: input.encounter_id || null,
      });
      if (!assignedUserId && loaded.storage.type === 'character') {
        assignedUserId = loaded.storage.row.user_id;
      }
      if (input.encounter_id) {
        const { rows: combatants } = await client.query(
          `SELECT 1 FROM encounter_combatants
           WHERE encounter_id = $1 AND (id = $2 OR character_id = $2)
           LIMIT 1`,
          [input.encounter_id, input.actor_id],
        );
        if (!combatants[0]) {
          throw new HelperError(400, 'VALIDATION_ERROR', 'The requested actor is not a participant in this encounter.');
        }
      }
    }
    if (input.encounter_id) {
      const { rows: encounters } = await client.query(
        `SELECT id FROM encounters WHERE id = $1 AND party_id = $2`,
        [input.encounter_id, input.campaign_id],
      );
      if (!encounters[0]) throw new HelperError(400, 'VALIDATION_ERROR', 'The encounter is not part of this campaign.');
    }
    if (assignedUserId) {
      const { rows: members } = await client.query(
        `SELECT role FROM campaign_memberships
         WHERE party_id = $1 AND user_id = $2 AND role IN ('owner', 'gm', 'player')`,
        [input.campaign_id, assignedUserId],
      );
      if (!members[0] && access.campaign.created_by !== assignedUserId) {
        throw new HelperError(400, 'VALIDATION_ERROR', 'The assigned user is not a writable member of this campaign.');
      }
    }
    if ((input.mode === 'player' || input.visibility === 'assigned') && !assignedUserId) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'This roll request requires an assigned campaign user.');
    }

    const resultingRevision = previousRevision + 1;
    const { rows } = await client.query(
      `INSERT INTO roll_requests (
         campaign_id, session_id, encounter_id, actor_id, requested_by,
         assigned_user_id, purpose, expression, roll_kind, target_value,
         modifier, mode, visibility, context, metadata, campaign_revision, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15::jsonb, $16, $17
       ) RETURNING *`,
      [
        input.campaign_id,
        access.campaign.active_session_id,
        input.encounter_id || null,
        input.actor_id || null,
        user.id,
        assignedUserId,
        input.purpose,
        parsed.expression,
        input.roll_kind,
        input.target_value ?? null,
        input.modifier,
        input.mode,
        input.visibility,
        input.context || null,
        JSON.stringify(input.metadata || {}),
        resultingRevision,
        input.expires_at || null,
      ],
    );
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'roll.requested',
      actorId: input.actor_id || null,
      payload: {
        requestId: rows[0].id,
        assignedUserId,
        purpose: input.purpose,
        expression: parsed.expression,
        rollKind: input.roll_kind,
        targetValue: input.target_value ?? null,
        modifier: input.modifier,
        mode: input.mode,
        context: input.context || null,
        reason: input.reason,
      },
      visibility: input.visibility,
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `Roll requested: ${input.purpose} (${parsed.expression}, ${input.mode} mode).`,
      state_excerpt: { request: rollRequestForOutput(rows[0]) },
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

export async function getRollRequest(user, campaignId, requestId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const request = await loadRollRequest(pool, campaignId, requestId);
  if (!request) throw new HelperError(404, 'NOT_FOUND', 'Roll request not found.');
  assertRollRequestVisible(user, access, request);
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    request: rollRequestForOutput(request),
  };
}

export async function getRollHistory(user, campaignId, { encounterId, limit = 30 } = {}) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const values = [campaignId];
  const clauses = ['request.campaign_id = $1'];
  if (encounterId) {
    values.push(encounterId);
    clauses.push(`request.encounter_id = $${values.length}`);
  }
  if (!access.isGm) {
    values.push(user.id);
    clauses.push(`(
      request.visibility = 'players'
      OR (request.visibility = 'assigned' AND request.assigned_user_id = $${values.length})
    )`);
  }
  values.push(limit);
  const { rows } = await pool.query(
    `SELECT request.*, result.resolution_source,
       result.submitted_by AS result_submitted_by,
       result.created_at AS result_created_at,
       source_result.roll_id AS previous_roll_id,
       CASE WHEN roll.id IS NULL THEN NULL ELSE to_jsonb(roll) END AS resolved_roll
     FROM roll_requests request
     LEFT JOIN roll_request_results result ON result.request_id = request.id
     LEFT JOIN recorded_rolls roll ON roll.id = result.roll_id
     LEFT JOIN roll_request_results source_result
       ON source_result.request_id = request.pushed_from_request_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY request.created_at DESC, request.id DESC
     LIMIT $${values.length}`,
    values,
  );
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    requests: rows.map(rollRequestForOutput),
  };
}

export async function pushRollRequest(user, input, { sourceClient } = {}) {
  const operation = 'push_roll';
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
    const sourceRequest = await loadRollRequest(
      client,
      input.campaign_id,
      input.request_id,
      { forUpdate: true },
    );
    if (!sourceRequest) throw new HelperError(404, 'NOT_FOUND', 'Roll request not found.');
    assertRollRequestVisible(user, access, sourceRequest);
    if (!access.isGm && sourceRequest.assigned_user_id !== user.id) {
      throw new HelperError(403, 'PERMISSION_DENIED', 'Only the assigned player or a campaign GM can push this roll.');
    }
    if (!sourceRequest.resolved_roll) {
      throw new HelperError(409, 'INVALID_STATE', 'Only a resolved failed check can be pushed.');
    }
    if (sourceRequest.roll_kind !== 'check' || sourceRequest.target_value === null) {
      throw new HelperError(409, 'INVALID_STATE', 'Only a failed d20 check can be pushed.');
    }
    if (sourceRequest.resolved_roll.result?.outcome !== 'failure') {
      throw new HelperError(409, 'INVALID_STATE', 'Only an ordinary failed check can be pushed; Dragon, Demon, and successful rolls are ineligible.');
    }
    if (sourceRequest.pushed_from_request_id) {
      throw new HelperError(409, 'INVALID_STATE', 'A pushed roll cannot be pushed again.');
    }
    const { rows: existingPushes } = await client.query(
      'SELECT id FROM roll_requests WHERE pushed_from_request_id = $1 LIMIT 1',
      [sourceRequest.id],
    );
    if (existingPushes[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'This failed check has already been pushed.');
    }
    if (!sourceRequest.actor_id) {
      throw new HelperError(409, 'INVALID_STATE', 'A pushed check must be linked to a player character.');
    }

    let loadedActor = await loadActor(client, input.campaign_id, sourceRequest.actor_id, {
      forUpdate: true,
      combatId: sourceRequest.encounter_id,
    });
    if (loadedActor.storage.type === 'combatant' && loadedActor.storage.row.character_id) {
      loadedActor = await loadActor(client, input.campaign_id, loadedActor.storage.row.character_id, {
        forUpdate: true,
        combatId: sourceRequest.encounter_id,
      });
    }
    if (loadedActor.storage.type !== 'character') {
      throw new HelperError(409, 'INVALID_STATE', 'Only a player character can take a condition to push a check.');
    }
    if (loadedActor.actor.conditions.some(({ key }) => key === input.condition)) {
      throw new HelperError(409, 'INVALID_STATE', `${loadedActor.actor.name} already has the ${input.condition} condition.`);
    }

    const conditionResolution = applyActorChangeSet(
      loadedActor.actor,
      [{
        type: 'add_condition',
        key: input.condition,
        source: `Pushed roll: ${input.condition_context}`,
      }],
      conditionId,
    );
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await persistActor(client, conditionResolution.result, loadedActor.storage);

    const resultingRevision = previousRevision + 1;
    const { rows } = await client.query(
      `INSERT INTO roll_requests (
         campaign_id, session_id, encounter_id, actor_id, requested_by,
         assigned_user_id, purpose, expression, roll_kind, target_value,
         modifier, mode, visibility, context, metadata, campaign_revision,
         expires_at, pushed_from_request_id, push_condition
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19
       ) RETURNING *`,
      [
        input.campaign_id,
        sourceRequest.session_id,
        sourceRequest.encounter_id,
        sourceRequest.actor_id,
        user.id,
        sourceRequest.assigned_user_id,
        sourceRequest.purpose,
        sourceRequest.expression,
        sourceRequest.roll_kind,
        sourceRequest.target_value,
        sourceRequest.modifier,
        sourceRequest.mode,
        sourceRequest.visibility,
        sourceRequest.context,
        JSON.stringify({
          ...(sourceRequest.metadata || {}),
          push: {
            sourceRequestId: sourceRequest.id,
            sourceRollId: sourceRequest.resolved_roll.id,
            condition: input.condition,
            conditionContext: input.condition_context,
          },
        }),
        resultingRevision,
        null,
        sourceRequest.id,
        input.condition,
      ],
    );
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'roll.pushed',
      actorId: sourceRequest.actor_id,
      payload: {
        requestId: rows[0].id,
        sourceRequestId: sourceRequest.id,
        sourceRollId: sourceRequest.resolved_roll.id,
        assignedUserId: sourceRequest.assigned_user_id,
        condition: input.condition,
        conditionContext: input.condition_context,
        mode: sourceRequest.mode,
        reason: input.reason,
      },
      visibility: sourceRequest.visibility,
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${loadedActor.actor.name} took the ${input.condition} condition and may reroll ${sourceRequest.purpose}.`,
      state_excerpt: {
        request: rollRequestForOutput(rows[0]),
        sourceRequestId: sourceRequest.id,
        sourceRollId: sourceRequest.resolved_roll.id,
        condition: input.condition,
        conditionContext: input.condition_context,
        actor: actorForOutput(conditionResolution.result, { includeGm: access.isGm }),
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

async function resolveRollRequest(user, input, { sourceClient, resolutionSource }) {
  const operation = resolutionSource === 'server' ? 'resolve_roll_server' : 'submit_manual_roll_result';
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
    const request = await loadRollRequest(client, input.campaign_id, input.request_id, { forUpdate: true });
    if (!request) throw new HelperError(404, 'NOT_FOUND', 'Roll request not found.');
    assertPendingRollRequest(user, access, request);
    if (resolutionSource === 'server' && request.mode === 'player') {
      throw new HelperError(409, 'INVALID_STATE', 'This request requires a player-supplied physical roll.');
    }
    if (resolutionSource === 'manual') {
      if (request.mode === 'server') {
        throw new HelperError(409, 'INVALID_STATE', 'This request requires an authoritative server roll.');
      }
      if (!request.assigned_user_id || request.assigned_user_id !== user.id) {
        throw new HelperError(403, 'PERMISSION_DENIED', 'Only the assigned user can submit a physical roll result.');
      }
    }

    let resolution;
    try {
      const shared = {
        expression: request.expression,
        modifier: request.modifier,
        rollKind: request.roll_kind,
        targetValue: request.target_value === null ? null : Number(request.target_value),
      };
      resolution = resolutionSource === 'server'
        ? resolveTrustedServerRoll(shared)
        : resolveTrustedManualRoll({ ...shared, dice: input.dice });
    } catch (error) {
      throw new HelperError(400, 'VALIDATION_ERROR', error.message);
    }

    const resultingRevision = previousRevision + 1;
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: request.session_id,
      encounterId: request.encounter_id,
      actorId: request.actor_id,
      userId: user.id,
      purpose: request.purpose,
      expression: resolution.expression,
      dice: resolution.dice,
      keptIndices: resolution.keptIndices,
      keptValues: resolution.keptValues,
      tableKey: null,
      tableVersion: access.campaign.rules_version,
      result: {
        action: 'trusted_roll',
        requestId: request.id,
        pushedFromRequestId: request.pushed_from_request_id || null,
        pushCondition: request.push_condition || null,
        ...resolution,
        context: request.context,
        metadata: request.metadata,
      },
      source: resolutionSource,
      previousRollId: request.previous_roll_id || null,
      campaignRevision: resultingRevision,
    });
    await client.query(
      `INSERT INTO roll_request_results (request_id, roll_id, submitted_by, resolution_source)
       VALUES ($1, $2, $3, $4)`,
      [request.id, rollRow.id, user.id, resolutionSource],
    );
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'roll.resolved',
      actorId: request.actor_id,
      payload: {
        requestId: request.id,
        rollId: rollRow.id,
        pushedFromRequestId: request.pushed_from_request_id || null,
        pushCondition: request.push_condition || null,
        assignedUserId: request.assigned_user_id,
        resolutionSource,
        purpose: request.purpose,
        expression: resolution.expression,
        dice: resolution.dice,
        keptIndices: resolution.keptIndices,
        keptValues: resolution.keptValues,
        total: resolution.total,
        targetValue: resolution.targetValue,
        modifier: resolution.modifier,
        outcome: resolution.outcome,
        reason: input.reason,
      },
      visibility: request.visibility,
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const resolvedRequest = await loadRollRequest(client, input.campaign_id, request.id);
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${request.purpose}: ${resolution.total}${resolution.outcome ? ` (${resolution.outcome})` : ''}.`,
      state_excerpt: {
        request: rollRequestForOutput(resolvedRequest),
        roll: recordedRollForOutput(rollRow),
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

export async function resolveRollRequestServer(user, input, { sourceClient } = {}) {
  return resolveRollRequest(user, input, { sourceClient, resolutionSource: 'server' });
}

export async function submitManualRollResult(user, input, { sourceClient } = {}) {
  return resolveRollRequest(user, input, { sourceClient, resolutionSource: 'manual' });
}

export async function getSoloOptions(user, campaignId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const [{ rows: characters }, { rows: abilities }, soloState] = await Promise.all([
    pool.query(
      `SELECT id, name, kin, profession, heroic_ability
       FROM characters WHERE party_id = $1 ORDER BY name, id`,
      [campaignId],
    ),
    pool.query(
      `SELECT id, name, description, willpower_cost, requirement, rule_key, activation_type
       FROM heroic_abilities ORDER BY name, id`,
    ),
    loadSoloState(pool, campaignId),
  ]);
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    solo: soloStateForOutput(soloState),
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      kin: character.kin,
      profession: character.profession,
      heroicAbilities: character.heroic_ability || [],
    })),
    heroicAbilities: abilities.map((ability) => {
      const knownByCharacterIds = characters
        .filter((character) => (character.heroic_ability || []).some(
          (name) => String(name).trim().toLocaleLowerCase() === ability.name.toLocaleLowerCase(),
        ))
        .map((character) => character.id);
      const rulesText = [ability.description, JSON.stringify(ability.requirement || {})]
        .join(' ')
        .toLocaleLowerCase();
      const partyDependent = /\b(another|other) (player|character|hero)\b|\bally\b|\bparty member\b/.test(rulesText);
      return {
        id: ability.id,
        name: ability.name,
        description: ability.description,
        willpowerCost: ability.willpower_cost,
        requirement: ability.requirement,
        ruleKey: ability.rule_key,
        activationType: ability.activation_type,
        selected: soloState?.solo_heroic_ability_id === ability.id,
        knownByCharacterIds,
        soloCompatible: !partyDependent,
        compatibilityWarning: partyDependent
          ? 'This ability refers to another character or ally and may be unsuitable for a lone hero.'
          : null,
      };
    }),
    rulesets: [{ key: 'db-solo-v1.2', name: 'Dragonbane Solo Adventure v1.2' }],
    modes: [
      { key: 'custom', available: true, name: 'Custom solo adventure' },
      {
        key: 'deepfall_breach',
        available: false,
        name: 'Alone in Deepfall Breach',
        unavailableReason: 'An authorized module data pack has not been installed.',
      },
    ],
    prerequisites: {
      hasCharacter: characters.length > 0,
      recommendedSingleCharacter: characters.length === 1,
      issues: characters.length === 0
        ? ['Create or add a player character before enabling solo mode.']
        : characters.length > 1
          ? ['Select the one player character that will act as the solo hero.']
          : [],
    },
  };
}

export async function getSoloState(user, campaignId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const state = await loadSoloState(pool, campaignId);
  let playerCharacter = null;
  let activeInjuries = [];
  let soloHeroicAbility = null;
  if (state?.player_character_id) {
    const loaded = await loadActor(pool, campaignId, state.player_character_id);
    playerCharacter = actorForOutput(loaded.actor, { includeGm: access.isGm });
    const { rows } = await pool.query(
      `SELECT * FROM character_injuries
       WHERE campaign_id = $1 AND character_id = $2 AND status = 'active'
       ORDER BY created_at DESC`,
      [campaignId, state.player_character_id],
    );
    activeInjuries = rows;
  }
  if (state?.solo_heroic_ability_id) {
    const { rows } = await pool.query(
      `SELECT id, name, description, willpower_cost, requirement, rule_key, activation_type
       FROM heroic_abilities WHERE id = $1`,
      [state.solo_heroic_ability_id],
    );
    if (rows[0]) {
      soloHeroicAbility = {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description,
        willpowerCost: rows[0].willpower_cost,
        requirement: rows[0].requirement,
        ruleKey: rows[0].rule_key,
        activationType: rows[0].activation_type,
      };
    }
  }
  let activeMission = null;
  let waypoints = [];
  let currentWaypoint = null;
  let activeThreat = null;
  let activeDangers = [];
  if (state?.current_mission_id) {
    const { rows: missions } = await pool.query(
      `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2`,
      [state.current_mission_id, campaignId],
    );
    activeMission = missions[0] || null;
    if (activeMission) {
      const { rows } = await pool.query(
        `SELECT waypoint.*,
           COALESCE(exploration.search_count, 0) AS search_count,
           COALESCE(exploration.scavenge_count, 0) AS scavenge_count,
           COALESCE(exploration.stretches_spent, 0) AS stretches_spent
         FROM solo_waypoints waypoint
         LEFT JOIN solo_waypoint_exploration exploration ON exploration.waypoint_id = waypoint.id
         WHERE waypoint.mission_id = $1
         ORDER BY waypoint.position`,
        [activeMission.id],
      );
      waypoints = rows;
      currentWaypoint = rows.find(
        (waypoint) => Number(waypoint.position) === Number(activeMission.current_waypoint_index),
      ) || rows.find((waypoint) => waypoint.status === 'active') || null;
      if (activeMission.active_threat_id) {
        const { rows: threats } = await pool.query(
          `SELECT * FROM solo_threats WHERE id = $1 AND mission_id = $2`,
          [activeMission.active_threat_id, activeMission.id],
        );
        activeThreat = threats[0] || null;
      }
      const { rows: dangers } = await pool.query(
        `SELECT id, mission_id, waypoint_id, description, status, source_roll_id, created_at, updated_at
         FROM solo_dangers
         WHERE campaign_id = $1 AND mission_id = $2 AND status = 'active'
         ORDER BY created_at`,
        [campaignId, activeMission.id],
      );
      activeDangers = dangers.map((danger) => ({
        id: danger.id,
        missionId: danger.mission_id,
        waypointId: danger.waypoint_id,
        description: danger.description,
        status: danger.status,
        sourceRollId: danger.source_roll_id,
        createdAt: danger.created_at,
        updatedAt: danger.updated_at,
      }));
    }
  }
  const { rows: latestRolls } = await pool.query(
    `SELECT roll.*,
       consequence.id AS consequence_id,
       consequence.resolution_mode AS consequence_resolution_mode,
       consequence.options AS consequence_options,
       consequence.selected_index AS consequence_selected_index,
       consequence.selected_description AS consequence_selected_description,
       consequence.selected_effect AS consequence_selected_effect,
       consequence.choice_roll_id AS consequence_choice_roll_id,
       consequence.applied_summary AS consequence_applied_summary,
       consequence.created_at AS consequence_created_at
     FROM recorded_rolls roll
     LEFT JOIN solo_check_consequences consequence
       ON consequence.source_roll_id = roll.id AND consequence.campaign_id = roll.campaign_id
     WHERE roll.campaign_id = $1
     ORDER BY roll.created_at DESC
     LIMIT 10`,
    [campaignId],
  );
  const { rows: pendingAdvancementRows } = await pool.query(
    `SELECT * FROM solo_mission_advancements
     WHERE campaign_id = $1 AND status <> 'complete'
     ORDER BY created_at DESC LIMIT 1`,
    [campaignId],
  );
  const pendingAdvancement = pendingAdvancementRows[0] || null;
  const [{ rows: journalSessionRows }, journalEvents] = await Promise.all([
    pool.query(
      `SELECT * FROM game_sessions
       WHERE campaign_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [campaignId],
    ),
    eventRows(pool, access, campaignId, {
      sourceType: 'chatgpt',
      limit: 20,
    }, user.id),
  ]);
  const restState = await loadSoloRestState(pool, campaignId);
  const { rows: activeCombats } = await pool.query(
    `SELECT id, name FROM encounters
     WHERE party_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [campaignId],
  );
  const pushedSourceIds = new Set(latestRolls.map((roll) => roll.previous_roll_id).filter(Boolean));
  const allowedNextActions = [];
  if (!state?.enabled) {
    allowedNextActions.push('get_solo_options', 'enable_solo_mode');
  } else {
    if (!soloHeroicAbility) allowedNextActions.push('select_solo_heroic_ability');
    allowedNextActions.push('ask_fortune', 'draw_inspiration', 'start_session');
    if (!activeMission) {
      if (pendingAdvancement?.status === 'selecting_marks') allowedNextActions.push('select_solo_mission_marks');
      if (pendingAdvancement?.status === 'ready_to_roll') allowedNextActions.push('resolve_solo_advancement');
      if (pendingAdvancement?.status === 'claiming_abilities') allowedNextActions.push('claim_solo_advancement_ability');
      if (!pendingAdvancement) allowedNextActions.push('start_solo_mission');
    } else {
      const nextWaypoint = waypoints.find(
        (waypoint) => Number(waypoint.position) === Number(activeMission.current_waypoint_index) + 1,
      );
      if (nextWaypoint) allowedNextActions.push('reveal_waypoint');
      allowedNextActions.push('complete_solo_mission');
      allowedNextActions.push('add_solo_waypoints');
      if (activeMission.status === 'active') allowedNextActions.push('begin_solo_return');
    }
    if (activeThreat?.status === 'active') allowedNextActions.push('advance_threat');
    if (activeThreat?.status === 'triggered') allowedNextActions.push('resolve_solo_threat');
    if (activeMission && !activeThreat) allowedNextActions.push('set_solo_threat');
    if (currentWaypoint?.status === 'active') {
      allowedNextActions.push('search_waypoint', 'scavenge_waypoint');
    }
    if (!activeCombats[0] && playerCharacter?.hp?.current > 0) {
      allowedNextActions.push('resolve_solo_check', 'take_solo_rest', 'resolve_solo_narrative_damage');
    }
    if (!activeCombats[0] && latestRolls.some((roll) => (
      ['solo_check', 'solo_check_push'].includes(roll.result?.action)
      && roll.result?.requiresFailForward
      && !roll.consequence_id
      && !pushedSourceIds.has(roll.id)
    ))) {
      allowedNextActions.push('resolve_solo_check_consequence');
    }
    if (!activeCombats[0] && latestRolls.some((roll) => (
      roll.result?.action === 'solo_check'
      && roll.result?.outcome === 'failure'
      && !roll.previous_roll_id
      && !latestRolls.some((candidate) => candidate.previous_roll_id === roll.id)
    ))) allowedNextActions.push('push_solo_check');
    if (playerCharacter?.hp?.current === 0 && Number(playerCharacter.deathRolls?.failed || 0) < 3) {
      allowedNextActions.push('resolve_solo_dying_action');
    }
    if (activeInjuries.length > 0) allowedNextActions.push('resolve_solo_injury_action');
  }
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    solo: soloStateForOutput(state),
    playerCharacter,
    soloHeroicAbility,
    activeSessionId: access.campaign.active_session_id,
    currentScene: sceneForOutput(access.campaign.current_scene, { includeGm: access.isGm }),
    journal: {
      currentScene: sceneForOutput(access.campaign.current_scene, { includeGm: access.isGm }),
      openThreads: access.isGm ? access.campaign.open_threads || [] : [],
      sessions: journalSessionRows.map((session) => sessionForOutput(session, { includeGm: access.isGm })),
      recentEvents: journalEvents,
    },
    activeMission: soloMissionForOutput(activeMission),
    waypoints: waypoints.map(soloWaypointForOutput),
    currentWaypoint: soloWaypointForOutput(currentWaypoint),
    activeThreat: soloThreatForOutput(activeThreat),
    pendingAdvancement: soloAdvancementForOutput(pendingAdvancement),
    activeDangers,
    activeCombat: activeCombats[0]
      ? { id: activeCombats[0].id, name: activeCombats[0].name }
      : null,
    gameTime: gameTimeForOutput(access.campaign.game_time),
    restState: soloRestStateForOutput(restState),
    activeInjuries: activeInjuries.map(characterInjuryForOutput),
    latestRolls: latestRolls.map(recordedRollForOutput),
    allowedNextActions,
  };
}

export async function enableSoloMode(user, input, { sourceClient } = {}) {
  const operation = 'enable_solo_mode';
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
    const previousState = await loadSoloState(client, input.campaign_id, { forUpdate: true });
    if (input.mode === 'deepfall_breach') {
      throw new HelperError(
        409,
        'INVALID_STATE',
        'The Deepfall Breach module requires an authorized data pack and is not installed.',
      );
    }
    const { rows: characters } = await client.query(
      `SELECT id, name, heroic_ability FROM characters
       WHERE id = $1 AND party_id = $2 FOR UPDATE`,
      [input.player_character_id, input.campaign_id],
    );
    const character = characters[0];
    if (!character) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'The selected solo character is not in this campaign.');
    }

    const resultingRevision = previousRevision + 1;
    const characterChanged = Boolean(
      previousState?.player_character_id
      && previousState.player_character_id !== character.id,
    );
    if (characterChanged && previousState?.current_mission_id) {
      throw new HelperError(409, 'INVALID_STATE', 'Complete or abandon the active solo mission before changing the solo hero.');
    }
    if (characterChanged) {
      const { rows: activeCombats } = await client.query(
        `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
        [input.campaign_id],
      );
      if (activeCombats[0]) {
        throw new HelperError(409, 'INVALID_STATE', 'End the active combat encounter before changing the solo hero.');
      }
    }
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    const revokedAbility = characterChanged
      ? await revokeGrantedSoloAbility(client, previousState)
      : null;
    const { rows } = await client.query(
      `INSERT INTO solo_campaign_states (
         campaign_id, enabled, ruleset_version, mode, player_character_id,
         oracle_default_tilt
       ) VALUES ($1, true, $2, $3, $4, $5)
       ON CONFLICT (campaign_id) DO UPDATE SET
         enabled = true,
         ruleset_version = EXCLUDED.ruleset_version,
         mode = EXCLUDED.mode,
         player_character_id = EXCLUDED.player_character_id,
         oracle_default_tilt = EXCLUDED.oracle_default_tilt,
         solo_heroic_ability_id = CASE
           WHEN solo_campaign_states.player_character_id IS DISTINCT FROM EXCLUDED.player_character_id THEN NULL
           ELSE solo_campaign_states.solo_heroic_ability_id
         END,
         solo_heroic_ability_granted = CASE
           WHEN solo_campaign_states.player_character_id IS DISTINCT FROM EXCLUDED.player_character_id THEN false
           ELSE solo_campaign_states.solo_heroic_ability_granted
         END
       RETURNING *`,
      [
        input.campaign_id,
        input.ruleset_version,
        input.mode,
        input.player_character_id,
        input.oracle_default_tilt,
      ],
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
      type: 'solo.enabled',
      actorId: character.id,
      payload: {
        playerCharacterId: character.id,
        playerCharacterName: character.name,
        mode: input.mode,
        rulesetVersion: input.ruleset_version,
        oracleDefaultTilt: input.oracle_default_tilt,
        heroicAbilityReviewRequired: !rows[0].solo_heroic_ability_id,
        previousPlayerCharacterId: previousState?.player_character_id || null,
        revokedGrantedAbilityId: revokedAbility?.id || null,
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
      summary: `Solo mode enabled for ${character.name}.${rows[0].solo_heroic_ability_id ? '' : ' Review the character\'s extra solo heroic ability before play.'}`,
      state_excerpt: {
        solo: soloStateForOutput(rows[0]),
        playerCharacter: {
          id: character.id,
          name: character.name,
          heroicAbilities: character.heroic_ability || [],
        },
        ...(rows[0].solo_heroic_ability_id
          ? {}
          : { requiredConfirmation: 'Confirm or select the additional solo heroic ability; no ability was added automatically.' }),
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

export async function disableSoloMode(user, input, { sourceClient } = {}) {
  const operation = 'disable_solo_mode';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (state.current_mission_id) {
      throw new HelperError(409, 'INVALID_STATE', 'Complete or abandon the active solo mission before disabling solo mode.');
    }
    const { rows: activeCombats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (activeCombats[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'End the active combat encounter before disabling solo mode.');
    }

    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    const revokedAbility = await revokeGrantedSoloAbility(client, state);
    const { rows } = await client.query(
      `UPDATE solo_campaign_states
       SET enabled = false,
         solo_heroic_ability_id = NULL,
         solo_heroic_ability_granted = false
       WHERE campaign_id = $1
       RETURNING *`,
      [input.campaign_id],
    );
    const resultingRevision = previousRevision + 1;
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.disabled',
      actorId: state.player_character_id,
      payload: {
        playerCharacterId: state.player_character_id,
        revokedGrantedAbilityId: revokedAbility?.id || null,
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
      summary: 'Solo mode disabled for this campaign.',
      state_excerpt: {
        solo: soloStateForOutput(rows[0]),
        revokedGrantedAbility: revokedAbility
          ? { id: revokedAbility.id, name: revokedAbility.name, ruleKey: revokedAbility.rule_key }
          : null,
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

export async function selectSoloHeroicAbility(user, input, { sourceClient } = {}) {
  const operation = 'select_solo_heroic_ability';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (state.current_mission_id && state.solo_heroic_ability_id !== input.ability_id) {
      throw new HelperError(409, 'INVALID_STATE', 'Complete or abandon the active solo mission before changing the solo heroic ability.');
    }
    if (state.solo_heroic_ability_id !== input.ability_id) {
      const { rows: activeCombats } = await client.query(
        `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
        [input.campaign_id],
      );
      if (activeCombats[0]) {
        throw new HelperError(409, 'INVALID_STATE', 'End the active combat encounter before changing the solo heroic ability.');
      }
    }
    const { rows: characters } = await client.query(
      `SELECT id, name, heroic_ability FROM characters
       WHERE id = $1 AND party_id = $2 FOR UPDATE`,
      [state.player_character_id, input.campaign_id],
    );
    const character = characters[0];
    if (!character) {
      throw new HelperError(409, 'INVALID_STATE', 'The configured solo character is no longer in this campaign.');
    }
    const { rows: abilities } = await client.query(
      `SELECT id, name, description, willpower_cost, requirement, rule_key, activation_type
       FROM heroic_abilities WHERE id = $1`,
      [input.ability_id],
    );
    const ability = abilities[0];
    if (!ability) throw new HelperError(404, 'NOT_FOUND', 'Heroic ability not found.');

    let abilityNames = Array.isArray(character.heroic_ability) ? [...character.heroic_ability] : [];
    let previousAbility = null;
    if (state.solo_heroic_ability_id && state.solo_heroic_ability_id !== ability.id) {
      const { rows } = await client.query(
        'SELECT id, name FROM heroic_abilities WHERE id = $1',
        [state.solo_heroic_ability_id],
      );
      previousAbility = rows[0] || null;
      if (previousAbility && state.solo_heroic_ability_granted) {
        abilityNames = abilityNames.filter((name) => name !== previousAbility.name);
      }
    }
    const alreadyKnown = abilityNames.some((name) => name.toLocaleLowerCase() === ability.name.toLocaleLowerCase());
    if (alreadyKnown && !(state.solo_heroic_ability_id === ability.id && state.solo_heroic_ability_granted)) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        `${character.name} already knows ${ability.name}. The Solo setup ability must be genuinely additional.`,
      );
    }
    if (!alreadyKnown) abilityNames.push(ability.name);
    const sameSelection = state.solo_heroic_ability_id === ability.id;
    const grantedBySolo = sameSelection
      ? Boolean(state.solo_heroic_ability_granted || !alreadyKnown)
      : !alreadyKnown;

    const resultingRevision = previousRevision + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query(
      'UPDATE characters SET heroic_ability = $1 WHERE id = $2',
      [abilityNames, character.id],
    );
    const { rows: states } = await client.query(
      `UPDATE solo_campaign_states
       SET solo_heroic_ability_id = $1, solo_heroic_ability_granted = $2
       WHERE campaign_id = $3 RETURNING *`,
      [ability.id, grantedBySolo, input.campaign_id],
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
      type: 'solo.heroic_ability_selected',
      actorId: character.id,
      payload: {
        abilityId: ability.id,
        abilityName: ability.name,
        ruleKey: ability.rule_key,
        replacedAbilityId: previousAbility?.id || null,
        addedToCharacter: !alreadyKnown,
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
      summary: `${character.name} selected ${ability.name} as the additional solo heroic ability.`,
      state_excerpt: {
        solo: soloStateForOutput(states[0]),
        playerCharacter: {
          id: character.id,
          name: character.name,
          heroicAbilities: abilityNames,
        },
        ability: {
          id: ability.id,
          name: ability.name,
          ruleKey: ability.rule_key,
          activationType: ability.activation_type,
          willpowerCost: ability.willpower_cost,
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

export async function replaceSoloHeroicAbility(user, input, { sourceClient } = {}) {
  const operation = 'replace_solo_heroic_ability';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (state.current_mission_id) {
      throw new HelperError(409, 'INVALID_STATE', 'Replace an unsuitable heroic ability only between missions.');
    }
    const { rows: combats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (combats[0]) throw new HelperError(409, 'INVALID_STATE', 'End active combat before replacing a heroic ability.');
    const { rows: characters } = await client.query(
      `SELECT id, name, heroic_ability FROM characters WHERE id = $1 AND party_id = $2 FOR UPDATE`,
      [state.player_character_id, input.campaign_id],
    );
    const character = characters[0];
    if (!character) throw new HelperError(409, 'INVALID_STATE', 'The Solo hero is unavailable.');
    const abilityNames = Array.isArray(character.heroic_ability) ? [...character.heroic_ability] : [];
    const removedIndex = abilityNames.findIndex(
      (name) => String(name).trim().toLocaleLowerCase() === input.removed_ability_name.toLocaleLowerCase(),
    );
    if (removedIndex < 0) throw new HelperError(400, 'VALIDATION_ERROR', 'The Solo hero does not know the ability being replaced.');
    if (state.solo_heroic_ability_granted && state.solo_heroic_ability_id) {
      const { rows } = await client.query('SELECT name FROM heroic_abilities WHERE id = $1', [state.solo_heroic_ability_id]);
      if (rows[0]?.name.toLocaleLowerCase() === input.removed_ability_name.toLocaleLowerCase()) {
        throw new HelperError(409, 'INVALID_STATE', 'Change the additional Solo setup ability instead of replacing it as unsuitable.');
      }
    }
    const { rows: replacements } = await client.query(
      `SELECT id, name, description, rule_key FROM heroic_abilities WHERE id = $1`,
      [input.replacement_ability_id],
    );
    const replacement = replacements[0];
    if (!replacement) throw new HelperError(404, 'NOT_FOUND', 'Replacement heroic ability not found.');
    if (abilityNames.some((name) => String(name).trim().toLocaleLowerCase() === replacement.name.toLocaleLowerCase())) {
      throw new HelperError(409, 'INVALID_STATE', `${character.name} already knows ${replacement.name}.`);
    }
    abilityNames.splice(removedIndex, 1, replacement.name);
    const resultingRevision = previousRevision + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query('UPDATE characters SET heroic_ability = $1 WHERE id = $2', [abilityNames, character.id]);
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.heroic_ability_replaced',
      actorId: character.id,
      payload: {
        removedAbilityName: input.removed_ability_name,
        replacementAbilityId: replacement.id,
        replacementAbilityName: replacement.name,
        confirmedByUser: true,
        reason: input.reason,
      },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${character.name} replaced ${input.removed_ability_name} with ${replacement.name}.`,
      state_excerpt: { playerCharacter: { id: character.id, name: character.name, heroicAbilities: abilityNames } },
    };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function askFortune(user, input, { sourceClient } = {}) {
  const operation = 'ask_fortune';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const table = await loadSoloRuleTable(client, 'fortune', state.ruleset_version);
    const resolution = resolveFortune({ category: input.category, tilt: input.tilt, entries: table.entries });
    const resultingRevision = previousRevision + 1;
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `Fortune: ${input.question}`,
      expression: resolution.expression,
      dice: resolution.dice,
      keptIndices: resolution.keptIndices,
      keptValues: resolution.keptValues,
      tableKey: table.tableKey,
      tableVersion: table.version,
      result: {
        question: input.question,
        category: input.category,
        tilt: input.tilt,
        value: resolution.value,
        extreme: resolution.extreme,
        tableRow: resolution.tableRow,
        context: input.context || null,
      },
      campaignRevision: resultingRevision,
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
      type: 'solo.fortune_asked',
      actorId: state.player_character_id,
      payload: {
        rollId: rollRow.id,
        question: input.question,
        category: input.category,
        tilt: input.tilt,
        expression: resolution.expression,
        dice: resolution.dice,
        keptIndices: resolution.keptIndices,
        keptValue: resolution.keptValue,
        result: resolution.value,
        extreme: resolution.extreme,
        context: input.context || null,
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
      summary: `Fortune answered “${resolution.value}” (${resolution.expression}: ${resolution.dice.join(', ')}; kept ${resolution.keptValue}).`,
      state_excerpt: { roll: recordedRollForOutput(rollRow) },
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

export async function drawInspiration(user, input, { sourceClient } = {}) {
  const operation = 'draw_inspiration';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const tableList = await Promise.all(input.columns.map((column) => (
      loadSoloRuleTable(client, `inspiration_${column}`, ACTIVE_SOLO_PROMPT_TABLE_VERSION)
    )));
    const tables = Object.fromEntries(tableList.map((table, index) => [input.columns[index], table]));
    const resolution = resolveInspiration({ columns: input.columns, tables });
    const resultingRevision = previousRevision + 1;
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `Inspiration: ${input.columns.join(', ')}`,
      expression: resolution.expression,
      dice: resolution.dice,
      keptIndices: resolution.keptIndices,
      keptValues: resolution.keptValues,
      tableKey: 'inspiration',
      tableVersion: ACTIVE_SOLO_PROMPT_TABLE_VERSION,
      result: {
        columns: input.columns,
        results: resolution.results,
        phrase: resolution.phrase,
        context: input.context || null,
        officialTable: false,
      },
      campaignRevision: resultingRevision,
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
      type: 'solo.inspiration_drawn',
      actorId: state.player_character_id,
      payload: {
        rollId: rollRow.id,
        expression: resolution.expression,
        dice: resolution.dice,
        results: resolution.results,
        phrase: resolution.phrase,
        context: input.context || null,
        officialTable: false,
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
      summary: `Inspiration: ${resolution.phrase} (${resolution.dice.join(', ')}).`,
      state_excerpt: {
        roll: recordedRollForOutput(rollRow),
        notice: 'This result uses the installed custom Solo inspiration table.',
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

export async function resolveSoloCheck(user, input, { sourceClient } = {}) {
  const operation = 'resolve_solo_check';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const { rows: activeCombats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (activeCombats[0]) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        'General Solo checks are for actions outside combat. Resolve combat actions in the encounter flow.',
      );
    }

    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    if (loadedActor.actor.lifeStatus === 'dead' || loadedActor.actor.currentHp <= 0) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero cannot attempt a normal check while dying or dead.');
    }
    const selected = actorCheckTarget(loadedActor.actor, input.check_type, input.check_name);
    const check = resolveSoloSkillCheck({ target: selected.target, modifier: input.modifier });

    let criticalEffect = null;
    let criticalTable = null;
    if (check.outcome === 'dragon' || check.outcome === 'demon') {
      criticalTable = await loadSoloRuleTable(
        client,
        `solo_${check.outcome}_effect`,
        ACTIVE_SOLO_PROMPT_TABLE_VERSION,
      );
      criticalEffect = resolveSoloCriticalEffect(criticalTable.entries);
    }

    const advancementMark = input.check_type === 'skill'
      ? await markSkillAdvancement(client, loadedActor, selected.name, check)
      : { skill: null, eligible: false, added: false, alreadyMarked: false, markedSkills: loadedActor.actor.markedSkills || [] };

    const resultingRevision = previousRevision + 1;
    const allDice = [...check.dice, ...(criticalEffect?.dice || [])];
    const keptIndices = [
      ...check.keptIndices,
      ...(criticalEffect ? [check.dice.length] : []),
    ];
    const keptValues = [...check.keptValues, ...(criticalEffect?.keptValues || [])];
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `Solo ${input.check_type}: ${selected.name}`,
      expression: [check.expression, criticalEffect?.expression].filter(Boolean).join(' + '),
      dice: allDice,
      keptIndices,
      keptValues,
      tableKey: criticalTable?.tableKey || null,
      tableVersion: criticalTable?.version || state.ruleset_version,
      result: {
        action: 'solo_check',
        checkType: input.check_type,
        checkName: selected.name,
        target: selected.target,
        modifier: input.modifier,
        check,
        outcome: check.outcome,
        criticalEffect: criticalEffect ? {
          ...criticalEffect,
          tableKey: criticalTable.tableKey,
          tableVersion: criticalTable.version,
          advisory: true,
        } : null,
        advancementMark: {
          eligible: advancementMark.eligible,
          added: advancementMark.added,
          alreadyMarked: advancementMark.alreadyMarked,
        },
        requiresFailForward: check.outcome === 'failure' || check.outcome === 'demon',
        context: input.context || null,
      },
      campaignRevision: resultingRevision,
    });
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);

    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.check_resolved',
      actorId: state.player_character_id,
      payload: {
        rollId: rollRow.id,
        checkType: input.check_type,
        checkName: selected.name,
        target: selected.target,
        modifier: input.modifier,
        expression: rollRow.expression,
        dice: allDice,
        keptIndices,
        keptValue: check.roll,
        outcome: check.outcome,
        criticalEffect: criticalEffect ? {
          roll: criticalEffect.roll,
          key: criticalEffect.key,
          label: criticalEffect.label,
          advisory: true,
        } : null,
        advancementMarkAdded: advancementMark.added,
        requiresFailForward: check.outcome === 'failure' || check.outcome === 'demon',
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });

    const effectSummary = criticalEffect ? ` ${criticalEffect.label}.` : '';
    const markSummary = advancementMark.added ? ` ${selected.name} was marked for advancement.` : '';
    const failureSummary = check.outcome === 'failure' || check.outcome === 'demon'
      ? ' Continue with a complication instead of blocking the story.'
      : '';
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${selected.name} ${check.outcome}: rolled ${check.dice.join(', ')}, kept ${check.roll} vs ${selected.target}.${effectSummary}${markSummary}${failureSummary}`,
      state_excerpt: {
        roll: recordedRollForOutput(rollRow),
        check,
        criticalEffect: criticalEffect ? {
          ...criticalEffect,
          tableKey: criticalTable.tableKey,
          tableVersion: criticalTable.version,
          notice: 'This is an advisory Solo table result. Confirm its fictional meaning before applying another state change.',
        } : null,
        advancementMark,
        requiresFailForward: check.outcome === 'failure' || check.outcome === 'demon',
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

export async function pushSoloCheck(user, input, { sourceClient } = {}) {
  const operation = 'push_solo_check';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if ((input.cost === 'condition' && !input.condition)
      || (input.cost === 'sole_survivor' && input.condition)) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Condition pushes require one condition; Sole Survivor pushes must not include one.');
    }
    const { rows: activeCombats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (activeCombats[0]) throw new HelperError(409, 'INVALID_STATE', 'Solo checks may only be pushed outside combat.');
    const { rows: sourceRows } = await client.query(
      `SELECT roll.*,
         EXISTS (SELECT 1 FROM recorded_rolls child WHERE child.previous_roll_id = roll.id) AS was_pushed,
         EXISTS (SELECT 1 FROM solo_check_consequences consequence WHERE consequence.source_roll_id = roll.id) AS has_consequence
       FROM recorded_rolls roll WHERE roll.id = $1 AND roll.campaign_id = $2 FOR UPDATE OF roll`,
      [input.source_roll_id, input.campaign_id],
    );
    const sourceRoll = sourceRows[0];
    if (!sourceRoll) throw new HelperError(404, 'NOT_FOUND', 'The source Solo roll was not found.');
    if (sourceRoll.result?.action !== 'solo_check' || sourceRoll.result?.outcome !== 'failure') {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Only an ordinary failed, unpushed Solo check can be pushed.');
    }
    if (sourceRoll.previous_roll_id || sourceRoll.was_pushed || sourceRoll.has_consequence) {
      throw new HelperError(409, 'INVALID_STATE', 'This Solo check has already been pushed or resolved with a consequence.');
    }
    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    if (loadedActor.actor.lifeStatus === 'dead' || loadedActor.actor.currentHp <= 0) {
      throw new HelperError(409, 'INVALID_STATE', 'The Solo hero cannot push while dying or dead.');
    }
    let costResolution;
    if (input.cost === 'sole_survivor') {
      const abilityNames = Array.isArray(loadedActor.storage?.row?.heroic_ability)
        ? loadedActor.storage.row.heroic_ability : [];
      if (!abilityNames.some((name) => normalizedSkillName(name) === 'sole survivor')) {
        throw new HelperError(409, 'INVALID_STATE', 'The Solo hero does not know Sole Survivor.');
      }
      costResolution = applyActorChangeSet(loadedActor.actor, [{ type: 'spend_wp', amount: 3 }], conditionId);
    } else {
      if (!STANDARD_CONDITION_KEYS.has(input.condition)) {
        throw new HelperError(400, 'VALIDATION_ERROR', 'Choose a standard Dragonbane condition.');
      }
      costResolution = applyActorChangeSet(loadedActor.actor, [{
        type: 'add_condition',
        key: input.condition,
        source: `Pushed Solo check: ${input.explanation}`,
      }], conditionId);
    }
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await persistActor(client, costResolution.result, loadedActor.storage);
    const selected = actorCheckTarget(
      costResolution.result,
      sourceRoll.result.checkType,
      sourceRoll.result.checkName,
    );
    const check = resolveSoloSkillCheck({ target: selected.target, modifier: sourceRoll.result.modifier });
    let criticalEffect = null;
    let criticalTable = null;
    if (['dragon', 'demon'].includes(check.outcome)) {
      criticalTable = await loadSoloRuleTable(client, `solo_${check.outcome}_effect`, ACTIVE_SOLO_PROMPT_TABLE_VERSION);
      criticalEffect = resolveSoloCriticalEffect(criticalTable.entries);
    }
    const advancementMark = sourceRoll.result.checkType === 'skill'
      ? await markSkillAdvancement(client, { ...loadedActor, actor: costResolution.result }, selected.name, check)
      : { eligible: false, added: false, alreadyMarked: false };
    const resultingRevision = previousRevision + 1;
    const dice = [...check.dice, ...(criticalEffect?.dice || [])];
    const keptIndices = [...check.keptIndices, ...(criticalEffect ? [check.dice.length] : [])];
    const pushedRoll = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `Pushed ${sourceRoll.purpose}`,
      expression: [check.expression, criticalEffect?.expression].filter(Boolean).join(' + '),
      dice,
      keptIndices,
      keptValues: [...check.keptValues, ...(criticalEffect?.keptValues || [])],
      tableKey: criticalTable?.tableKey || null,
      tableVersion: criticalTable?.version || state.ruleset_version,
      result: {
        action: 'solo_check_push',
        sourceRollId: sourceRoll.id,
        pushCost: input.cost,
        condition: input.condition || null,
        explanation: input.explanation,
        checkType: sourceRoll.result.checkType,
        checkName: selected.name,
        target: selected.target,
        modifier: sourceRoll.result.modifier,
        check,
        outcome: check.outcome,
        criticalEffect: criticalEffect ? { ...criticalEffect, advisory: true } : null,
        advancementMark,
        requiresFailForward: ['failure', 'demon'].includes(check.outcome),
        context: sourceRoll.result.context || null,
      },
      previousRollId: sourceRoll.id,
      campaignRevision: resultingRevision,
    });
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    let sequence = await nextEventSequence(client, input.campaign_id);
    const eventIds = [];
    for (const event of costResolution.events) {
      eventIds.push(await insertEvent(client, {
        campaign: access.campaign, user, sequence, type: event.type, actorId: state.player_character_id,
        payload: { ...event.payload, sourceRollId: sourceRoll.id, explanation: input.explanation },
        visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
        previousRevision, resultingRevision,
      }));
      sequence += 1;
    }
    eventIds.push(await insertEvent(client, {
      campaign: access.campaign, user, sequence, type: 'solo.check_pushed', actorId: state.player_character_id,
      payload: { sourceRollId: sourceRoll.id, rollId: pushedRoll.id, cost: input.cost, condition: input.condition || null, explanation: input.explanation, outcome: check.outcome, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    }));
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: eventIds,
      summary: `${selected.name} was pushed by ${input.cost === 'sole_survivor' ? 'spending 3 WP with Sole Survivor' : `taking ${input.condition}`}: ${check.outcome} (${check.roll} vs ${selected.target}).`,
      state_excerpt: { roll: recordedRollForOutput(pushedRoll), playerCharacter: actorForOutput(costResolution.result, { includeGm: access.isGm }) },
    };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function resolveSoloCheckConsequence(user, input, { sourceClient } = {}) {
  const operation = 'resolve_solo_check_consequence';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));

    const { rows: activeCombats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (activeCombats[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'Resolve the pending Solo consequence before starting combat.');
    }

    const { rows: sourceRolls } = await client.query(
      `SELECT * FROM recorded_rolls WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
      [input.source_roll_id, input.campaign_id],
    );
    const sourceRoll = sourceRolls[0];
    if (!sourceRoll) throw new HelperError(404, 'NOT_FOUND', 'The source Solo roll was not found.');
    if (!['solo_check', 'solo_check_push'].includes(sourceRoll.result?.action) || !sourceRoll.result?.requiresFailForward) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Only a failed or Demon Solo check can receive a fail-forward consequence.');
    }
    if (sourceRoll.result.action === 'solo_check') {
      const { rows: pushedRolls } = await client.query(
        `SELECT id FROM recorded_rolls
         WHERE campaign_id = $1 AND previous_roll_id = $2
         LIMIT 1`,
        [input.campaign_id, sourceRoll.id],
      );
      if (pushedRolls[0]) {
        throw new HelperError(409, 'INVALID_STATE', 'Resolve the fail-forward consequence on the pushed result instead of the original roll.');
      }
    }
    const { rows: existingConsequences } = await client.query(
      `SELECT id FROM solo_check_consequences WHERE campaign_id = $1 AND source_roll_id = $2`,
      [input.campaign_id, sourceRoll.id],
    );
    if (existingConsequences[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'This Solo check already has a resolved consequence.');
    }

    const options = input.resolution.mode === 'manual'
      ? [input.resolution.consequence]
      : input.resolution.consequences;
    let choiceDie = null;
    let selectedIndex = null;
    if (input.resolution.mode === 'roll_choice') {
      choiceDie = secureRollDie(6);
      selectedIndex = choiceDie <= 3 ? 0 : 1;
    }
    const selected = options[selectedIndex ?? 0];
    const effect = selected.effect;
    const resultingRevision = previousRevision + 1;
    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    const mechanicalEvents = [];
    let appliedSummary = 'The consequence was recorded as a story event.';
    let effectState = {};

    if (['damage', 'add_condition', 'lose_item'].includes(effect.type)) {
      const change = effect.type === 'damage'
        ? { type: 'damage', amount: effect.amount, damage_type: effect.damage_type }
        : effect.type === 'add_condition'
          ? { type: 'add_condition', key: effect.key, source: `Solo consequence: ${selected.description}` }
          : { type: 'adjust_inventory', item_id: effect.item_id, quantity_delta: -effect.quantity };
      const resolution = applyActorChangeSet(loadedActor.actor, [change], conditionId);
      await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
      await persistActor(client, resolution.result, loadedActor.storage);
      appliedSummary = resolution.explanation;
      effectState = {
        actor: actorForOutput(resolution.result, { includeGm: access.isGm }),
        warnings: resolution.warnings,
      };
      mechanicalEvents.push(...resolution.events.map((event) => ({
        type: event.type,
        actorId: state.player_character_id,
        payload: { ...event.payload, sourceRollId: sourceRoll.id },
      })));
    } else if (effect.type === 'advance_threat') {
      if (!state.current_mission_id) {
        throw new HelperError(409, 'INVALID_STATE', 'A threat consequence requires an active Solo mission.');
      }
      const { rows: missions } = await client.query(
        `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
        [state.current_mission_id, input.campaign_id],
      );
      const mission = missions[0];
      if (!mission?.active_threat_id) {
        throw new HelperError(409, 'INVALID_STATE', 'The current Solo mission has no active threat.');
      }
      const { rows: threats } = await client.query(
        `SELECT * FROM solo_threats WHERE id = $1 AND mission_id = $2 AND status = 'active' FOR UPDATE`,
        [mission.active_threat_id, mission.id],
      );
      if (!threats[0]) throw new HelperError(409, 'INVALID_STATE', 'The current Solo threat is not active.');
      const threatResult = await updateExplorationThreat(client, threats[0], effect.amount);
      appliedSummary = threatResult.transition.triggered
        ? `The threat advanced by ${effect.amount} and triggered.`
        : `The threat advanced by ${effect.amount} to ${threatResult.transition.counter}.`;
      effectState = {
        threat: soloThreatForOutput(threatResult.threat, { revealTriggerEffect: threatResult.transition.triggered }),
        threatTransition: threatResult.transition,
      };
      mechanicalEvents.push({
        type: threatResult.transition.triggered ? 'solo.threat_triggered' : 'solo.threat_advanced',
        actorId: state.player_character_id,
        payload: {
          missionId: mission.id,
          threatId: threats[0].id,
          amount: effect.amount,
          before: Number(threats[0].counter),
          after: threatResult.transition.counter,
          triggered: threatResult.transition.triggered,
          sourceRollId: sourceRoll.id,
        },
      });
    } else if (effect.type === 'new_danger') {
      if (!state.current_mission_id) {
        throw new HelperError(409, 'INVALID_STATE', 'A new danger requires an active Solo mission.');
      }
      const { rows: missions } = await client.query(
        `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
        [state.current_mission_id, input.campaign_id],
      );
      const mission = missions[0];
      if (!mission) throw new HelperError(409, 'INVALID_STATE', 'The current Solo mission is unavailable.');
      const { rows: waypoints } = await client.query(
        `SELECT * FROM solo_waypoints
         WHERE mission_id = $1 AND position = $2 AND status = 'active'
         FOR UPDATE`,
        [mission.id, mission.current_waypoint_index],
      );
      if (!waypoints[0]) {
        throw new HelperError(409, 'INVALID_STATE', 'A new danger requires a current active waypoint.');
      }
      const { rows: dangers } = await client.query(
        `INSERT INTO solo_dangers (
           campaign_id, mission_id, waypoint_id, description, source_roll_id
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.campaign_id, mission.id, waypoints[0].id, effect.description, sourceRoll.id],
      );
      await client.query(
        `UPDATE solo_waypoints
         SET danger_ids = danger_ids || jsonb_build_array($1::text)
         WHERE id = $2`,
        [dangers[0].id, waypoints[0].id],
      );
      appliedSummary = `A new danger was added: ${effect.description}`;
      effectState = {
        danger: {
          id: dangers[0].id,
          missionId: mission.id,
          waypointId: waypoints[0].id,
          description: dangers[0].description,
          status: dangers[0].status,
        },
      };
      mechanicalEvents.push({
        type: 'solo.danger_added',
        actorId: state.player_character_id,
        payload: {
          missionId: mission.id,
          waypointId: waypoints[0].id,
          dangerId: dangers[0].id,
          description: dangers[0].description,
          sourceRollId: sourceRoll.id,
        },
      });
    } else if (effect.type === 'add_diversion_waypoint') {
      if (!state.current_mission_id) {
        throw new HelperError(409, 'INVALID_STATE', 'A diversion requires an active Solo mission.');
      }
      const { rows: missions } = await client.query(
        `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
        [state.current_mission_id, input.campaign_id],
      );
      const mission = missions[0];
      if (!mission) throw new HelperError(409, 'INVALID_STATE', 'The current Solo mission is unavailable.');
      const insertedPosition = Number(mission.current_waypoint_index) + 1;
      await client.query(
        `UPDATE solo_waypoints SET position = position + 1000000
         WHERE mission_id = $1 AND position >= $2`,
        [mission.id, insertedPosition],
      );
      await client.query(
        `UPDATE solo_waypoints SET position = position - 999999
         WHERE mission_id = $1 AND position >= 1000000`,
        [mission.id],
      );
      const { rows: diversionRows } = await client.query(
        `INSERT INTO solo_waypoints (mission_id, position, kind, status)
         VALUES ($1, $2, 'diversion', 'hidden')
         RETURNING *`,
        [mission.id, insertedPosition],
      );
      await client.query(
        `INSERT INTO solo_waypoint_secrets (waypoint_id, payload, generated_from)
         VALUES ($1, $2::jsonb, $3::jsonb)`,
        [
          diversionRows[0].id,
          JSON.stringify({ title: effect.title, description: effect.description }),
          JSON.stringify([{ sourceRollId: sourceRoll.id, kind: 'fail_forward_consequence' }]),
        ],
      );
      appliedSummary = `A hidden diversion waypoint was inserted next in the route: ${effect.title}`;
      effectState = {
        diversionWaypoint: soloWaypointForOutput(diversionRows[0]),
        insertedPosition,
      };
      mechanicalEvents.push({
        type: 'solo.diversion_waypoint_added',
        actorId: state.player_character_id,
        payload: {
          missionId: mission.id,
          waypointId: diversionRows[0].id,
          position: insertedPosition,
          sourceRollId: sourceRoll.id,
        },
      });
    }

    let choiceRoll = null;
    if (choiceDie !== null) {
      choiceRoll = await insertRecordedRoll(client, {
        campaignId: input.campaign_id,
        sessionId: access.campaign.active_session_id,
        actorId: state.player_character_id,
        userId: user.id,
        purpose: `Choose consequence for ${sourceRoll.purpose}`,
        expression: '1d6',
        dice: [choiceDie],
        keptIndices: [0],
        keptValues: [choiceDie],
        tableKey: null,
        tableVersion: state.ruleset_version,
        result: {
          action: 'solo_check_consequence_choice',
          sourceRollId: sourceRoll.id,
          selectedIndex,
          selectedDescription: selected.description,
          ranges: ['1-3', '4-6'],
        },
        previousRollId: sourceRoll.id,
        campaignRevision: resultingRevision,
      });
    }

    const { rows: consequences } = await client.query(
      `INSERT INTO solo_check_consequences (
         campaign_id, source_roll_id, resolution_mode, options, selected_index,
         selected_description, selected_effect, choice_roll_id, applied_summary, created_by
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)
       RETURNING *`,
      [
        input.campaign_id,
        sourceRoll.id,
        input.resolution.mode,
        JSON.stringify(options),
        selectedIndex,
        selected.description,
        JSON.stringify(effect),
        choiceRoll?.id || null,
        appliedSummary,
        user.id,
      ],
    );
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);

    let sequence = await nextEventSequence(client, input.campaign_id);
    const eventIds = [await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.check_consequence_resolved',
      actorId: state.player_character_id,
      payload: {
        sourceRollId: sourceRoll.id,
        consequenceId: consequences[0].id,
        resolutionMode: input.resolution.mode,
        choiceRollId: choiceRoll?.id || null,
        choiceDie,
        selectedIndex,
        description: selected.description,
        effect,
        appliedSummary,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    })];
    sequence += 1;
    for (const event of mechanicalEvents) {
      eventIds.push(await insertEvent(client, {
        campaign: access.campaign,
        user,
        sequence,
        type: event.type,
        actorId: event.actorId,
        payload: { ...event.payload, reason: input.reason },
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
      summary: `${selected.description} ${appliedSummary}`,
      state_excerpt: {
        sourceRollId: sourceRoll.id,
        consequence: {
          id: consequences[0].id,
          resolutionMode: input.resolution.mode,
          options,
          selectedIndex,
          selectedDescription: selected.description,
          selectedEffect: effect,
          choiceRoll: choiceRoll ? recordedRollForOutput(choiceRoll) : null,
          appliedSummary,
        },
        ...effectState,
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

export async function startSoloMission(user, input, { sourceClient } = {}) {
  const operation = 'start_solo_mission';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (input.unknown_waypoint_count !== undefined
      && input.foreseen_waypoints.length + input.unknown_waypoint_count + 2 > 12) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'A Solo mission route may contain at most 12 waypoints.');
    }

    const { rows: pendingAdvancements } = await client.query(
      `SELECT id FROM solo_mission_advancements WHERE campaign_id = $1 AND status <> 'complete' LIMIT 1`,
      [input.campaign_id],
    );
    if (pendingAdvancements[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'Resolve the previous successful mission advancement before starting another mission.');
    }

    if (state.current_mission_id) {
      const { rows: currentMissions } = await client.query(
        `SELECT id, title, status FROM solo_missions WHERE id = $1 FOR UPDATE`,
        [state.current_mission_id],
      );
      const current = currentMissions[0];
      if (current && ['active', 'returning', 'briefing'].includes(current.status)) {
        throw new HelperError(
          409,
          'INVALID_STATE',
          `Solo mission “${current.title}” is already ${current.status}.`,
        );
      }
    }

    const { rows: missionRows } = await client.query(
      `INSERT INTO solo_missions (
         campaign_id, title, objective, status, current_waypoint_index, started_at
       ) VALUES ($1, $2, $3, 'active', 0, now())
       RETURNING *`,
      [input.campaign_id, input.title, input.objective],
    );
    let mission = missionRows[0];
    const unknownCount = input.unknown_waypoint_count
      ?? Math.max(0, input.waypoint_count - 2 - input.foreseen_waypoints.length);
    const plannedRoute = [
      { kind: 'foreseen', status: 'active', ...input.opening_waypoint },
      ...input.foreseen_waypoints.map((waypoint) => ({ kind: 'foreseen', status: 'revealed', ...waypoint })),
      ...Array.from({ length: unknownCount }, () => ({ kind: 'unknown', status: 'hidden', title: null, description: null })),
      { kind: 'foreseen', status: 'revealed', title: 'Objective', description: input.objective },
    ];
    const waypointRows = [];
    for (let position = 0; position < plannedRoute.length; position += 1) {
      const planned = plannedRoute[position];
      const { rows } = await client.query(
        `INSERT INTO solo_waypoints (
           mission_id, position, kind, status, title, description
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [mission.id, position, planned.kind, planned.status, planned.title, planned.description],
      );
      waypointRows.push(rows[0]);
      if (planned.kind === 'unknown') {
        await client.query(
          `INSERT INTO solo_waypoint_secrets (waypoint_id, payload, generated_from)
           VALUES ($1, '{}'::jsonb, '[]'::jsonb)`,
          [rows[0].id],
        );
      }
    }
    const objectiveWaypoint = waypointRows[waypointRows.length - 1];

    const { rows: threatRows } = await client.query(
      `INSERT INTO solo_threats (
         mission_id, description, counter, recurring, status, trigger_effect
       ) VALUES ($1, $2, 1, $3, 'active', $4::jsonb)
       RETURNING *`,
      [mission.id, input.threat.description, input.threat.recurring, JSON.stringify(input.threat.trigger_effect)],
    );
    const threat = threatRows[0];
    const { rows: updatedMissionRows } = await client.query(
      `UPDATE solo_missions SET active_threat_id = $1, objective_waypoint_id = $2 WHERE id = $3 RETURNING *`,
      [threat.id, objectiveWaypoint.id, mission.id],
    );
    mission = updatedMissionRows[0];
    await client.query(
      `UPDATE solo_campaign_states SET current_mission_id = $1 WHERE campaign_id = $2`,
      [mission.id, input.campaign_id],
    );
    const resultingRevision = previousRevision + 1;
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.mission_started',
      actorId: state.player_character_id,
      payload: {
        missionId: mission.id,
        title: mission.title,
        objective: mission.objective,
        waypointCount: waypointRows.length,
        currentWaypointId: waypointRows[0].id,
        threatId: threat.id,
        threatCounter: 1,
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
      summary: `Solo mission “${mission.title}” started at ${waypointRows[0].title}. Threat begins at 1.`,
      state_excerpt: {
        mission: soloMissionForOutput(mission),
        waypoints: waypointRows.map(soloWaypointForOutput),
        currentWaypoint: soloWaypointForOutput(waypointRows[0]),
        threat: soloThreatForOutput(threat),
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

export async function revealWaypoint(user, input, { sourceClient } = {}) {
  const operation = 'reveal_waypoint';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (!state.current_mission_id) {
      throw new HelperError(409, 'INVALID_STATE', 'There is no current solo mission.');
    }
    const { rows: missionRows } = await client.query(
      `SELECT * FROM solo_missions
       WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
      [state.current_mission_id, input.campaign_id],
    );
    const mission = missionRows[0];
    if (!mission || !['active', 'returning'].includes(mission.status)) {
      throw new HelperError(409, 'INVALID_STATE', 'The current solo mission cannot advance waypoints.');
    }
    const { rows: waypoints } = await client.query(
      `SELECT * FROM solo_waypoints WHERE mission_id = $1 ORDER BY position FOR UPDATE`,
      [mission.id],
    );
    const current = waypoints.find(
      (waypoint) => Number(waypoint.position) === Number(mission.current_waypoint_index),
    );
    const target = waypoints.find((waypoint) => waypoint.id === input.waypoint_id);
    if (!target || Number(target.position) !== Number(mission.current_waypoint_index) + 1) {
      throw new HelperError(
        400,
        'VALIDATION_ERROR',
        'Only the next waypoint in the current mission may be revealed.',
      );
    }
    const { rows: secretRows } = await client.query(
      `SELECT payload FROM solo_waypoint_secrets WHERE waypoint_id = $1`,
      [target.id],
    );
    const storedSecret = secretRows[0]?.payload || {};
    const suppliedTitle = input.title || storedSecret.title;
    const suppliedDescription = input.description || storedSecret.description;
    if (['unknown', 'diversion', 'return_route'].includes(target.kind) && (!suppliedTitle || !suppliedDescription)) {
      throw new HelperError(
        400,
        'VALIDATION_ERROR',
        'A newly revealed hidden waypoint requires a title and description.',
      );
    }
    if (input.generated_from_roll_ids.length > 0) {
      const { rows: rollRows } = await client.query(
        `SELECT id FROM recorded_rolls
         WHERE campaign_id = $1 AND id = ANY($2::uuid[])`,
        [input.campaign_id, input.generated_from_roll_ids],
      );
      if (rollRows.length !== new Set(input.generated_from_roll_ids).size) {
        throw new HelperError(400, 'VALIDATION_ERROR', 'One or more referenced rolls do not belong to this campaign.');
      }
    }

    if (current?.status === 'active') {
      await client.query(
        `UPDATE solo_waypoints SET status = 'resolved' WHERE id = $1`,
        [current.id],
      );
    }
    const hiddenGenerated = ['unknown', 'diversion', 'return_route'].includes(target.kind);
    const revealedTitle = hiddenGenerated ? suppliedTitle : target.title;
    const revealedDescription = hiddenGenerated ? suppliedDescription : target.description;
    const { rows: targetRows } = await client.query(
      `UPDATE solo_waypoints
       SET status = 'active', title = $1, description = $2
       WHERE id = $3
       RETURNING *`,
      [revealedTitle, revealedDescription, target.id],
    );
    const revealed = targetRows[0];
    if (hiddenGenerated) {
      await client.query(
        `UPDATE solo_waypoint_secrets
         SET payload = $1::jsonb, generated_from = $2::jsonb
         WHERE waypoint_id = $3`,
        [
          JSON.stringify({ title: revealedTitle, description: revealedDescription }),
          JSON.stringify(input.generated_from_roll_ids.map((rollId) => ({ rollId }))),
          target.id,
        ],
      );
    }
    const { rows: updatedMissionRows } = await client.query(
      `UPDATE solo_missions SET current_waypoint_index = $1 WHERE id = $2 RETURNING *`,
      [target.position, mission.id],
    );
    const resultingRevision = previousRevision + 1;
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.waypoint_revealed',
      actorId: state.player_character_id,
      payload: {
        missionId: mission.id,
        previousWaypointId: current?.id || null,
        waypointId: revealed.id,
        position: Number(revealed.position),
        kind: revealed.kind,
        title: revealed.title,
        description: revealed.description,
        generatedFromRollIds: input.generated_from_roll_ids,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const refreshedWaypoints = waypoints.map((waypoint) => {
      if (current && waypoint.id === current.id) return { ...waypoint, status: 'resolved' };
      if (waypoint.id === revealed.id) return revealed;
      return waypoint;
    });
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `Waypoint revealed: ${revealed.title}.`,
      state_excerpt: {
        mission: soloMissionForOutput(updatedMissionRows[0]),
        waypoints: refreshedWaypoints.map(soloWaypointForOutput),
        currentWaypoint: soloWaypointForOutput(revealed),
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

export async function advanceThreat(user, input, { sourceClient } = {}) {
  const operation = 'advance_threat';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (!state.current_mission_id) {
      throw new HelperError(409, 'INVALID_STATE', 'There is no current solo mission.');
    }
    const { rows: threatRows } = await client.query(
      `SELECT threat.*
       FROM solo_threats threat
       JOIN solo_missions mission ON mission.id = threat.mission_id
       WHERE threat.id = $1 AND mission.id = $2 AND mission.campaign_id = $3
       FOR UPDATE OF threat`,
      [input.threat_id, state.current_mission_id, input.campaign_id],
    );
    const threat = threatRows[0];
    if (!threat) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'The requested threat is not active in the current mission.');
    }
    let resolution;
    try {
      resolution = advanceThreatState({
        counter: Number(threat.counter),
        recurring: threat.recurring,
        status: threat.status,
      }, input.amount);
    } catch (error) {
      throw new HelperError(409, 'INVALID_STATE', error.message);
    }
    const { rows: updatedRows } = await client.query(
      `UPDATE solo_threats SET counter = $1, status = $2 WHERE id = $3 RETURNING *`,
      [resolution.counter, resolution.status, threat.id],
    );
    const updatedThreat = updatedRows[0];
    const resultingRevision = previousRevision + 1;
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: resolution.triggered ? 'solo.threat_triggered' : 'solo.threat_advanced',
      actorId: state.player_character_id,
      payload: {
        missionId: state.current_mission_id,
        threatId: threat.id,
        previousCounter: resolution.previousCounter,
        requestedAmount: resolution.requestedAmount,
        appliedAmount: resolution.appliedAmount,
        reachedCounter: resolution.reachedCounter,
        resultingCounter: resolution.counter,
        recurring: threat.recurring,
        triggered: resolution.triggered,
        ...(resolution.triggered ? { triggerEffect: threat.trigger_effect || {} } : {}),
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
      summary: resolution.triggered
        ? `Threat triggered at 6 and awaits resolution${threat.recurring ? ' before it resets to 1' : ''}: ${threat.description}`
        : `Threat advanced from ${resolution.previousCounter} to ${resolution.counter}: ${threat.description}`,
      state_excerpt: {
        threat: soloThreatForOutput(updatedThreat, { revealTriggerEffect: resolution.triggered }),
        transition: resolution,
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

export async function resolveThreat(user, input, { sourceClient } = {}) {
  const operation = 'resolve_solo_threat';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const { rows } = await client.query(
      `SELECT threat.* FROM solo_threats threat
       JOIN solo_missions mission ON mission.id = threat.mission_id
       WHERE threat.id = $1 AND mission.id = $2 AND mission.campaign_id = $3
       FOR UPDATE OF threat`,
      [input.threat_id, state.current_mission_id, input.campaign_id],
    );
    const threat = rows[0];
    if (!threat || threat.status !== 'triggered') {
      throw new HelperError(409, 'INVALID_STATE', 'Only the current triggered threat can be resolved.');
    }
    const resultingStatus = threat.recurring ? 'active' : 'resolved';
    const resultingCounter = threat.recurring ? 1 : 6;
    const { rows: updatedRows } = await client.query(
      `UPDATE solo_threats SET status = $1, counter = $2 WHERE id = $3 RETURNING *`,
      [resultingStatus, resultingCounter, threat.id],
    );
    if (!threat.recurring) {
      await client.query(
        `UPDATE solo_missions SET active_threat_id = NULL WHERE id = $1 AND active_threat_id = $2`,
        [threat.mission_id, threat.id],
      );
    }
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.threat_resolved', actorId: state.player_character_id,
      payload: { threatId: threat.id, recurring: threat.recurring, resolution: input.resolution, resultingStatus, resultingCounter, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = {
      success: true, campaign_revision: resultingRevision, event_ids: [eventId],
      summary: threat.recurring
        ? `Recurring threat resolved and reset to 1: ${threat.description}`
        : `Threat resolved and removed from the active mission: ${threat.description}`,
      state_excerpt: { threat: soloThreatForOutput(updatedRows[0], { revealTriggerEffect: true }), activeThreatId: threat.recurring ? threat.id : null },
    };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function setSoloThreat(user, input, { sourceClient } = {}) {
  const operation = 'set_solo_threat';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const { rows: missions } = await client.query(
      `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2 AND status IN ('active','returning') FOR UPDATE`,
      [state.current_mission_id, input.campaign_id],
    );
    const mission = missions[0];
    if (!mission) throw new HelperError(409, 'INVALID_STATE', 'There is no active Solo mission.');
    if (mission.active_threat_id && !input.replace_existing) {
      throw new HelperError(409, 'INVALID_STATE', 'The mission already has an active or triggered threat.');
    }
    if (mission.active_threat_id) {
      await client.query(`UPDATE solo_threats SET status = 'removed' WHERE id = $1 AND status IN ('active','triggered')`, [mission.active_threat_id]);
    }
    const { rows } = await client.query(
      `INSERT INTO solo_threats (mission_id, description, counter, recurring, status, trigger_effect)
       VALUES ($1, $2, 1, $3, 'active', $4::jsonb) RETURNING *`,
      [mission.id, input.description, input.recurring, JSON.stringify(input.trigger_effect)],
    );
    await client.query('UPDATE solo_missions SET active_threat_id = $1 WHERE id = $2', [rows[0].id, mission.id]);
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.threat_set', actorId: state.player_character_id,
      payload: { missionId: mission.id, threatId: rows[0].id, replacedThreatId: mission.active_threat_id || null, recurring: input.recurring, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = { success: true, campaign_revision: resultingRevision, event_ids: [eventId], summary: `New mission threat begins at 1: ${input.description}`, state_excerpt: { threat: soloThreatForOutput(rows[0]) } };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

function normalizedSkillName(value) {
  return String(value || '').trim().toLocaleLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
    .replace(/\s+/g, ' ');
}

function actorSkill(actor, skillName) {
  const targetName = normalizedSkillName(skillName);
  const match = Object.entries(actor.skills || {}).find(([name]) => normalizedSkillName(name) === targetName);
  const target = Number(match?.[1]);
  return Number.isInteger(target) && target >= 1 && target <= 20
    ? { name: match[0], target }
    : null;
}

function actorCheckTarget(actor, checkType, checkName) {
  if (checkType === 'attribute') {
    const canonicalName = String(checkName || '').trim().toUpperCase();
    if (!['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'].includes(canonicalName)) {
      throw new HelperError(400, 'VALIDATION_ERROR', `Unsupported Dragonbane attribute: ${checkName}.`);
    }
    const target = Number(actor.attributes?.[canonicalName]);
    if (!Number.isInteger(target) || target < 1 || target > 20) {
      throw new HelperError(409, 'INVALID_STATE', `The solo hero has no usable ${canonicalName} attribute value.`);
    }
    return { name: canonicalName, target };
  }

  const targetName = normalizedSkillName(checkName);
  const match = Object.entries(actor.skills || {}).find(([name]) => normalizedSkillName(name) === targetName);
  const target = Number(match?.[1]);
  if (!match || !Number.isInteger(target) || target < 1 || target > 20) {
    throw new HelperError(409, 'INVALID_STATE', `The solo hero has no usable ${checkName} skill value.`);
  }
  return { name: match[0], target };
}

async function markSkillAdvancement(client, loadedActor, skillName, check) {
  const priorMarks = Array.isArray(loadedActor.storage?.row?.marked_skills)
    ? loadedActor.storage.row.marked_skills
    : Array.isArray(loadedActor.actor?.markedSkills) ? loadedActor.actor.markedSkills : [];
  const eligible = ['dragon', 'demon'].includes(check?.outcome);
  const alreadyMarked = eligible && priorMarks.some(
    (name) => normalizedSkillName(name) === normalizedSkillName(skillName),
  );
  const added = eligible && !alreadyMarked;
  const markedSkills = added ? [...priorMarks, skillName] : priorMarks;
  if (added) {
    if (loadedActor.storage?.type !== 'character') {
      throw new HelperError(409, 'INVALID_STATE', 'Only a player-character skill can be marked for advancement.');
    }
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query('UPDATE characters SET marked_skills = $1 WHERE id = $2', [markedSkills, loadedActor.actor.id]);
    loadedActor.storage.row.marked_skills = markedSkills;
    loadedActor.actor.markedSkills = markedSkills;
  }
  return { skill: skillName, eligible, added, alreadyMarked, markedSkills };
}

async function loadExplorationContext(client, campaignId, waypointId, state) {
  if (!state.current_mission_id) {
    throw new HelperError(409, 'INVALID_STATE', 'There is no current solo mission.');
  }
  const { rows: missions } = await client.query(
    `SELECT * FROM solo_missions
     WHERE id = $1 AND campaign_id = $2 AND status IN ('active', 'returning')
     FOR UPDATE`,
    [state.current_mission_id, campaignId],
  );
  const mission = missions[0];
  if (!mission) throw new HelperError(409, 'INVALID_STATE', 'The current solo mission cannot be explored.');

  const { rows: waypoints } = await client.query(
    `SELECT * FROM solo_waypoints
     WHERE id = $1 AND mission_id = $2
     FOR UPDATE`,
    [waypointId, mission.id],
  );
  const waypoint = waypoints[0];
  if (
    !waypoint
    || waypoint.status !== 'active'
    || Number(waypoint.position) !== Number(mission.current_waypoint_index)
  ) {
    throw new HelperError(400, 'VALIDATION_ERROR', 'Only the current active waypoint may be explored.');
  }

  const { rows: threats } = await client.query(
    `SELECT * FROM solo_threats
     WHERE id = $1 AND mission_id = $2 AND status = 'active'
     FOR UPDATE`,
    [mission.active_threat_id, mission.id],
  );
  const threat = threats[0];

  await client.query(
    `INSERT INTO solo_waypoint_exploration (waypoint_id)
     VALUES ($1)
     ON CONFLICT (waypoint_id) DO NOTHING`,
    [waypoint.id],
  );
  const { rows: explorationRows } = await client.query(
    `SELECT * FROM solo_waypoint_exploration WHERE waypoint_id = $1 FOR UPDATE`,
    [waypoint.id],
  );
  return { mission, waypoint, threat, exploration: explorationRows[0] };
}

async function updateExplorationThreat(client, threat, amount) {
  const transition = advanceThreatState({
    counter: Number(threat.counter),
    recurring: threat.recurring,
    status: threat.status,
  }, amount);
  const { rows } = await client.query(
    `UPDATE solo_threats SET counter = $1, status = $2 WHERE id = $3 RETURNING *`,
    [transition.counter, transition.status, threat.id],
  );
  return { transition, threat: rows[0] };
}

function explorationFindingSummary(groups) {
  const labels = groups.flatMap((group) => group.results.map((result) => {
    const additions = [];
    if (result.subtable?.label) additions.push(result.subtable.label);
    if (result.waypointCount) additions.push(`${result.waypointCount} new waypoint${result.waypointCount === 1 ? '' : 's'}`);
    if (result.locationDetails?.details?.length) {
      additions.push(result.locationDetails.details.map(
        ({ category, detail }) => `${category.label}: ${detail.label}`,
      ).join('; '));
    }
    if (result.rerollAfterResolution && result.requiredCheck) {
      additions.push(`${result.requiredCheck.skill} with a ${result.requiredCheck.modifier}, then reroll`);
    }
    return additions.length ? `${result.label} (${additions.join('; ')})` : result.label;
  }));
  return labels.length > 0 ? labels.join(' + ') : 'Nothing useful';
}

async function loadExplorationTables(client, keys) {
  const tables = await Promise.all(keys.map((key) => (
    loadSoloRuleTable(client, key, ACTIVE_SOLO_EXPLORATION_TABLE_VERSION)
  )));
  return Object.fromEntries(tables.map((table) => [table.tableKey, table]));
}

async function insertGeneratedWaypoints(client, {
  mission,
  count,
  kind,
  generatedFrom,
  generateLocations = true,
}) {
  const insertedPosition = Number(mission.current_waypoint_index) + 1;
  await client.query(
    `UPDATE solo_waypoints SET position = position + 1000000
     WHERE mission_id = $1 AND position >= $2`,
    [mission.id, insertedPosition],
  );
  await client.query(
    `UPDATE solo_waypoints SET position = position - $3
     WHERE mission_id = $1 AND position >= 1000000`,
    [mission.id, insertedPosition, 1000000 - count],
  );
  const tables = generateLocations
    ? await loadExplorationTables(client, ['solo_area', ...SOLO_LOCATION_TABLE_KEYS])
    : null;
  const waypoints = [];
  const resolutions = [];
  for (let index = 0; index < count; index += 1) {
    const location = tables ? resolveRandomLocation(tables) : null;
    const { rows } = await client.query(
      `INSERT INTO solo_waypoints (mission_id, position, kind, status)
       VALUES ($1, $2, $3, 'hidden') RETURNING *`,
      [mission.id, insertedPosition + index, kind],
    );
    const waypoint = rows[0];
    await client.query(
      `INSERT INTO solo_waypoint_secrets (waypoint_id, payload, generated_from)
       VALUES ($1, $2::jsonb, $3::jsonb)`,
      [
        waypoint.id,
        JSON.stringify(location ? { title: location.title, description: location.description } : {}),
        JSON.stringify(generatedFrom),
      ],
    );
    waypoints.push(waypoint);
    if (location) resolutions.push(location);
  }
  return { waypoints, resolutions, insertedPosition };
}

export async function addSoloWaypoints(user, input, { sourceClient } = {}) {
  const operation = 'add_solo_waypoints';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const { rows: missions } = await client.query(
      `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2 AND status IN ('active','returning') FOR UPDATE`,
      [state.current_mission_id, input.campaign_id],
    );
    const mission = missions[0];
    if (!mission) throw new HelperError(409, 'INVALID_STATE', 'There is no active Solo mission.');
    const inserted = await insertGeneratedWaypoints(client, {
      mission, count: input.count, kind: input.kind,
      generateLocations: input.generate_locations,
      generatedFrom: [{ kind: 'route_change', reason: input.reason }],
    });
    const resultingRevision = previousRevision + 1;
    const dice = inserted.resolutions.flatMap((resolution) => resolution.dice);
    const roll = dice.length ? await insertRecordedRoll(client, {
      campaignId: input.campaign_id, sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id, userId: user.id,
      purpose: `Generate ${input.count} ${input.kind} waypoint${input.count === 1 ? '' : 's'}`,
      expression: inserted.resolutions.map((resolution) => resolution.expression).join(' + '),
      dice, keptIndices: dice.map((_, index) => index), keptValues: [...dice],
      tableKey: 'solo_area', tableVersion: ACTIVE_SOLO_EXPLORATION_TABLE_VERSION,
      result: { action: 'solo_waypoints_added', kind: input.kind, count: input.count, generatedLocations: inserted.resolutions },
      campaignRevision: resultingRevision,
    }) : null;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.waypoints_added', actorId: state.player_character_id,
      payload: { missionId: mission.id, waypointIds: inserted.waypoints.map(({ id }) => id), count: input.count, kind: input.kind, rollId: roll?.id || null, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = {
      success: true, campaign_revision: resultingRevision, event_ids: [eventId],
      summary: `${input.count} hidden ${input.kind} waypoint${input.count === 1 ? '' : 's'} added after the current scene.`,
      state_excerpt: { waypoints: inserted.waypoints.map(soloWaypointForOutput), roll: roll ? recordedRollForOutput(roll) : null },
    };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function beginSoloReturn(user, input, { sourceClient } = {}) {
  const operation = 'begin_solo_return';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (input.route_type === 'dangerous' && !input.check_skill) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Dangerous return routes require Awareness or Sneaking.');
    }
    const { rows: missions } = await client.query(
      `SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2 AND status = 'active' FOR UPDATE`,
      [state.current_mission_id, input.campaign_id],
    );
    let mission = missions[0];
    if (!mission) throw new HelperError(409, 'INVALID_STATE', 'There is no outbound Solo mission ready for a return journey.');
    const { rows: objectiveRows } = await client.query(
      `SELECT * FROM solo_waypoints WHERE id = $1 AND mission_id = $2`,
      [mission.objective_waypoint_id, mission.id],
    );
    const objective = objectiveRows[0];
    if (!objective || !['active', 'resolved'].includes(objective.status)) {
      throw new HelperError(409, 'INVALID_STATE', 'Reach the final objective before beginning the return journey.');
    }
    let check = null;
    let routeRoll = null;
    let inserted;
    if (input.route_type === 'dangerous') {
      const actor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
      const skill = actorSkill(actor.actor, input.check_skill);
      if (!skill) throw new HelperError(409, 'INVALID_STATE', `The Solo hero has no usable ${input.check_skill} skill.`);
      check = resolveSoloSkillCheck({ target: skill.target });
      const failed = ['failure', 'demon'].includes(check.outcome);
      inserted = await insertGeneratedWaypoints(client, {
        mission, count: failed ? 2 : 1, kind: 'return_route', generateLocations: failed,
        generatedFrom: [{ kind: 'dangerous_return', check: input.check_skill, outcome: check.outcome }],
      });
      const first = inserted.waypoints[0];
      if (!failed) {
        await client.query(
          `UPDATE solo_waypoint_secrets SET payload = $1::jsonb WHERE waypoint_id = $2`,
          [JSON.stringify({ title: 'Surface', description: 'The cleared route leads safely back to the surface.' }), first.id],
        );
      } else {
        const surface = inserted.waypoints[1];
        await client.query(
          `UPDATE solo_waypoint_secrets SET payload = $1::jsonb WHERE waypoint_id = $2`,
          [JSON.stringify({ title: 'Surface', description: 'The return route finally reaches safety.' }), surface.id],
        );
      }
    } else if (input.route_type === 'alternative') {
      routeRoll = resolveAlternativeReturnRoute();
      inserted = await insertGeneratedWaypoints(client, {
        mission, count: routeRoll.waypointCount, kind: 'return_route', generateLocations: true,
        generatedFrom: [{ kind: 'alternative_return', d4: routeRoll.dice[0] }],
      });
      const last = inserted.waypoints.at(-1);
      await client.query(
        `UPDATE solo_waypoint_secrets SET payload = $1::jsonb WHERE waypoint_id = $2`,
        [JSON.stringify({ title: 'Surface', description: 'The alternative route emerges at the surface.' }), last.id],
      );
    } else {
      inserted = await insertGeneratedWaypoints(client, {
        mission, count: 1, kind: 'return_route', generateLocations: false,
        generatedFrom: [{ kind: 'cleared_return' }],
      });
      await client.query(
        `UPDATE solo_waypoint_secrets SET payload = $1::jsonb WHERE waypoint_id = $2`,
        [JSON.stringify({ title: 'Surface', description: 'The cleared route leads safely back to the surface.' }), inserted.waypoints[0].id],
      );
    }
    const resultingRevision = previousRevision + 1;
    const locationDice = inserted.resolutions.flatMap((resolution) => resolution.dice);
    const dice = [...(check?.dice || []), ...(routeRoll?.dice || []), ...locationDice];
    const roll = dice.length ? await insertRecordedRoll(client, {
      campaignId: input.campaign_id, sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id, userId: user.id,
      purpose: `${input.route_type} return journey`,
      expression: [check?.expression, routeRoll?.expression, ...inserted.resolutions.map((resolution) => resolution.expression)].filter(Boolean).join(' + '),
      dice, keptIndices: dice.map((_, index) => index), keptValues: [...dice],
      tableKey: inserted.resolutions.length ? 'solo_area' : null, tableVersion: state.ruleset_version,
      result: { action: 'solo_return_started', routeType: input.route_type, checkSkill: input.check_skill || null, check, waypointCount: inserted.waypoints.length },
      campaignRevision: resultingRevision,
    }) : null;
    let returnDanger = null;
    if (input.route_type === 'dangerous' && ['failure', 'demon'].includes(check?.outcome)) {
      const dangerDescription = `Danger on the previous waypoint: ${inserted.resolutions[0]?.description || 'an unexpected return-route danger'}`;
      const { rows } = await client.query(
        `INSERT INTO solo_dangers (campaign_id, mission_id, waypoint_id, description, source_roll_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.campaign_id, mission.id, objective.id, dangerDescription, roll?.id || null],
      );
      returnDanger = rows[0];
      await client.query(
        `UPDATE solo_waypoints SET danger_ids = danger_ids || jsonb_build_array($1::text) WHERE id = $2`,
        [returnDanger.id, objective.id],
      );
    }
    const { rows: updatedMissions } = await client.query(
      `UPDATE solo_missions SET status = 'returning', return_mode = $1 WHERE id = $2 RETURNING *`,
      [input.route_type, mission.id],
    );
    mission = updatedMissions[0];
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.return_started', actorId: state.player_character_id,
      payload: { missionId: mission.id, routeType: input.route_type, checkSkill: input.check_skill || null, check, waypointIds: inserted.waypoints.map(({ id }) => id), rollId: roll?.id || null, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = {
      success: true, campaign_revision: resultingRevision, event_ids: [eventId],
      summary: input.route_type === 'cleared'
        ? 'The cleared return journey begins without incident.'
        : input.route_type === 'alternative'
          ? `The impossible direct route becomes an alternative journey of ${routeRoll.waypointCount} waypoints (D4+2).`
          : `${input.check_skill} ${check.outcome}; ${['failure', 'demon'].includes(check.outcome) ? 'danger waits at the previous waypoint before the surface route.' : 'the dangerous route reaches the surface safely.'}`,
      state_excerpt: {
        mission: soloMissionForOutput(mission),
        waypoints: inserted.waypoints.map(soloWaypointForOutput),
        roll: roll ? recordedRollForOutput(roll) : null,
        danger: returnDanger ? {
          id: returnDanger.id, waypointId: returnDanger.waypoint_id,
          description: returnDanger.description, status: returnDanger.status,
        } : null,
      },
    };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function searchWaypoint(user, input, { sourceClient } = {}) {
  const operation = 'search_waypoint';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const context = await loadExplorationContext(client, input.campaign_id, input.waypoint_id, state);
    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    const tables = await loadExplorationTables(client, ['solo_search', ...SOLO_LOCATION_TABLE_KEYS]);
    const table = tables.solo_search;

    let check = null;
    let checkedSkillName = null;
    let findingGroups = [];
    if (input.known_nature) {
      findingGroups = [{
        expression: null,
        dice: [],
        dieSides: [],
        keptIndices: [],
        keptValues: [],
        rerollLimitReached: false,
        results: [{
          roll: null,
          key: 'known_item',
          label: 'The known hidden item is found without a table roll',
          kind: 'known',
          reroll: false,
        }],
      }];
    } else if (input.known_location) {
      findingGroups = [resolveExplorationFind(table.entries, secureRollDie, 5, {
        dieSides: table.dieSides,
        tables,
      })];
    } else {
      const selectedSkill = actorSkill(loadedActor.actor, 'Spot Hidden');
      if (!selectedSkill) {
        throw new HelperError(
          409,
          'INVALID_STATE',
          'The solo character has no usable Spot Hidden skill value.',
        );
      }
      checkedSkillName = selectedSkill.name;
      check = resolveSoloSkillCheck({ target: selectedSkill.target });
      if (check.outcome === 'dragon') {
        findingGroups = [
          resolveExplorationFind(table.entries, secureRollDie, 5, { dieSides: table.dieSides, tables }),
          resolveExplorationFind(table.entries, secureRollDie, 5, { dieSides: table.dieSides, tables }),
        ];
      } else if (check.outcome === 'success') {
        findingGroups = [resolveExplorationFind(table.entries, secureRollDie, 5, {
          dieSides: table.dieSides,
          tables,
        })];
      } else if (check.outcome === 'demon') {
        findingGroups = [{
          expression: null,
          dice: [],
          keptIndices: [],
          keptValues: [],
          rerollLimitReached: false,
          results: [{
            roll: null,
            key: 'new_danger',
            label: 'A new danger appears',
            kind: 'danger',
            reroll: false,
          }],
        }];
      }
    }

    const advancementMark = check
      ? await markSkillAdvancement(client, loadedActor, checkedSkillName, check)
      : { skill: null, eligible: false, added: false, alreadyMarked: false, markedSkills: loadedActor.actor.markedSkills || [] };

    const threatResult = context.threat
      ? await updateExplorationThreat(client, context.threat, 1)
      : null;
    const { rows: explorationRows } = await client.query(
      `UPDATE solo_waypoint_exploration
       SET search_count = search_count + 1,
         stretches_spent = stretches_spent + 1
       WHERE waypoint_id = $1
       RETURNING *`,
      [context.waypoint.id],
    );
    const resultingRevision = previousRevision + 1;
    const durationSeconds = SOLO_REST_SECONDS.stretch;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    const itemDurationChanges = await advanceCampaignEquipmentTime(client, input.campaign_id, durationSeconds);
    const gameTime = advanceGameTime(access.campaign.game_time, durationSeconds, {
      kind: 'solo_search',
      waypointId: context.waypoint.id,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1, game_time = $2::jsonb WHERE id = $3',
      [resultingRevision, JSON.stringify(gameTime), input.campaign_id],
    );

    const tableDice = findingGroups.flatMap((group) => group.dice);
    const dice = [...(check?.dice || []), ...tableDice];
    const expressionParts = [check?.expression, ...findingGroups.map((group) => group.expression)].filter(Boolean);
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `Search: ${context.waypoint.title || `waypoint ${context.waypoint.position + 1}`}`,
      expression: expressionParts.join(' + ') || 'no roll',
      dice,
      keptIndices: dice.map((_, index) => index),
      keptValues: [...dice],
      tableKey: input.known_nature ? null : table.tableKey,
      tableVersion: input.known_nature ? state.ruleset_version : table.version,
      result: {
        action: 'search',
        knownLocation: input.known_location,
        knownNature: input.known_nature,
        skill: checkedSkillName,
        check,
        advancementMark,
        findingChoices: findingGroups.map((group) => group.results),
        requiresChoice: check?.outcome === 'dragon',
        durationSeconds,
        gameTime,
        itemDurationChanges,
        context: input.context || null,
        sourceKind: table.sourceKind,
      },
      campaignRevision: resultingRevision,
    });

    const sequence = await nextEventSequence(client, input.campaign_id);
    const searchEventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.waypoint_searched',
      actorId: state.player_character_id,
      payload: {
        missionId: context.mission.id,
        waypointId: context.waypoint.id,
        rollId: rollRow.id,
        knownLocation: input.known_location,
        knownNature: input.known_nature,
        check,
        advancementMark,
        findingChoices: findingGroups.map((group) => group.results),
        requiresChoice: check?.outcome === 'dragon',
        searchCount: Number(explorationRows[0].search_count),
        stretchesSpent: Number(explorationRows[0].stretches_spent),
        durationSeconds,
        gameTime,
        itemDurationChanges,
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const threatEventId = threatResult ? await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence: sequence + 1,
      type: threatResult.transition.triggered ? 'solo.threat_triggered' : 'solo.threat_advanced',
      actorId: state.player_character_id,
      payload: {
        missionId: context.mission.id,
        waypointId: context.waypoint.id,
        threatId: context.threat.id,
        previousCounter: threatResult.transition.previousCounter,
        resultingCounter: threatResult.transition.counter,
        triggered: threatResult.transition.triggered,
        ...(threatResult.transition.triggered ? { triggerEffect: context.threat.trigger_effect || {} } : {}),
        reason: 'A thorough waypoint search consumes one stretch.',
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    }) : null;

    const outcome = input.known_nature ? 'known nature' : input.known_location ? 'known location' : check.outcome;
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [searchEventId, threatEventId].filter(Boolean),
      summary: `Search (${outcome}): ${explorationFindingSummary(findingGroups)}.${threatResult ? ` Threat ${threatResult.transition.previousCounter} → ${threatResult.transition.counter}.` : ' The mission currently has no active threat.'}`,
      state_excerpt: {
        roll: recordedRollForOutput(rollRow),
        waypoint: soloWaypointForOutput({ ...context.waypoint, ...explorationRows[0] }),
        threat: threatResult
          ? soloThreatForOutput(threatResult.threat, { revealTriggerEffect: threatResult.transition.triggered })
          : null,
        advancementMark,
        gameTime,
        itemDurationChanges,
        notice: 'Search uses the installed Solo v1.2 table. Structured follow-ups must be resolved before applying their effects.',
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

export async function scavengeWaypoint(user, input, { sourceClient } = {}) {
  const operation = 'scavenge_waypoint';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const context = await loadExplorationContext(client, input.campaign_id, input.waypoint_id, state);
    const tables = await loadExplorationTables(client, [
      'solo_scavenge',
      'solo_scavenge_danger',
      'solo_scavenge_supplies',
      'solo_scavenge_interesting_item',
    ]);
    const table = tables.solo_scavenge;
    const finding = resolveExplorationFind(table.entries, secureRollDie, 5, {
      dieSides: table.dieSides,
      tables,
    });
    const spendsStretch = input.spend_stretch || Number(context.exploration.scavenge_count) >= 1;
    const threatResult = spendsStretch && context.threat
      ? await updateExplorationThreat(client, context.threat, 1)
      : null;
    const { rows: explorationRows } = await client.query(
      `UPDATE solo_waypoint_exploration
       SET scavenge_count = scavenge_count + 1,
         stretches_spent = stretches_spent + $2
       WHERE waypoint_id = $1
       RETURNING *`,
      [context.waypoint.id, spendsStretch ? 1 : 0],
    );
    const resultingRevision = previousRevision + 1;
    const durationSeconds = spendsStretch ? SOLO_REST_SECONDS.stretch : 2 * 60;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    const itemDurationChanges = await advanceCampaignEquipmentTime(client, input.campaign_id, durationSeconds);
    const gameTime = advanceGameTime(access.campaign.game_time, durationSeconds, {
      kind: 'solo_scavenge',
      waypointId: context.waypoint.id,
      spentStretch: spendsStretch,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1, game_time = $2::jsonb WHERE id = $3',
      [resultingRevision, JSON.stringify(gameTime), input.campaign_id],
    );
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `Scavenge: ${context.waypoint.title || `waypoint ${context.waypoint.position + 1}`}`,
      expression: finding.expression,
      dice: finding.dice,
      keptIndices: finding.keptIndices,
      keptValues: finding.keptValues,
      tableKey: table.tableKey,
      tableVersion: table.version,
      result: {
        action: 'scavenge',
        findings: finding.results,
        rerollLimitReached: finding.rerollLimitReached,
        spentStretch: spendsStretch,
        durationSeconds,
        gameTime,
        itemDurationChanges,
        context: input.context || null,
        sourceKind: table.sourceKind,
      },
      campaignRevision: resultingRevision,
    });
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventIds = [await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.waypoint_scavenged',
      actorId: state.player_character_id,
      payload: {
        missionId: context.mission.id,
        waypointId: context.waypoint.id,
        rollId: rollRow.id,
        findings: finding.results,
        spentStretch: spendsStretch,
        scavengeCount: Number(explorationRows[0].scavenge_count),
        stretchesSpent: Number(explorationRows[0].stretches_spent),
        durationSeconds,
        gameTime,
        itemDurationChanges,
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    })];
    if (threatResult) {
      eventIds.push(await insertEvent(client, {
        campaign: access.campaign,
        user,
        sequence: sequence + 1,
        type: threatResult.transition.triggered ? 'solo.threat_triggered' : 'solo.threat_advanced',
        actorId: state.player_character_id,
        payload: {
          missionId: context.mission.id,
          waypointId: context.waypoint.id,
          threatId: context.threat.id,
          previousCounter: threatResult.transition.previousCounter,
          resultingCounter: threatResult.transition.counter,
          triggered: threatResult.transition.triggered,
          ...(threatResult.transition.triggered ? { triggerEffect: context.threat.trigger_effect || {} } : {}),
          reason: input.spend_stretch
            ? 'The scavenge took a stretch.'
            : 'Repeated scavenging at the same waypoint took a stretch.',
        },
        visibility: 'players',
        sourceClient,
        idempotencyKey: input.idempotency_key,
        previousRevision,
        resultingRevision,
      }));
    }
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: eventIds,
      summary: `Scavenge: ${explorationFindingSummary([finding])}.${threatResult ? ` Threat ${threatResult.transition.previousCounter} → ${threatResult.transition.counter}.` : spendsStretch ? ' A stretch passed; the mission has no active threat.' : ' Quick first pass; no threat advance.'}`,
      state_excerpt: {
        roll: recordedRollForOutput(rollRow),
        waypoint: soloWaypointForOutput({ ...context.waypoint, ...explorationRows[0] }),
        threat: threatResult
          ? soloThreatForOutput(threatResult.threat, { revealTriggerEffect: threatResult.transition.triggered })
          : soloThreatForOutput(context.threat),
        gameTime,
        itemDurationChanges,
        notice: 'Scavenge uses the installed Solo v1.2 table. Findings remain prompts until their inventory or story effects are confirmed.',
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

export async function takeSoloRest(user, input, { sourceClient } = {}) {
  const operation = 'take_solo_rest';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));

    const { rows: activeCombats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (activeCombats[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero cannot rest during an active combat encounter.');
    }
    if (input.rest_type === 'shift' && !input.safe_location) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'A shift rest requires an explicitly confirmed safe location.');
    }

    await client.query(
      `INSERT INTO solo_rest_states (campaign_id) VALUES ($1) ON CONFLICT (campaign_id) DO NOTHING`,
      [input.campaign_id],
    );
    const restState = await loadSoloRestState(client, input.campaign_id, { forUpdate: true });
    if (input.rest_type === 'round' && restState.round_rest_taken) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero has already taken a round rest during this shift.');
    }
    if (input.rest_type === 'stretch' && restState.stretch_rest_taken) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero has already taken a stretch rest during this shift.');
    }

    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    const actor = loadedActor.actor;
    if (actor.currentHp <= 0) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        'The solo hero is at 0 HP. Resolve rallying or a life-saving Healing attempt before taking a normal rest.',
      );
    }
    const activeStandardConditions = actor.conditions.filter((condition) => STANDARD_CONDITION_KEYS.has(condition.key));
    if (input.rest_type === 'stretch' && activeStandardConditions.length > 0 && !input.condition_to_clear) {
      throw new HelperError(
        400,
        'VALIDATION_ERROR',
        'Choose which active standard condition the stretch rest clears.',
        { activeConditions: activeStandardConditions.map((condition) => condition.key) },
      );
    }
    if (input.condition_to_clear
      && !activeStandardConditions.some((condition) => condition.key === input.condition_to_clear)) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'The chosen condition is not active on the solo hero.');
    }

    const healingSkill = input.use_healing ? actorSkill(actor, 'Healing') : null;
    const healingTarget = healingSkill?.target ?? null;
    if (input.use_healing && !healingSkill) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero has no usable Healing skill value.');
    }
    const resolution = resolveSoloRest({
      restType: input.rest_type,
      useHealing: input.use_healing,
      healingTarget,
    });
    const advancementMark = resolution.healingCheck
      ? await markSkillAdvancement(client, loadedActor, healingSkill.name, resolution.healingCheck)
      : { skill: null, eligible: false, added: false, alreadyMarked: false, markedSkills: actor.markedSkills || [] };
    const before = {
      hp: { current: actor.currentHp, max: actor.maxHp },
      wp: { current: actor.currentWp, max: actor.maxWp },
      conditions: actor.conditions.map((condition) => condition.key),
    };
    const nextHp = resolution.fullRecovery
      ? actor.maxHp
      : Math.min(actor.maxHp, actor.currentHp + resolution.hpRecovery);
    const nextWp = resolution.fullRecovery
      ? actor.maxWp
      : Math.min(actor.maxWp, actor.currentWp + resolution.wpRecovery);
    const nextConditions = input.rest_type === 'shift'
      ? actor.conditions.filter((condition) => !STANDARD_CONDITION_KEYS.has(condition.key))
      : input.condition_to_clear
        ? actor.conditions.filter((condition) => condition.key !== input.condition_to_clear)
        : actor.conditions;
    const resultingActor = {
      ...actor,
      currentHp: nextHp,
      currentWp: nextWp,
      hp: { current: nextHp, max: actor.maxHp },
      wp: { current: nextWp, max: actor.maxWp },
      conditions: nextConditions,
      isAlive: nextHp > 0,
      ...(input.rest_type === 'shift' ? {
        isRallied: false,
        deathRolls: { passed: 0, failed: 0 },
      } : {}),
    };
    const durationSeconds = SOLO_REST_SECONDS[input.rest_type];
    const advancedEquipment = advanceEquipmentTime(
      loadedActor.storage.equipmentDocument,
      durationSeconds,
    );
    loadedActor.storage.equipmentDocument = advancedEquipment.document;
    const normalizedEquipment = normalizeCharacterEquipment(
      resultingActor.id,
      advancedEquipment.document,
      {
        definitions: loadedActor.storage.definitions || [],
        itemNotes: loadedActor.storage.row.item_notes || {},
      },
    );
    resultingActor.inventory = normalizedEquipment.inventory;
    await persistActor(client, resultingActor, loadedActor.storage);

    const previousGameTime = access.campaign.game_time && typeof access.campaign.game_time === 'object'
      ? access.campaign.game_time
      : {};
    const oldElapsed = Number(previousGameTime.elapsedSeconds);
    const gameTime = {
      ...previousGameTime,
      elapsedSeconds: (Number.isFinite(oldElapsed) ? oldElapsed : 0) + durationSeconds,
      lastAdvance: {
        kind: 'solo_rest',
        restType: input.rest_type,
        seconds: durationSeconds,
        at: new Date().toISOString(),
      },
    };

    const { rows: restRows } = await client.query(
      `UPDATE solo_rest_states SET
         round_rest_taken = CASE
           WHEN $2 = 'shift' THEN false
           WHEN $2 = 'round' THEN true
           ELSE round_rest_taken
         END,
         stretch_rest_taken = CASE
           WHEN $2 = 'shift' THEN false
           WHEN $2 = 'stretch' THEN true
           ELSE stretch_rest_taken
         END,
         shift_count = shift_count + CASE WHEN $2 = 'shift' THEN 1 ELSE 0 END,
         last_rest_type = $2,
         last_rest_at = now()
       WHERE campaign_id = $1
       RETURNING *`,
      [input.campaign_id, input.rest_type],
    );

    let injuryChanges = [];
    let characterRecoveryState = null;
    if (input.rest_type === 'shift') {
      characterRecoveryState = await advanceCharacterRecoveryShift(
        client,
        input.campaign_id,
        state.player_character_id,
        1,
      );
      injuryChanges = await advanceActiveInjuryRecovery(client, input.campaign_id, state.player_character_id, 1);
    }

    let mission = null;
    let threatResult = null;
    if (input.rest_type !== 'round' && state.current_mission_id) {
      const { rows: threats } = await client.query(
        `SELECT threat.*, mission.id AS active_mission_id
         FROM solo_missions mission
         JOIN solo_threats threat ON threat.id = mission.active_threat_id
         WHERE mission.id = $1 AND mission.campaign_id = $2
           AND mission.status IN ('active', 'returning') AND threat.status = 'active'
         FOR UPDATE OF threat, mission`,
        [state.current_mission_id, input.campaign_id],
      );
      if (threats[0]) {
        mission = { id: threats[0].active_mission_id };
        threatResult = await updateExplorationThreat(client, threats[0], 1);
      }
    }

    const resultingRevision = previousRevision + 1;
    await client.query(
      'UPDATE parties SET helper_revision = $1, game_time = $2::jsonb WHERE id = $3',
      [resultingRevision, JSON.stringify(gameTime), input.campaign_id],
    );
    const hpApplied = nextHp - actor.currentHp;
    const wpApplied = nextWp - actor.currentWp;
    const clearedConditions = before.conditions.filter(
      (condition) => !nextConditions.some((remaining) => remaining.key === condition),
    );
    const preservedEffects = nextConditions
      .filter((condition) => !STANDARD_CONDITION_KEYS.has(condition.key))
      .map((condition) => condition.key);

    const rollRow = resolution.expression ? await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: `${input.rest_type === 'round' ? 'Round' : 'Stretch'} rest recovery`,
      expression: resolution.expression,
      dice: resolution.dice,
      keptIndices: resolution.keptIndices,
      keptValues: resolution.keptValues,
      tableKey: null,
      tableVersion: state.ruleset_version,
      result: {
        action: 'solo_rest',
        restType: input.rest_type,
        healingCheck: resolution.healingCheck,
        advancementMark,
        hpRecoveryRolled: resolution.hpRecovery,
        hpRecoveryApplied: hpApplied,
        wpRecoveryRolled: resolution.wpRecovery,
        wpRecoveryApplied: wpApplied,
        conditionCleared: input.condition_to_clear || null,
        durationSeconds,
        context: input.context || null,
      },
      campaignRevision: resultingRevision,
    }) : null;

    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventIds = [await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.rest_taken',
      actorId: state.player_character_id,
      payload: {
        restType: input.rest_type,
        durationSeconds,
        rollId: rollRow?.id || null,
        healingCheck: resolution.healingCheck,
        advancementMark,
        before,
        after: {
          hp: { current: nextHp, max: actor.maxHp },
          wp: { current: nextWp, max: actor.maxWp },
          conditions: nextConditions.map((condition) => condition.key),
        },
        hpRecoveryRolled: resolution.hpRecovery,
        hpRecoveryApplied: hpApplied,
        wpRecoveryRolled: resolution.wpRecovery,
        wpRecoveryApplied: wpApplied,
        clearedConditions,
        preservedEffects,
        injuryRecovery: injuryChanges.map((change) => ({
          injuryId: change.injuryId,
          name: change.name,
          previousRemainingHealingShifts: change.before.remainingHealingShifts,
          remainingHealingShifts: change.after.remainingHealingShifts,
          healed: change.healed,
        })),
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    })];
    for (const [index, change] of injuryChanges.entries()) {
      eventIds.push(await insertEvent(client, {
        campaign: access.campaign,
        user,
        sequence: sequence + 1 + index,
        type: change.healed ? 'solo.injury_healed' : 'solo.injury_recovery_advanced',
        actorId: state.player_character_id,
        payload: {
          injuryId: change.injuryId,
          name: change.name,
          elapsedShifts: change.elapsedShifts,
          before: change.before,
          after: change.after,
          reason: 'A completed shift rest advances severe-injury recovery by one six-hour shift.',
        },
        visibility: 'players',
        sourceClient,
        idempotencyKey: input.idempotency_key,
        previousRevision,
        resultingRevision,
      }));
    }
    if (threatResult) {
      eventIds.push(await insertEvent(client, {
        campaign: access.campaign,
        user,
        sequence: sequence + 1 + injuryChanges.length,
        type: threatResult.transition.triggered ? 'solo.threat_triggered' : 'solo.threat_advanced',
        actorId: state.player_character_id,
        payload: {
          missionId: mission.id,
          threatId: threatResult.threat.id,
          previousCounter: threatResult.transition.previousCounter,
          resultingCounter: threatResult.transition.counter,
          triggered: threatResult.transition.triggered,
          ...(threatResult.transition.triggered ? { triggerEffect: threatResult.threat.trigger_effect || {} } : {}),
          reason: `A ${input.rest_type} rest during an active solo mission advances the threat.`,
        },
        visibility: 'players',
        sourceClient,
        idempotencyKey: input.idempotency_key,
        previousRevision,
        resultingRevision,
      }));
    }

    const recoverySummary = input.rest_type === 'shift'
      ? 'HP and WP fully restored'
      : `${hpApplied} HP and ${wpApplied} WP restored`;
    const injurySummary = injuryChanges.length > 0
      ? ` ${injuryChanges.filter((change) => change.healed).length > 0
        ? `${injuryChanges.filter((change) => change.healed).map((change) => change.name).join(', ')} healed; `
        : ''}injury recovery advanced by one shift.`
      : '';
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: eventIds,
      summary: `${input.rest_type[0].toUpperCase()}${input.rest_type.slice(1)} rest: ${recoverySummary}${clearedConditions.length ? `; cleared ${clearedConditions.join(', ')}` : ''}.${injurySummary}${threatResult ? ` Threat ${threatResult.transition.previousCounter} → ${threatResult.transition.counter}.` : ''}`,
      state_excerpt: {
        actor: actorForOutput(resultingActor),
        restState: soloRestStateForOutput(restRows[0]),
        gameTime: gameTimeForOutput(gameTime),
        itemDurationChanges: advancedEquipment.changes,
        roll: rollRow ? recordedRollForOutput(rollRow) : null,
        advancementMark,
        injuryRecovery: injuryChanges.map((change) => change.after),
        injuryShiftCount: characterRecoveryState ? Number(characterRecoveryState.shift_count) : null,
        threat: threatResult
          ? soloThreatForOutput(threatResult.threat, { revealTriggerEffect: threatResult.transition.triggered })
          : null,
        preservedEffects,
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

export async function resolveSoloDyingAction(user, input, { sourceClient } = {}) {
  const operation = 'resolve_solo_dying_action';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    const actor = loadedActor.actor;
    if (actor.currentHp !== 0) {
      throw new HelperError(409, 'INVALID_STATE', 'Dying actions are available only while the solo hero is at 0 HP.');
    }
    if (Number(actor.deathRolls?.failed || 0) >= 3) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero has already accumulated three failed death rolls.');
    }
    if (Number(actor.deathRolls?.passed || 0) >= 3 && input.action !== 'recover_stabilized') {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero is stabilized and must resolve recovery.');
    }
    if (input.action === 'self_rally' && actor.isRallied) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero is already rallied.');
    }
    if (input.action === 'recover_stabilized' && Number(actor.deathRolls?.passed || 0) < 3) {
      throw new HelperError(409, 'INVALID_STATE', 'The solo hero has not yet accumulated three successful death rolls.');
    }

    let target = null;
    let skill = null;
    if (input.action === 'death_roll') {
      target = Number(actor.attributes?.CON);
      skill = 'CON';
    } else if (input.action === 'self_rally') {
      const selectedSkill = actorSkill(actor, 'Persuasion');
      target = selectedSkill?.target ?? null;
      skill = selectedSkill?.name || 'Persuasion';
    } else if (input.action === 'life_saving_healing') {
      const selectedSkill = actorSkill(actor, 'Healing');
      target = selectedSkill?.target ?? null;
      skill = selectedSkill?.name || 'Healing';
    }
    if (input.action !== 'recover_stabilized'
      && (!Number.isInteger(target) || target < 1 || target > 20)) {
      throw new HelperError(409, 'INVALID_STATE', `The solo hero has no usable ${skill} value.`);
    }

    const injuryTable = await loadSoloRuleTable(client, 'severe_injury', 'dragonbane-core-existing-v1');
    const resolution = resolveSoloDyingActionRoll({
      action: input.action,
      target,
      passed: Number(actor.deathRolls?.passed || 0),
      failed: Number(actor.deathRolls?.failed || 0),
      injuryEntries: injuryTable.entries,
    });
    const advancementMark = ['self_rally', 'life_saving_healing'].includes(input.action)
      ? await markSkillAdvancement(client, loadedActor, skill, resolution.check)
      : { skill: null, eligible: false, added: false, alreadyMarked: false, markedSkills: actor.markedSkills || [] };
    const recovered = resolution.recoveredHp > 0;
    const nextDeathRolls = recovered
      ? { passed: 0, failed: 0 }
      : resolution.deathRolls;
    const resultingActor = {
      ...actor,
      currentHp: recovered ? Math.min(actor.maxHp, resolution.recoveredHp) : 0,
      hp: { current: recovered ? Math.min(actor.maxHp, resolution.recoveredHp) : 0, max: actor.maxHp },
      deathRolls: nextDeathRolls,
      isRallied: recovered || resolution.dead
        ? false
        : input.action === 'self_rally' ? resolution.rallied : actor.isRallied,
      isAlive: recovered,
      lifeStatus: resolution.dead ? 'dead' : recovered ? 'active' : 'dying',
    };
    await persistActor(client, resultingActor, loadedActor.storage);

    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: input.action === 'death_roll'
        ? 'Solo death roll'
        : input.action === 'self_rally'
          ? 'Solo self-rally'
          : input.action === 'life_saving_healing'
            ? 'Solo life-saving Healing'
            : 'Solo stabilized recovery',
      expression: resolution.expression,
      dice: resolution.dice,
      keptIndices: resolution.keptIndices,
      keptValues: resolution.keptValues,
      tableKey: resolution.injury ? injuryTable.tableKey : null,
      tableVersion: resolution.injury ? injuryTable.version : null,
      result: {
        action: input.action,
        skill,
        check: resolution.check,
        advancementMark,
        deathRollsBefore: actor.deathRolls,
        deathRollsAfter: nextDeathRolls,
        rallied: resultingActor.isRallied,
        dead: resolution.dead,
        recoveredHp: resultingActor.currentHp,
        injury: resolution.injury,
        context: input.context || null,
      },
      campaignRevision: resultingRevision,
    });
    const injuryRow = resolution.injury ? await insertCharacterInjury(client, {
      campaignId: input.campaign_id,
      characterId: state.player_character_id,
      rollId: rollRow.id,
      injury: resolution.injury,
    }) : null;
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: resolution.dead
        ? 'solo.hero_died'
        : recovered
          ? 'solo.hero_recovered'
          : input.action === 'self_rally' ? 'solo.hero_rallied' : 'solo.death_roll_resolved',
      actorId: state.player_character_id,
      payload: {
        action: input.action,
        rollId: rollRow.id,
        skill,
        check: resolution.check,
        advancementMark,
        before: {
          hp: actor.currentHp,
          deathRolls: actor.deathRolls,
          isRallied: actor.isRallied,
        },
        after: {
          hp: resultingActor.currentHp,
          deathRolls: nextDeathRolls,
          isRallied: resultingActor.isRallied,
          dead: resolution.dead,
        },
        injuryId: injuryRow?.id || null,
        injury: resolution.injury,
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });

    let summary;
    if (resolution.dead) {
      summary = `${actor.name} failed the final death roll and died.`;
    } else if (recovered) {
      summary = `${actor.name} recovered ${resultingActor.currentHp} HP and suffered ${resolution.injury.name}${resolution.injury.healingDays ? ` (${resolution.injury.healingDays} days to heal)` : ''}.`;
    } else if (input.action === 'self_rally') {
      summary = resolution.rallied
        ? `${actor.name} rallied successfully and may act at 0 HP.`
        : `${actor.name} failed to rally.`;
    } else if (input.action === 'life_saving_healing') {
      summary = `${actor.name}'s life-saving Healing attempt failed.`;
    } else {
      summary = `${actor.name} recorded a ${resolution.check.outcome} death roll: ${nextDeathRolls.passed} successes, ${nextDeathRolls.failed} failures.`;
    }
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary,
      state_excerpt: {
        actor: actorForOutput(resultingActor),
        roll: recordedRollForOutput(rollRow),
        advancementMark,
        injury: injuryRow ? characterInjuryForOutput(injuryRow) : null,
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

export async function resolveSoloNarrativeDamage(user, input, { sourceClient } = {}) {
  const operation = 'resolve_solo_narrative_damage';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    const { rows: activeCombats } = await client.query(
      `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [input.campaign_id],
    );
    if (activeCombats[0]) {
      throw new HelperError(409, 'INVALID_STATE', 'Use the combat action engine for damage during an active encounter.');
    }
    const loadedActor = await loadActor(client, input.campaign_id, state.player_character_id, { forUpdate: true });
    const actor = loadedActor.actor;
    if (Number(actor.deathRolls?.failed || 0) >= 3) {
      throw new HelperError(409, 'INVALID_STATE', 'Narrative damage cannot be applied to a dead character.');
    }
    const severityTable = await loadSoloRuleTable(client, 'narrative_damage_severity', 'db-solo-v1.2');
    const resolution = resolveNarrativeDamage({ severity: input.severity, entries: severityTable.entries });
    const rawHp = actor.currentHp - resolution.damage;
    const instantDeath = actor.currentHp > 0 && rawHp < -actor.maxHp;
    const damageWhileDying = actor.currentHp === 0;
    const nextFailed = instantDeath
      ? 3
      : damageWhileDying ? Math.min(3, Number(actor.deathRolls?.failed || 0) + 1) : 0;
    const nextHp = Math.max(0, rawHp);
    const dead = instantDeath || nextFailed >= 3;
    const resultingActor = {
      ...actor,
      currentHp: nextHp,
      hp: { current: nextHp, max: actor.maxHp },
      deathRolls: actor.currentHp > 0
        ? { passed: 0, failed: nextFailed }
        : { passed: Number(actor.deathRolls?.passed || 0), failed: nextFailed },
      isRallied: nextHp === 0 ? false : actor.isRallied,
      isAlive: nextHp > 0 && !dead,
      lifeStatus: dead ? 'dead' : nextHp === 0 ? 'dying' : 'active',
    };
    await persistActor(client, resultingActor, loadedActor.storage);
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: state.player_character_id,
      userId: user.id,
      purpose: 'Solo narrative damage',
      expression: resolution.expression,
      dice: resolution.dice,
      keptIndices: resolution.keptIndices,
      keptValues: resolution.keptValues,
      tableKey: severityTable.tableKey,
      tableVersion: severityTable.version,
      result: {
        action: 'narrative_damage',
        severityRoll: resolution.severityRoll,
        severity: resolution.severity,
        damageExpression: resolution.damageExpression,
        damageDice: resolution.damageDice,
        damage: resolution.damage,
        appliedDamage: actor.currentHp - nextHp,
        damageWhileDying,
        instantDeath,
        deathRollsAfter: resultingActor.deathRolls,
        context: input.context || null,
      },
      campaignRevision: resultingRevision,
    });
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: dead ? 'solo.hero_died' : 'solo.narrative_damage',
      actorId: state.player_character_id,
      payload: {
        rollId: rollRow.id,
        severity: resolution.severity,
        damageExpression: resolution.damageExpression,
        damage: resolution.damage,
        appliedDamage: actor.currentHp - nextHp,
        damageWhileDying,
        instantDeath,
        before: { hp: actor.currentHp, deathRolls: actor.deathRolls },
        after: { hp: nextHp, deathRolls: resultingActor.deathRolls, dead },
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const status = dead
      ? ' The hero died.'
      : damageWhileDying ? ` Death failures: ${nextFailed}/3.` : nextHp === 0 ? ' The hero is now dying.' : '';
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: `${resolution.severityLabel} narrative damage: ${resolution.damage} damage (${resolution.damageExpression}).${status}`,
      state_excerpt: {
        actor: actorForOutput(resultingActor),
        roll: recordedRollForOutput(rollRow),
        instantDeath,
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

function assertCharacterInjuryManagementAccess(access, user, loadedActor) {
  if (loadedActor.storage.type !== 'character') {
    throw new HelperError(400, 'VALIDATION_ERROR', 'Severe injuries can only be managed for player characters.');
  }
  if (loadedActor.storage.row.user_id !== user.id && !access.isGm) {
    throw new HelperError(403, 'PERMISSION_DENIED', 'Only the character owner or campaign GM can manage this character’s injuries.');
  }
}

export async function getCharacterInjuries(user, campaignId, characterId) {
  const access = await requireCampaignAccess(pool, user, campaignId);
  const loadedActor = await loadActor(pool, campaignId, characterId);
  const canManage = loadedActor.storage.type === 'character'
    && (loadedActor.storage.row.user_id === user.id || access.isGm);
  const { rows } = await pool.query(
    `SELECT * FROM character_injuries
     WHERE campaign_id = $1 AND character_id = $2
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 100`,
    [campaignId, characterId],
  );
  const recoveryState = await loadCharacterRecoveryState(pool, campaignId, characterId);
  return {
    campaignRevision: Number(access.campaign.helper_revision || 0),
    character: actorForOutput(loadedActor.actor, { includeGm: access.isGm }),
    canManage,
    shiftCount: Number(recoveryState?.shift_count || 0),
    activeInjuries: rows.filter((row) => row.status === 'active').map(characterInjuryForOutput),
    injuryHistory: rows.filter((row) => row.status !== 'active').map(characterInjuryForOutput),
  };
}

export async function rollCharacterSevereInjury(user, input, { sourceClient } = {}) {
  const operation = 'roll_character_severe_injury';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { write: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const loadedActor = await loadActor(client, input.campaign_id, input.character_id, { forUpdate: true });
    assertCharacterInjuryManagementAccess(access, user, loadedActor);
    const injuryTable = await loadSoloRuleTable(client, 'severe_injury', 'dragonbane-core-existing-v1');
    const injury = resolveSevereInjury(injuryTable.entries);
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const rollRow = await insertRecordedRoll(client, {
      campaignId: input.campaign_id,
      sessionId: access.campaign.active_session_id,
      actorId: input.character_id,
      userId: user.id,
      purpose: 'Severe injury',
      expression: `1d20${injury.healingDice.length ? ` + ${injury.healingDice.length}d6` : ''}`,
      dice: injury.dice,
      keptIndices: injury.dice.map((_, index) => index),
      keptValues: [...injury.dice],
      tableKey: injuryTable.tableKey,
      tableVersion: injuryTable.version,
      result: { action: 'severe_injury', injury, context: input.context || null },
      campaignRevision: resultingRevision,
    });
    const injuryRow = await insertCharacterInjury(client, {
      campaignId: input.campaign_id,
      characterId: input.character_id,
      rollId: rollRow.id,
      injury,
    });
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'character.severe_injury_added',
      actorId: input.character_id,
      payload: {
        injuryId: injuryRow.id,
        rollId: rollRow.id,
        injury: characterInjuryForOutput(injuryRow),
        context: input.context || null,
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
      summary: `${loadedActor.actor.name} suffered ${injury.name}${injury.healingDays ? ` (${injury.healingDays} days to heal)` : ' (permanent)'}.`,
      state_excerpt: {
        injury: characterInjuryForOutput(injuryRow),
        roll: recordedRollForOutput(rollRow),
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

export async function advanceCharacterInjuryRecovery(user, input, { sourceClient } = {}) {
  const operation = 'advance_character_injury_recovery';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { write: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const loadedActor = await loadActor(client, input.campaign_id, input.character_id, { forUpdate: true });
    assertCharacterInjuryManagementAccess(access, user, loadedActor);
    const recoveryState = await advanceCharacterRecoveryShift(
      client,
      input.campaign_id,
      input.character_id,
      input.elapsed_shifts,
    );
    const changes = await advanceActiveInjuryRecovery(
      client,
      input.campaign_id,
      input.character_id,
      input.elapsed_shifts,
    );
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'character.injury_recovery_advanced',
      actorId: input.character_id,
      payload: {
        elapsedShifts: input.elapsed_shifts,
        shiftCount: Number(recoveryState.shift_count),
        injuries: changes.map((change) => ({
          injuryId: change.injuryId,
          name: change.name,
          before: change.before,
          after: change.after,
          healed: change.healed,
        })),
        confirmedByUser: input.confirmed_by_user,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const healedNames = changes.filter((change) => change.healed).map((change) => change.name);
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary: changes.length === 0
        ? `${loadedActor.actor.name} completed a shift with no temporary injuries to advance.`
        : `Advanced ${changes.length} ${changes.length === 1 ? 'injury' : 'injuries'} by one shift${healedNames.length ? `; healed ${healedNames.join(', ')}` : ''}.`,
      state_excerpt: {
        shiftCount: Number(recoveryState.shift_count),
        injuryRecovery: changes.map((change) => change.after),
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

async function resolveCharacterInjuryActionInternal(user, input, { sourceClient, soloMode }) {
  const operation = soloMode ? 'resolve_solo_injury_action' : 'resolve_character_injury_action';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(
      client,
      user,
      input.campaign_id,
      soloMode ? { gm: true } : { write: true },
    );
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = soloMode
      ? requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }))
      : null;
    const characterId = soloMode ? state.player_character_id : input.character_id;
    const loadedActor = await loadActor(client, input.campaign_id, characterId, { forUpdate: true });
    if (loadedActor.storage.type !== 'character') {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Severe injuries can only be managed for player characters.');
    }
    if (!soloMode && loadedActor.storage.row.user_id !== user.id && !access.isGm) {
      throw new HelperError(403, 'PERMISSION_DENIED', 'Only the character owner or campaign GM can manage this injury.');
    }
    const { rows: injuryRows } = await client.query(
      `SELECT * FROM character_injuries
       WHERE id = $1 AND campaign_id = $2 AND character_id = $3
       FOR UPDATE`,
      [input.injury_id, input.campaign_id, characterId],
    );
    const injury = injuryRows[0];
    if (!injury) throw new HelperError(404, 'NOT_FOUND', 'Severe injury not found for this character.');
    if (injury.status !== 'active') {
      throw new HelperError(409, 'INVALID_STATE', 'This severe injury has already been resolved.');
    }

    let resolution = null;
    let rollRow = null;
    let updatedInjury;
    let advancementMark = { skill: null, eligible: false, added: false, alreadyMarked: false, markedSkills: loadedActor.actor.markedSkills || [] };
    if (input.action === 'medical_care') {
      if (injury.permanent || injury.remaining_healing_shifts === null) {
        throw new HelperError(409, 'INVALID_STATE', 'Medical care cannot remove a permanent injury.');
      }
      if (injury.medical_care_applied) {
        throw new HelperError(409, 'INVALID_STATE', 'Successful medical care has already reduced this injury’s healing time.');
      }
      const { rows: activeCombats } = await client.query(
        `SELECT id FROM encounters WHERE party_id = $1 AND status = 'active' LIMIT 1`,
        [input.campaign_id],
      );
      if (activeCombats[0]) {
        throw new HelperError(409, 'INVALID_STATE', 'Medical care cannot be attempted during an active combat encounter.');
      }
      const recoveryState = await loadCharacterRecoveryState(
        client,
        input.campaign_id,
        characterId,
        { forUpdate: true },
      );
      const currentShift = Number(recoveryState?.shift_count || 0);
      if (injury.last_treatment_shift !== null && Number(injury.last_treatment_shift) === currentShift) {
        throw new HelperError(409, 'INVALID_STATE', 'Medical care has already been attempted for this injury during the current shift.');
      }
      const healingSkill = actorSkill(loadedActor.actor, 'Healing');
      if (!healingSkill) {
        throw new HelperError(409, 'INVALID_STATE', 'The character has no usable Healing skill value.');
      }
      resolution = resolveSoloInjuryTreatment({
        healingTarget: healingSkill.target,
        remainingHealingShifts: Number(injury.remaining_healing_shifts),
      });
      advancementMark = await markSkillAdvancement(client, loadedActor, healingSkill.name, resolution.check);
      const { rows } = await client.query(
        `UPDATE character_injuries SET
           remaining_healing_shifts = $2,
           recovery_status = CASE WHEN $3 THEN 'recovering' ELSE recovery_status END,
           medical_care_applied = $3,
           treatment_attempts = treatment_attempts + 1,
           last_treatment_shift = $4
         WHERE id = $1
         RETURNING *`,
        [injury.id, resolution.remainingHealingShifts, resolution.succeeded, currentShift],
      );
      updatedInjury = rows[0];
    } else {
      const { rows } = await client.query(
        `UPDATE character_injuries SET
           status = 'healed', recovery_status = 'healed', remaining_healing_shifts = 0,
           healed_at = now(), resolution_reason = $2
         WHERE id = $1
         RETURNING *`,
        [injury.id, input.reason],
      );
      updatedInjury = rows[0];
    }

    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    if (resolution) {
      rollRow = await insertRecordedRoll(client, {
        campaignId: input.campaign_id,
        sessionId: access.campaign.active_session_id,
        actorId: characterId,
        userId: user.id,
        purpose: `Medical care for ${injury.name}`,
        expression: resolution.expression,
        dice: resolution.dice,
        keptIndices: resolution.keptIndices,
        keptValues: resolution.keptValues,
        tableKey: null,
        tableVersion: state?.ruleset_version || 'dragonbane-core-existing-v1',
        result: {
          action: 'medical_care',
          injuryId: injury.id,
          check: resolution.check,
          advancementMark,
          succeeded: resolution.succeeded,
          previousRemainingHealingShifts: resolution.previousRemainingHealingShifts,
          remainingHealingShifts: resolution.remainingHealingShifts,
          shiftsReduced: resolution.shiftsReduced,
          context: input.context || null,
        },
        campaignRevision: resultingRevision,
      });
    }
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: input.action === 'mark_healed'
        ? `${soloMode ? 'solo' : 'character'}.injury_healed`
        : `${soloMode ? 'solo' : 'character'}.injury_medical_care`,
      actorId: characterId,
      payload: {
        action: input.action,
        injuryId: injury.id,
        rollId: rollRow?.id || null,
        check: resolution?.check || null,
        advancementMark,
        succeeded: resolution?.succeeded ?? true,
        before: characterInjuryForOutput(injury),
        after: characterInjuryForOutput(updatedInjury),
        confirmedByUser: input.confirmed_by_user,
        context: input.context || null,
        reason: input.reason,
      },
      visibility: 'players',
      sourceClient,
      idempotencyKey: input.idempotency_key,
      previousRevision,
      resultingRevision,
    });
    const summary = input.action === 'mark_healed'
      ? `${injury.name} was explicitly marked healed.`
      : resolution.succeeded
        ? `Medical care succeeded for ${injury.name}; remaining recovery was reduced from ${resolution.previousRemainingHealingShifts} to ${resolution.remainingHealingShifts} shifts.`
        : `Medical care failed for ${injury.name}; recovery remains at ${resolution.remainingHealingShifts} shifts.`;
    const response = {
      success: true,
      campaign_revision: resultingRevision,
      event_ids: [eventId],
      summary,
      state_excerpt: {
        injury: characterInjuryForOutput(updatedInjury),
        roll: rollRow ? recordedRollForOutput(rollRow) : null,
        advancementMark,
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

export function resolveSoloInjuryAction(user, input, { sourceClient } = {}) {
  return resolveCharacterInjuryActionInternal(user, input, { sourceClient, soloMode: true });
}

export function resolveCharacterInjuryAction(user, input, { sourceClient } = {}) {
  return resolveCharacterInjuryActionInternal(user, input, { sourceClient, soloMode: false });
}

export async function completeSoloMission(user, input, { sourceClient } = {}) {
  const operation = 'complete_solo_mission';
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
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (state.current_mission_id !== input.mission_id) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'The requested mission is not the current solo mission.');
    }
    const { rows: missionRows } = await client.query(
      `SELECT mission.*,
         (SELECT MAX(position) FROM solo_waypoints WHERE mission_id = mission.id) AS final_position,
         (SELECT id FROM solo_waypoints WHERE mission_id = mission.id AND position = mission.current_waypoint_index) AS current_waypoint_id
       FROM solo_missions mission
       WHERE mission.id = $1 AND mission.campaign_id = $2
       FOR UPDATE OF mission`,
      [input.mission_id, input.campaign_id],
    );
    const mission = missionRows[0];
    if (!mission || !['active', 'returning'].includes(mission.status)) {
      throw new HelperError(409, 'INVALID_STATE', 'The requested solo mission cannot be completed.');
    }
    const atObjective = mission.current_waypoint_id === mission.objective_waypoint_id;
    const atReturnEnd = mission.status === 'returning'
      && Number(mission.current_waypoint_index) === Number(mission.final_position);
    if (input.outcome === 'success' && !atObjective && !atReturnEnd) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        'A successful mission may only be completed at its final objective or at the end of its return route.',
      );
    }
    await client.query(
      `UPDATE solo_waypoints
       SET status = CASE WHEN status = 'active' THEN 'resolved' ELSE status END
       WHERE mission_id = $1`,
      [mission.id],
    );
    if (mission.active_threat_id) {
      await client.query(
        `UPDATE solo_threats
         SET status = CASE WHEN $1 = 'success' THEN 'resolved' ELSE 'removed' END
         WHERE id = $2 AND status IN ('active', 'triggered')`,
        [input.outcome, mission.active_threat_id],
      );
    }
    const { rows: completedRows } = await client.query(
      `UPDATE solo_missions
       SET status = $1, completed_at = now()
       WHERE id = $2
       RETURNING *`,
      [input.outcome, mission.id],
    );
    await client.query(
      `UPDATE solo_campaign_states SET current_mission_id = NULL WHERE campaign_id = $1`,
      [input.campaign_id],
    );
    let advancement = null;
    if (input.outcome === 'success') {
      const { rows } = await client.query(
        `INSERT INTO solo_mission_advancements (
           campaign_id, mission_id, character_id, marks_required, status
         ) VALUES ($1, $2, $3, 5, 'selecting_marks')
         ON CONFLICT (mission_id) DO UPDATE SET updated_at = now()
         RETURNING *`,
        [input.campaign_id, mission.id, state.player_character_id],
      );
      advancement = rows[0];
    }
    const resultingRevision = previousRevision + 1;
    await client.query(
      'UPDATE parties SET helper_revision = $1 WHERE id = $2',
      [resultingRevision, input.campaign_id],
    );
    const sequence = await nextEventSequence(client, input.campaign_id);
    const eventId = await insertEvent(client, {
      campaign: access.campaign,
      user,
      sequence,
      type: 'solo.mission_completed',
      actorId: state.player_character_id,
      payload: {
        missionId: mission.id,
        title: mission.title,
        outcome: input.outcome,
        summary: input.summary,
        rewards: input.rewards,
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
      summary: `Solo mission “${mission.title}” ended with ${input.outcome}: ${input.summary}`,
      state_excerpt: {
        mission: soloMissionForOutput(completedRows[0]),
        currentMissionId: null,
        rewards: input.rewards,
        advancement: soloAdvancementForOutput(advancement),
        advancementNotice: input.outcome === 'success'
          ? 'Choose exactly five skills to mark, then resolve advancement before the next mission.'
          : null,
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

async function loadPendingSoloAdvancement(client, campaignId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT * FROM solo_mission_advancements
     WHERE campaign_id = $1 AND status <> 'complete'
     ORDER BY created_at DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [campaignId],
  );
  return rows[0] || null;
}

export async function selectSoloMissionMarks(user, input, { sourceClient } = {}) {
  const operation = 'select_solo_mission_marks';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (new Set(input.skills.map(normalizedSkillName)).size !== 5) {
      throw new HelperError(400, 'VALIDATION_ERROR', 'Choose exactly five different skills.');
    }
    if (state.current_mission_id) throw new HelperError(409, 'INVALID_STATE', 'Mission advancement happens only between missions.');
    const advancement = await loadPendingSoloAdvancement(client, input.campaign_id, { forUpdate: true });
    if (!advancement || advancement.status !== 'selecting_marks') {
      throw new HelperError(409, 'INVALID_STATE', 'There is no successful mission waiting for advancement marks.');
    }
    const { rows: characters } = await client.query(
      `SELECT id, name, skill_levels, marked_skills FROM characters WHERE id = $1 AND party_id = $2 FOR UPDATE`,
      [advancement.character_id, input.campaign_id],
    );
    const character = characters[0];
    if (!character) throw new HelperError(409, 'INVALID_STATE', 'The Solo hero is unavailable.');
    const canonicalSkills = input.skills.map((requested) => {
      const match = Object.keys(character.skill_levels || {}).find(
        (name) => normalizedSkillName(name) === normalizedSkillName(requested),
      );
      if (!match) throw new HelperError(400, 'VALIDATION_ERROR', `${character.name} has no skill named ${requested}.`);
      return match;
    });
    const priorMarks = Array.isArray(character.marked_skills) ? character.marked_skills : [];
    const alreadyMarked = canonicalSkills.find((skill) => priorMarks.some(
      (marked) => normalizedSkillName(marked) === normalizedSkillName(skill),
    ));
    if (alreadyMarked) {
      throw new HelperError(409, 'INVALID_STATE', `${alreadyMarked} is already marked. Choose five other skills so the mission grants five new marks.`);
    }
    const markedSkills = [...priorMarks, ...canonicalSkills];
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query('UPDATE characters SET marked_skills = $1 WHERE id = $2', [markedSkills, character.id]);
    const { rows } = await client.query(
      `UPDATE solo_mission_advancements SET selected_skills = $1, status = 'ready_to_roll' WHERE id = $2 RETURNING *`,
      [canonicalSkills, advancement.id],
    );
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.advancement_marks_selected', actorId: character.id,
      payload: { advancementId: advancement.id, missionId: advancement.mission_id, skills: canonicalSkills, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = { success: true, campaign_revision: resultingRevision, event_ids: [eventId], summary: `Five mission advancement marks selected: ${canonicalSkills.join(', ')}.`, state_excerpt: { advancement: soloAdvancementForOutput(rows[0]), markedSkills } };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function resolveSoloAdvancement(user, input, { sourceClient } = {}) {
  const operation = 'resolve_solo_advancement';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (state.current_mission_id) throw new HelperError(409, 'INVALID_STATE', 'Resolve advancement only between missions.');
    const advancement = await loadPendingSoloAdvancement(client, input.campaign_id, { forUpdate: true });
    if (!advancement || advancement.status !== 'ready_to_roll') {
      throw new HelperError(409, 'INVALID_STATE', 'Select the five mission marks before resolving advancement.');
    }
    const { rows: characters } = await client.query(
      `SELECT id, name, skill_levels, marked_skills FROM characters WHERE id = $1 AND party_id = $2 FOR UPDATE`,
      [advancement.character_id, input.campaign_id],
    );
    const character = characters[0];
    if (!character) throw new HelperError(409, 'INVALID_STATE', 'The Solo hero is unavailable.');
    const markedSkills = Array.isArray(character.marked_skills) ? character.marked_skills : [];
    if (markedSkills.length < 5) throw new HelperError(409, 'INVALID_STATE', 'The Solo hero does not have the required advancement marks.');
    const skills = markedSkills.map((marked) => {
      const name = Object.keys(character.skill_levels || {}).find(
        (candidate) => normalizedSkillName(candidate) === normalizedSkillName(marked),
      );
      if (!name) throw new HelperError(409, 'INVALID_STATE', `Marked skill ${marked} is no longer available.`);
      return { name, level: Number(character.skill_levels[name]) };
    });
    const resolution = resolveSoloAdvancementRoll(skills);
    const skillLevels = { ...(character.skill_levels || {}) };
    for (const result of resolution.results) skillLevels[result.name] = result.resultingLevel;
    const status = resolution.heroicAbilityRewards > 0 ? 'claiming_abilities' : 'complete';
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query(
      `UPDATE characters SET skill_levels = $1::jsonb, marked_skills = '{}'::text[] WHERE id = $2`,
      [JSON.stringify(skillLevels), character.id],
    );
    const { rows } = await client.query(
      `UPDATE solo_mission_advancements SET roll_results = $1::jsonb,
         pending_heroic_abilities = $2, status = $3,
         completed_at = CASE WHEN $3 = 'complete' THEN now() ELSE NULL END
       WHERE id = $4 RETURNING *`,
      [JSON.stringify(resolution.results), resolution.heroicAbilityRewards, status, advancement.id],
    );
    const resultingRevision = previousRevision + 1;
    const roll = await insertRecordedRoll(client, {
      campaignId: input.campaign_id, sessionId: access.campaign.active_session_id,
      actorId: character.id, userId: user.id, purpose: 'Between-mission advancement',
      expression: resolution.expression, dice: resolution.dice,
      keptIndices: resolution.keptIndices, keptValues: resolution.keptValues,
      tableKey: null, tableVersion: state.ruleset_version,
      result: { action: 'solo_advancement', missionId: advancement.mission_id, results: resolution.results, heroicAbilityRewards: resolution.heroicAbilityRewards },
      campaignRevision: resultingRevision,
    });
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.advancement_resolved', actorId: character.id,
      payload: { advancementId: advancement.id, missionId: advancement.mission_id, rollId: roll.id, results: resolution.results, heroicAbilityRewards: resolution.heroicAbilityRewards, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const improved = resolution.results.filter(({ improved }) => improved).map(({ name }) => name);
    const response = { success: true, campaign_revision: resultingRevision, event_ids: [eventId], summary: `Advancement resolved: ${improved.length ? `${improved.join(', ')} improved` : 'no skills improved'}.${resolution.heroicAbilityRewards ? ` Choose ${resolution.heroicAbilityRewards} heroic ability reward${resolution.heroicAbilityRewards === 1 ? '' : 's'}.` : ''}`, state_excerpt: { advancement: soloAdvancementForOutput(rows[0]), roll: recordedRollForOutput(roll), skillLevels } };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
}

export async function claimSoloAdvancementAbility(user, input, { sourceClient } = {}) {
  const operation = 'claim_solo_advancement_ability';
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM parties WHERE id = $1 FOR UPDATE', [input.campaign_id]);
    const access = await requireCampaignAccess(client, user, input.campaign_id, { gm: true });
    const idem = await idempotentResult(client, user, input.campaign_id, input.idempotency_key, operation, input);
    if (idem.response) return idem.response;
    assertCampaignWritable(access.campaign);
    const previousRevision = assertRevision(access.campaign, input.expected_revision);
    const state = requireEnabledSoloState(await loadSoloState(client, input.campaign_id, { forUpdate: true }));
    if (state.current_mission_id) throw new HelperError(409, 'INVALID_STATE', 'Claim advancement rewards only between missions.');
    const advancement = await loadPendingSoloAdvancement(client, input.campaign_id, { forUpdate: true });
    if (!advancement || advancement.status !== 'claiming_abilities' || Number(advancement.pending_heroic_abilities) < 1) {
      throw new HelperError(409, 'INVALID_STATE', 'There is no heroic ability advancement reward to claim.');
    }
    const [{ rows: characters }, { rows: abilities }] = await Promise.all([
      client.query(`SELECT id, name, heroic_ability FROM characters WHERE id = $1 AND party_id = $2 FOR UPDATE`, [advancement.character_id, input.campaign_id]),
      client.query(`SELECT id, name, rule_key FROM heroic_abilities WHERE id = $1`, [input.ability_id]),
    ]);
    const character = characters[0];
    const ability = abilities[0];
    if (!character || !ability) throw new HelperError(404, 'NOT_FOUND', 'The Solo hero or heroic ability was not found.');
    const abilityNames = Array.isArray(character.heroic_ability) ? [...character.heroic_ability] : [];
    if (abilityNames.some((name) => normalizedSkillName(name) === normalizedSkillName(ability.name))) {
      throw new HelperError(409, 'INVALID_STATE', `${character.name} already knows ${ability.name}.`);
    }
    abilityNames.push(ability.name);
    const remaining = Number(advancement.pending_heroic_abilities) - 1;
    const status = remaining === 0 ? 'complete' : 'claiming_abilities';
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    await client.query('UPDATE characters SET heroic_ability = $1 WHERE id = $2', [abilityNames, character.id]);
    const { rows } = await client.query(
      `UPDATE solo_mission_advancements SET pending_heroic_abilities = $1,
         claimed_heroic_ability_ids = array_append(claimed_heroic_ability_ids, $2::uuid),
         status = $3, completed_at = CASE WHEN $3 = 'complete' THEN now() ELSE NULL END
       WHERE id = $4 RETURNING *`,
      [remaining, ability.id, status, advancement.id],
    );
    const resultingRevision = previousRevision + 1;
    await client.query('UPDATE parties SET helper_revision = $1 WHERE id = $2', [resultingRevision, input.campaign_id]);
    const eventId = await insertEvent(client, {
      campaign: access.campaign, user, sequence: await nextEventSequence(client, input.campaign_id),
      type: 'solo.advancement_ability_claimed', actorId: character.id,
      payload: { advancementId: advancement.id, abilityId: ability.id, abilityName: ability.name, remaining, reason: input.reason },
      visibility: 'players', sourceClient, idempotencyKey: input.idempotency_key,
      previousRevision, resultingRevision,
    });
    const response = { success: true, campaign_revision: resultingRevision, event_ids: [eventId], summary: `${character.name} gained ${ability.name} from reaching skill level 18.`, state_excerpt: { advancement: soloAdvancementForOutput(rows[0]), playerCharacter: { id: character.id, name: character.name, heroicAbilities: abilityNames } } };
    await storeIdempotentResult(client, { campaignId: input.campaign_id, userId: user.id, key: input.idempotency_key, operation, hash: idem.hash, response });
    return response;
  });
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

export async function checkpointSession(user, input, { sourceClient } = {}) {
  const operation = 'checkpoint_session';
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
    const { rows: sessions } = await client.query(
      `SELECT * FROM game_sessions
       WHERE id = $1 AND campaign_id = $2
       FOR UPDATE`,
      [input.session_id, input.campaign_id],
    );
    const session = sessions[0];
    if (!session || session.status !== 'active') {
      throw new HelperError(409, 'INACTIVE_SESSION', 'The requested session is not active.');
    }

    const resultingRevision = previousRevision + 1;
    const unresolvedThreads = input.unresolved_threads === undefined
      ? access.campaign.open_threads || []
      : input.unresolved_threads;
    const { rows: checkpoints } = await client.query(
      `INSERT INTO game_session_checkpoints (
         campaign_id, session_id, summary, scene, unresolved_threads,
         campaign_revision, created_by
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
       RETURNING *`,
      [
        input.campaign_id,
        input.session_id,
        input.summary,
        JSON.stringify(input.scene),
        JSON.stringify(unresolvedThreads),
        resultingRevision,
        user.id,
      ],
    );
    await client.query(
      `UPDATE parties
       SET current_scene = $1::jsonb,
         open_threads = $2::jsonb,
         helper_revision = $3
       WHERE id = $4`,
      [
        JSON.stringify(input.scene),
        JSON.stringify(unresolvedThreads),
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
      type: 'session.checkpointed',
      payload: {
        checkpointId: checkpoints[0].id,
        sessionId: input.session_id,
        summary: input.summary,
        scene: sceneForOutput(input.scene),
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
      summary: `Session checkpoint saved at ${input.scene.location || 'the current scene'}.`,
      state_excerpt: {
        checkpoint: checkpointForOutput(checkpoints[0], { includeGm: true }),
        campaign: {
          id: input.campaign_id,
          activeSessionId: input.session_id,
          currentScene: sceneForOutput(input.scene, { includeGm: true }),
          openThreads: unresolvedThreads,
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

function initiativeSlotsFor(row) {
  const stored = Array.isArray(row.initiative_slots)
    ? row.initiative_slots.filter((value) => Number.isInteger(value) && value >= 1 && value <= 10)
    : [];
  if (stored.length > 0) return [...new Set(stored)].sort((left, right) => left - right);
  return [row.initiative_roll ?? null];
}

function completedInitiativeSlotsFor(row) {
  return Array.isArray(row.completed_initiative_slots)
    ? [...new Set(row.completed_initiative_slots)]
    : [];
}

function combatantCanAct(row) {
  return row.current_hp > 0 || (
    row.is_player_character
    && row.current_hp === 0
    && Boolean(row.character_is_rallied)
    && Number(row.character_death_rolls_failed || 0) < 3
  );
}

function pendingInitiativeActions(rows) {
  return rows.flatMap((row) => {
    if (row.has_acted || !combatantCanAct(row)) return [];
    const completed = new Set(completedInitiativeSlotsFor(row));
    return initiativeSlotsFor(row)
      .filter((slot) => slot === null || !completed.has(slot))
      .map((slot) => ({ row, slot }));
  }).sort((left, right) => {
    const leftInitiative = left.slot ?? Number.MAX_SAFE_INTEGER;
    const rightInitiative = right.slot ?? Number.MAX_SAFE_INTEGER;
    if (leftInitiative !== rightInitiative) return leftInitiative - rightInitiative;
    const created = String(left.row.created_at).localeCompare(String(right.row.created_at));
    return created || left.row.id.localeCompare(right.row.id);
  });
}

function currentInitiativeAction(encounter, rows) {
  const active = rows.find((row) => row.id === encounter.active_combatant_id)
    || rows.find((row) => row.is_active_turn);
  if (active) return { row: active, slot: encounter.active_initiative_slot ?? initiativeSlotsFor(active)[0] };
  return pendingInitiativeActions(rows)[0] || null;
}

function completeInitiativeAction(row, slot) {
  if (slot === null || slot === undefined) {
    return { completedSlots: [], hasActed: true };
  }
  const completedSlots = [...new Set([...completedInitiativeSlotsFor(row), slot])];
  return {
    completedSlots,
    hasActed: initiativeSlotsFor(row).every((candidate) => candidate !== null && completedSlots.includes(candidate)),
  };
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

function combatForOutput(access, encounter, rows) {
  return {
    id: encounter.id,
    campaignId: encounter.party_id,
    name: encounter.name,
    status: encounter.status,
    round: encounter.current_round,
    activeActorId: rows.find((row) => row.id === encounter.active_combatant_id)?.character_id
      || encounter.active_combatant_id,
    activeInitiativeSlot: encounter.active_initiative_slot ?? null,
    revision: Number(encounter.helper_revision || 0),
    participants: orderedCombatants(rows).map((row) => ({
      id: row.id,
      actorId: participantActorId(row),
      name: row.display_name,
      type: row.is_player_character ? 'pc' : row.monster_id ? 'monster' : 'npc',
      initiative: row.initiative_roll,
      initiativeSlots: initiativeSlotsFor(row),
      completedInitiativeSlots: completedInitiativeSlotsFor(row),
      hp: { current: row.current_hp, max: row.max_hp },
      wp: { current: row.current_wp ?? 0, max: row.max_wp ?? 0 },
      conditions: access.isGm || row.is_player_character
        ? combineConditions(
          participantActorId(row),
          row.character_conditions,
          row.status_effects,
          row.character_condition_details || {},
        )
        : [],
      hasActed: row.has_acted,
      isActiveTurn: row.is_active_turn || row.id === encounter.active_combatant_id,
      defeated: row.current_hp <= 0,
      rallied: Boolean(row.character_is_rallied),
      canAct: combatantCanAct(row),
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
       c.condition_details AS character_condition_details,
       c.current_hp AS character_current_hp,
       c.max_hp AS character_max_hp,
       c.current_wp AS character_current_wp,
       c.max_wp AS character_max_wp,
       c.heroic_ability AS character_heroic_ability,
       c.is_rallied AS character_is_rallied,
       c.death_rolls_failed AS character_death_rolls_failed
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
    eventRows(pool, access, campaignId, { limit: recentEventLimit }, user.id),
  ]);
  const result = {
    campaign,
    activeSession: sessions[0]
      ? sessionForOutput(sessions[0], { includeGm: access.isGm })
      : null,
    scene: sceneForOutput(access.campaign.current_scene, { includeGm: access.isGm }),
    actors: characters,
    combat,
    recentEvents,
    openThreads: access.isGm ? access.campaign.open_threads || [] : [],
  };
  if (access.isGm) result.gmContext = access.campaign.gm_context || {};
  return result;
}

export async function getResumeState(user, campaignId, { actorId } = {}) {
  return withReadSnapshot(async (client) => {
    const access = await requireCampaignAccess(client, user, campaignId);
    const campaignRevision = Number(access.campaign.helper_revision || 0);

    const { rows: characterRows } = await client.query(
      'SELECT id FROM characters WHERE party_id = $1 ORDER BY name, id',
      [campaignId],
    );
    const characters = [];
    for (const row of characterRows) {
      const { actor } = await loadActor(client, campaignId, row.id);
      characters.push(actorForOutput(actor, { includeGm: access.isGm }));
    }

    const soloState = await loadSoloState(client, campaignId);
    const characterIds = new Set(characters.map((character) => character.id));
    if (actorId && !characterIds.has(actorId)) {
      throw new HelperError(404, 'NOT_FOUND', 'The requested focus character is not in this campaign.');
    }
    const focusCharacterId = actorId
      || (characterIds.has(soloState?.player_character_id) ? soloState.player_character_id : null)
      || (characters.length === 1 ? characters[0].id : null);
    const focusCharacter = focusCharacterId
      ? characters.find((character) => character.id === focusCharacterId) || null
      : null;
    const resumeCharacter = focusCharacter ? {
      ...focusCharacter,
      vitals: { hp: focusCharacter.hp, wp: focusCharacter.wp },
    } : null;

    const { rows: activeSessionRows } = access.campaign.active_session_id
      ? await client.query(
        'SELECT * FROM game_sessions WHERE id = $1 AND campaign_id = $2',
        [access.campaign.active_session_id, campaignId],
      )
      : { rows: [] };
    const { rows: checkpointRows } = await client.query(
      `SELECT * FROM game_session_checkpoints
       WHERE campaign_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [campaignId],
    );

    const combatContext = await loadCombatContext(client, campaignId, null);
    const combat = combatContext
      ? combatForOutput(access, combatContext.encounter, combatContext.rows)
      : null;

    let solo = null;
    if (soloState?.enabled) {
      let activeMission = null;
      let waypoints = [];
      let currentWaypoint = null;
      let activeThreat = null;
      let activeDangers = [];
      if (soloState.current_mission_id) {
        const { rows: missionRows } = await client.query(
          'SELECT * FROM solo_missions WHERE id = $1 AND campaign_id = $2',
          [soloState.current_mission_id, campaignId],
        );
        activeMission = missionRows[0] || null;
        if (activeMission) {
          const { rows: waypointRows } = await client.query(
            `SELECT waypoint.*,
               COALESCE(exploration.search_count, 0) AS search_count,
               COALESCE(exploration.scavenge_count, 0) AS scavenge_count,
               COALESCE(exploration.stretches_spent, 0) AS stretches_spent
             FROM solo_waypoints waypoint
             LEFT JOIN solo_waypoint_exploration exploration ON exploration.waypoint_id = waypoint.id
             WHERE waypoint.mission_id = $1
             ORDER BY waypoint.position`,
            [activeMission.id],
          );
          waypoints = waypointRows.map(soloWaypointForOutput);
          currentWaypoint = waypoints.find(
            (waypoint) => waypoint.position === Number(activeMission.current_waypoint_index),
          ) || waypoints.find((waypoint) => waypoint.status === 'active') || null;
          if (activeMission.active_threat_id) {
            const { rows: threatRows } = await client.query(
              'SELECT * FROM solo_threats WHERE id = $1 AND mission_id = $2',
              [activeMission.active_threat_id, activeMission.id],
            );
            activeThreat = soloThreatForOutput(threatRows[0] || null);
          }
          const { rows: dangerRows } = await client.query(
            `SELECT id, mission_id, waypoint_id, description, status, source_roll_id,
               created_at, updated_at
             FROM solo_dangers
             WHERE campaign_id = $1 AND mission_id = $2 AND status = 'active'
             ORDER BY created_at`,
            [campaignId, activeMission.id],
          );
          activeDangers = dangerRows.map((danger) => ({
            id: danger.id,
            missionId: danger.mission_id,
            waypointId: danger.waypoint_id,
            description: danger.description,
            status: danger.status,
            sourceRollId: danger.source_roll_id,
            createdAt: danger.created_at,
            updatedAt: danger.updated_at,
          }));
        }
      }
      solo = {
        state: soloStateForOutput(soloState),
        activeMission: soloMissionForOutput(activeMission),
        waypoints,
        currentWaypoint,
        activeThreat,
        activeDangers,
      };
    }

    const rollValues = [campaignId];
    const rollVisibility = [];
    if (!access.isGm) {
      rollValues.push(user.id);
      rollVisibility.push(`(
        request.visibility = 'players'
        OR (request.visibility = 'assigned' AND request.assigned_user_id = $${rollValues.length})
      )`);
    }
    rollValues.push(30);
    const { rows: rollRows } = await client.query(
      `SELECT request.*, result.resolution_source,
         result.submitted_by AS result_submitted_by,
         result.created_at AS result_created_at,
         source_result.roll_id AS previous_roll_id,
         CASE WHEN roll.id IS NULL THEN NULL ELSE to_jsonb(roll) END AS resolved_roll
       FROM roll_requests request
       LEFT JOIN roll_request_results result ON result.request_id = request.id
       LEFT JOIN recorded_rolls roll ON roll.id = result.roll_id
       LEFT JOIN roll_request_results source_result
         ON source_result.request_id = request.pushed_from_request_id
       WHERE request.campaign_id = $1
         ${rollVisibility.length ? `AND ${rollVisibility.join(' AND ')}` : ''}
       ORDER BY request.created_at DESC, request.id DESC
       LIMIT $${rollValues.length}`,
      rollValues,
    );
    const recentRolls = rollRows.map(rollRequestForOutput);

    const checkpoint = checkpointForOutput(checkpointRows[0], { includeGm: access.isGm });
    const resumeScene = sceneForOutput(access.campaign.current_scene, { includeGm: access.isGm });
    resumeScene.dangers = resumeScene.dangers.filter((danger) => danger.status !== 'resolved');
    return {
      schemaVersion: 'resume-state-v1',
      campaignRevision,
      campaign: campaignForOutput(access.campaign, access.role),
      characters,
      focusCharacterId,
      character: resumeCharacter,
      focusCharacter: resumeCharacter,
      scene: resumeScene,
      session: {
        activeSession: activeSessionRows[0]
          ? sessionForOutput(activeSessionRows[0], { includeGm: access.isGm })
          : null,
        lastCheckpoint: checkpoint,
        unresolvedThreads: access.isGm
          ? access.campaign.open_threads || checkpoint?.unresolvedThreads || []
          : [],
      },
      combat,
      solo,
      rolls: {
        pending: recentRolls.filter((request) => request.status === 'pending'),
        recent: recentRolls,
      },
      gameTime: gameTimeForOutput(access.campaign.game_time),
      ...(access.isGm ? { gmContext: access.campaign.gm_context || {} } : {}),
    };
  });
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
    const initiatives = new Map(input.initiatives.map((assignment) => {
      const slots = assignment.initiative_slots || [assignment.initiative];
      return [assignment.actor_id, [...slots].sort((left, right) => left - right)];
    }));
    const livingPlayerCharacters = context.rows.filter((row) => row.is_player_character && row.current_hp > 0);
    const soloState = await loadSoloState(client, input.campaign_id);
    const armyOfOneActorId = soloState?.enabled && livingPlayerCharacters.length === 1
      && livingPlayerCharacters[0].character_id === soloState.player_character_id
      && (livingPlayerCharacters[0].character_heroic_ability || []).some(
        (name) => String(name).trim().toLocaleLowerCase() === 'army of one',
      )
      ? participantActorId(livingPlayerCharacters[0])
      : null;
    if (armyOfOneActorId) {
      const armySlots = initiatives.get(armyOfOneActorId)
        || initiativeSlotsFor(livingPlayerCharacters[0]).filter((slot) => slot !== null);
      if (armySlots.length !== 2 || new Set(armySlots).size !== 2) {
        throw new HelperError(
          400,
          'VALIDATION_ERROR',
          'Army of One requires two distinct initiative_slots for the solo character.',
          { actorId: armyOfOneActorId },
        );
      }
      initiatives.set(armyOfOneActorId, armySlots);
    }
    const preparedRows = context.rows.map((row) => ({
      ...row,
      initiative_slots: initiatives.get(participantActorId(row))
        || initiativeSlotsFor(row).filter((slot) => slot !== null),
      initiative_roll: (initiatives.get(participantActorId(row)) || initiativeSlotsFor(row))[0] ?? row.initiative_roll,
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
      completed_initiative_slots: [],
      is_active_turn: false,
    }));
    const firstAction = pendingInitiativeActions(preparedRows)[0];
    if (!firstAction) {
      throw new HelperError(409, 'INVALID_STATE', 'Combat cannot start because every participant is defeated.');
    }
    const first = firstAction.row;

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
    for (const prepared of preparedRows) {
      await client.query(
        `UPDATE encounter_combatants
         SET initiative_roll = $1, initiative_slots = $2,
           completed_initiative_slots = '{}'::integer[]
         WHERE encounter_id = $3 AND id = $4`,
        [prepared.initiative_roll, prepared.initiative_slots, input.combat_id, prepared.id],
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
         active_initiative_slot = $2, helper_revision = $3
       WHERE id = $4`,
      [first.id, firstAction.slot, resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: 'combat_started',
      ts: Date.now(),
      round: 1,
      activeActorId: participantActorId(first),
      initiativeSlot: firstAction.slot,
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
          orderedCombatants(preparedRows).map((row) => [participantActorId(row), initiativeSlotsFor(row)]),
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
    const activeAction = currentInitiativeAction(context.encounter, context.rows);
    const active = activeAction?.row;
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
    const actionValidation = validateActorCanAct(acting.actor);
    const consumesRalliedAction = acting.actor.currentHp === 0 && Boolean(acting.actor.isRallied);
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
    if (consumesRalliedAction) {
      const currentActing = loadedActors.get(input.actor_id);
      const rallyConsumption = consumeRalliedAction(currentActing.actor);
      const existing = [...resolutions].reverse().find((item) => item.actorId === input.actor_id);
      if (existing) {
        existing.resolution.result = rallyConsumption.actor;
        existing.resolution.events.push(rallyConsumption.event);
        existing.resolution.warnings.push(...actionValidation.warnings, ...rallyConsumption.warnings);
        existing.resolution.explanation = `${existing.resolution.explanation} ${rallyConsumption.explanation}`.trim();
        loadedActors.set(input.actor_id, { actor: existing.resolution.result, storage: existing.storage });
      } else {
        resolutions.push({
          actorId: input.actor_id,
          storage: currentActing.storage,
          resolution: {
            valid: true,
            result: rallyConsumption.actor,
            events: [rallyConsumption.event],
            warnings: [...actionValidation.warnings, ...rallyConsumption.warnings],
            explanation: rallyConsumption.explanation,
          },
        });
        loadedActors.set(input.actor_id, { actor: rallyConsumption.actor, storage: currentActing.storage });
      }
    }

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    for (const item of resolutions) {
      await persistActor(client, item.resolution.result, item.storage);
    }
    if (input.consume_turn) {
      const completed = completeInitiativeAction(active, activeAction.slot);
      await client.query(
        `UPDATE encounter_combatants
         SET completed_initiative_slots = $1, has_acted = $2
         WHERE id = $3 AND encounter_id = $4`,
        [completed.completedSlots, completed.hasActed, active.id, input.combat_id],
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
      initiativeSlot: activeAction.slot,
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
        initiativeSlot: activeAction.slot,
        action: input.action,
        outcome: input.outcome,
        consumeTurn: input.consume_turn,
        ralliedActionConsumed: consumesRalliedAction,
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
        ralliedActionConsumed: consumesRalliedAction,
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
    const activeAction = currentInitiativeAction(context.encounter, context.rows);
    const active = activeAction?.row || null;
    const activeCompleted = !active
      || !combatantCanAct(active)
      || active.has_acted
      || (activeAction.slot !== null && activeAction.slot !== undefined
        && completedInitiativeSlotsFor(active).includes(activeAction.slot));
    if (!activeCompleted) {
      throw new HelperError(
        409,
        'INVALID_STATE',
        `${active.display_name} has not resolved or skipped the current turn.`,
        { activeActorId: participantActorId(active) },
      );
    }

    const afterCurrent = context.rows.map((row) => (
      active && row.id === active.id && !combatantCanAct(row)
        ? { ...row, has_acted: true, completed_initiative_slots: initiativeSlotsFor(row).filter((slot) => slot !== null) }
        : row
    ));
    let round = context.encounter.current_round;
    let nextAction = pendingInitiativeActions(afterCurrent)[0];
    let startedNewRound = false;
    if (!nextAction) {
      const living = orderedCombatants(afterCurrent).filter(combatantCanAct);
      if (living.length === 0) {
        throw new HelperError(409, 'INVALID_STATE', 'No living combatant remains. End the combat instead.');
      }
      round += 1;
      startedNewRound = true;
      const resetRows = living.map((row) => ({ ...row, has_acted: false, completed_initiative_slots: [] }));
      nextAction = pendingInitiativeActions(resetRows)[0];
    }
    const next = nextAction.row;

    const resultingRevision = previousRevision + 1;
    const resultingCombatRevision = Number(context.encounter.helper_revision || 0) + 1;
    await client.query(`SELECT set_config('draconi.skip_campaign_revision', 'on', true)`);
    let itemDurationChanges = [];
    let gameTime = gameTimeForOutput(access.campaign.game_time);
    if (startedNewRound) {
      await client.query(
        `UPDATE encounter_combatants
         SET has_acted = false, completed_initiative_slots = '{}'::integer[], is_active_turn = (id = $2)
         WHERE encounter_id = $1`,
        [input.combat_id, next.id],
      );
      itemDurationChanges = await advanceCampaignEquipmentTime(client, input.campaign_id, 10);
      gameTime = advanceGameTime(access.campaign.game_time, 10, {
        kind: 'combat_round',
        combatId: input.combat_id,
        round,
      });
    } else {
      if (active && !combatantCanAct(active) && !active.has_acted) {
        await client.query(
          'UPDATE encounter_combatants SET has_acted = true, completed_initiative_slots = initiative_slots WHERE id = $1',
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
       SET current_round = $1, active_combatant_id = $2, active_initiative_slot = $3,
         helper_revision = $4
       WHERE id = $5`,
      [round, next.id, nextAction.slot, resultingCombatRevision, input.combat_id],
    );
    await appendCombatLog(client, input.combat_id, {
      type: startedNewRound ? 'round_advanced' : 'turn_advanced',
      ts: Date.now(),
      round,
      previousActorId: active ? participantActorId(active) : null,
      activeActorId: participantActorId(next),
      initiativeSlot: nextAction.slot,
      message: input.reason,
    });
    await client.query(
      'UPDATE parties SET helper_revision = $1, game_time = $2::jsonb WHERE id = $3',
      [resultingRevision, JSON.stringify(gameTime), input.campaign_id],
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
        initiativeSlot: nextAction.slot,
        gameTime,
        itemDurationChanges,
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
      state_excerpt: { combat, gameTime, itemDurationChanges },
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
       SET status = 'completed', active_combatant_id = NULL,
         active_initiative_slot = NULL, helper_revision = $1
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
