import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { readJson, routePath, sendJson } from '../http.js';
import { authenticateHelperRequest, enforceHelperRateLimit, requireHelperScope } from './auth.js';
import { asHelperError, HelperError, validationError } from './errors.js';
import { documentationHtml, openApiDocument } from './openapi.js';
import {
  addEncounterParticipantsBodySchema,
  addEncounterParticipantsInputSchema,
  advanceCombatTurnBodySchema,
  advanceCombatTurnInputSchema,
  appendCampaignEventBodySchema,
  appendCampaignEventInputSchema,
  applyActorChangesBodySchema,
  applyActorChangesInputSchema,
  campaignIdInputSchema,
  completeSessionBodySchema,
  completeSessionInputSchema,
  createEncounterBodySchema,
  createEncounterInputSchema,
  endCombatBodySchema,
  endCombatInputSchema,
  getActorInputSchema,
  getCampaignStateInputSchema,
  getCombatStateInputSchema,
  getEncounterSetupOptionsInputSchema,
  getRecentEventsInputSchema,
  getSessionHistoryInputSchema,
  idempotencyKeySchema,
  listCampaignsInputSchema,
  resolveGameActionBodySchema,
  resolveGameActionInputSchema,
  removeEncounterParticipantBodySchema,
  removeEncounterParticipantInputSchema,
  revisionSchema,
  startCombatBodySchema,
  startCombatInputSchema,
  startSessionBodySchema,
  startSessionInputSchema,
} from './schemas.js';
import {
  addEncounterParticipants,
  advanceCombatTurn,
  appendCampaignEvent,
  applyActorChanges,
  completeSession,
  createEncounter,
  endCombat,
  getActor,
  getCampaignState,
  getCombatState,
  getEncounterSetupOptions,
  getRecentEvents,
  getSessionHistory,
  listActors,
  listCampaigns,
  resolveGameAction,
  removeEncounterParticipant,
  startCombat,
  startSession,
} from './service.js';

function matchPath(pathname, expression) {
  const match = pathname.match(expression);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

function requestIdFor(request) {
  if (request.requestId) return request.requestId;
  const supplied = String(request.headers['x-request-id'] || '');
  return /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
}

function parseRevision(request) {
  const value = request.headers['if-match'];
  if (value === undefined) {
    throw new HelperError(428, 'REVISION_REQUIRED', 'If-Match is required for modifying requests.');
  }
  const normalized = String(value).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  try {
    return revisionSchema.parse(normalized);
  } catch (error) {
    throw validationError(error);
  }
}

function parseIdempotencyKey(request) {
  try {
    return idempotencyKeySchema.parse(request.headers['idempotency-key']);
  } catch (error) {
    throw validationError(error);
  }
}

function parseSchema(schema, value) {
  try {
    return schema.parse(value);
  } catch (error) {
    throw validationError(error);
  }
}

function sendSuccess(response, requestId, data, campaignRevision) {
  const meta = { requestId };
  if (campaignRevision !== undefined && campaignRevision !== null) {
    meta.campaignRevision = Number(campaignRevision);
  }
  sendJson(
    response,
    200,
    { data, meta },
    campaignRevision === undefined || campaignRevision === null
      ? {}
      : { etag: `"${Number(campaignRevision)}"` },
  );
}

function sendApiError(response, requestId, error) {
  const helperError = asHelperError(error);
  sendJson(response, helperError.status, {
    error: {
      code: helperError.code,
      message: helperError.message,
      ...(helperError.details === undefined ? {} : { details: helperError.details }),
    },
    meta: { requestId },
  });
  return helperError;
}

function sourceClient(request) {
  const value = String(request.headers['x-helper-client'] || '').trim().slice(0, 100);
  return value || 'dragonbane-rest';
}

export async function handleHelperApiRequest(request, response) {
  const pathname = routePath(request);
  const isHelperPath = pathname === '/openapi.json'
    || pathname === '/docs'
    || pathname === '/health/live'
    || pathname === '/health/ready'
    || pathname.startsWith('/api/v1/');
  if (!isHelperPath) return false;

  const requestId = requestIdFor(request);
  response.setHeader('x-request-id', requestId);

  if (pathname === '/openapi.json' && request.method === 'GET') {
    sendJson(response, 200, openApiDocument);
    return true;
  }
  if (pathname === '/docs' && request.method === 'GET') {
    const body = Buffer.from(documentationHtml);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    response.end(body);
    return true;
  }
  if (pathname === '/health/live' && request.method === 'GET') {
    sendJson(response, 200, { status: 'live' });
    return true;
  }
  if (pathname === '/health/ready' && request.method === 'GET') {
    try {
      await pool.query('SELECT 1');
      sendJson(response, 200, { status: 'ready', database: 'postgresql' });
    } catch {
      sendJson(response, 503, {
        error: { code: 'NOT_READY', message: 'Database is not ready.' },
        meta: { requestId },
      });
    }
    return true;
  }

  const startedAt = Date.now();
  let user;
  let campaignId;
  let idempotencyKey;
  let operation = `${request.method} ${pathname}`;
  let previousRevision;
  let resultingRevision;
  try {
    user = await authenticateHelperRequest(request);
    requireHelperScope(user, request.method);
    enforceHelperRateLimit(request, user);
    const url = new URL(request.url, 'http://localhost');

    if (pathname === '/api/v1/campaigns' && request.method === 'GET') {
      operation = 'list_campaigns';
      const input = parseSchema(listCampaignsInputSchema, {
        status: url.searchParams.get('status') || undefined,
        limit: url.searchParams.get('limit') || undefined,
        cursor: url.searchParams.get('cursor') || undefined,
      });
      sendSuccess(response, requestId, await listCampaigns(user, input));
      return true;
    }

    const stateMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/state$/);
    if (stateMatch && request.method === 'GET') {
      operation = 'get_campaign_state';
      const input = parseSchema(getCampaignStateInputSchema, {
        campaign_id: stateMatch[0],
        recent_event_limit: url.searchParams.get('recentEventLimit') || undefined,
      });
      campaignId = input.campaign_id;
      const data = await getCampaignState(user, campaignId, {
        recentEventLimit: input.recent_event_limit,
      });
      resultingRevision = data.campaign.revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const sessionsMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/sessions$/);
    if (sessionsMatch && request.method === 'GET') {
      operation = 'get_session_history';
      const input = parseSchema(getSessionHistoryInputSchema, {
        campaign_id: sessionsMatch[0],
        limit: url.searchParams.get('limit') || undefined,
      });
      campaignId = input.campaign_id;
      const data = await getSessionHistory(user, campaignId, { limit: input.limit });
      resultingRevision = data.campaignRevision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const sessionStartMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/sessions\/start$/,
    );
    if (sessionStartMatch && request.method === 'POST') {
      operation = 'start_session';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(startSessionBodySchema, await readJson(request, 150_000));
      const input = parseSchema(startSessionInputSchema, {
        campaign_id: sessionStartMatch[0],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await startSession(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const sessionCompleteMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/sessions\/([^/]+)\/complete$/,
    );
    if (sessionCompleteMatch && request.method === 'POST') {
      operation = 'complete_session';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(completeSessionBodySchema, await readJson(request, 300_000));
      const input = parseSchema(completeSessionInputSchema, {
        campaign_id: sessionCompleteMatch[0],
        session_id: sessionCompleteMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await completeSession(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const actorsMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/actors$/);
    if (actorsMatch && request.method === 'GET') {
      operation = 'list_actors';
      const input = parseSchema(campaignIdInputSchema, { campaign_id: actorsMatch[0] });
      campaignId = input.campaign_id;
      const data = await listActors(user, campaignId);
      sendSuccess(response, requestId, data, data[0]?.revision);
      return true;
    }

    const encounterOptionsMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/encounter-options$/,
    );
    if (encounterOptionsMatch && request.method === 'GET') {
      operation = 'get_encounter_setup_options';
      const input = parseSchema(getEncounterSetupOptionsInputSchema, {
        campaign_id: encounterOptionsMatch[0],
        monster_search: url.searchParams.get('monsterSearch') || undefined,
        monster_limit: url.searchParams.get('monsterLimit') || undefined,
      });
      campaignId = input.campaign_id;
      const data = await getEncounterSetupOptions(user, campaignId, {
        monsterSearch: input.monster_search,
        monsterLimit: input.monster_limit,
      });
      resultingRevision = data.campaignRevision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const encountersMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/encounters$/);
    if (encountersMatch && request.method === 'POST') {
      operation = 'create_encounter';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(createEncounterBodySchema, await readJson(request, 100_000));
      const input = parseSchema(createEncounterInputSchema, {
        campaign_id: encountersMatch[0],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await createEncounter(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const encounterParticipantsMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/combat\/([^/]+)\/participants$/,
    );
    if (encounterParticipantsMatch && request.method === 'POST') {
      operation = 'add_encounter_participants';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(addEncounterParticipantsBodySchema, await readJson(request, 150_000));
      const input = parseSchema(addEncounterParticipantsInputSchema, {
        campaign_id: encounterParticipantsMatch[0],
        combat_id: encounterParticipantsMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await addEncounterParticipants(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const encounterParticipantMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/combat\/([^/]+)\/participants\/([^/]+)$/,
    );
    if (encounterParticipantMatch && request.method === 'DELETE') {
      operation = 'remove_encounter_participant';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(removeEncounterParticipantBodySchema, await readJson(request, 100_000));
      const input = parseSchema(removeEncounterParticipantInputSchema, {
        campaign_id: encounterParticipantMatch[0],
        combat_id: encounterParticipantMatch[1],
        actor_id: encounterParticipantMatch[2],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await removeEncounterParticipant(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const actorChangesMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/actors\/([^/]+)\/changes$/,
    );
    if (actorChangesMatch && request.method === 'POST') {
      operation = 'apply_actor_changes';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(applyActorChangesBodySchema, await readJson(request, 100_000));
      const input = parseSchema(applyActorChangesInputSchema, {
        campaign_id: actorChangesMatch[0],
        actor_id: actorChangesMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await applyActorChanges(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const actorMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/actors\/([^/]+)$/);
    if (actorMatch && request.method === 'GET') {
      operation = 'get_actor';
      const input = parseSchema(getActorInputSchema, {
        campaign_id: actorMatch[0],
        actor_id: actorMatch[1],
      });
      campaignId = input.campaign_id;
      const data = await getActor(user, campaignId, input.actor_id);
      resultingRevision = data.revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const combatMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/combat$/);
    if (combatMatch && request.method === 'GET') {
      operation = 'get_combat_state';
      const input = parseSchema(getCombatStateInputSchema, {
        campaign_id: combatMatch[0],
        combat_id: url.searchParams.get('combatId') || undefined,
      });
      campaignId = input.campaign_id;
      const data = await getCombatState(user, campaignId, input.combat_id);
      sendSuccess(response, requestId, data);
      return true;
    }

    const combatStartMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/combat\/([^/]+)\/start$/,
    );
    if (combatStartMatch && request.method === 'POST') {
      operation = 'start_combat';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(startCombatBodySchema, await readJson(request, 150_000));
      const input = parseSchema(startCombatInputSchema, {
        campaign_id: combatStartMatch[0],
        combat_id: combatStartMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await startCombat(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const combatActionMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/combat\/([^/]+)\/actions$/,
    );
    if (combatActionMatch && request.method === 'POST') {
      operation = 'resolve_game_action';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(resolveGameActionBodySchema, await readJson(request, 250_000));
      const input = parseSchema(resolveGameActionInputSchema, {
        campaign_id: combatActionMatch[0],
        combat_id: combatActionMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await resolveGameAction(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const combatAdvanceMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/combat\/([^/]+)\/turns\/advance$/,
    );
    if (combatAdvanceMatch && request.method === 'POST') {
      operation = 'advance_combat_turn';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(advanceCombatTurnBodySchema, await readJson(request, 100_000));
      const input = parseSchema(advanceCombatTurnInputSchema, {
        campaign_id: combatAdvanceMatch[0],
        combat_id: combatAdvanceMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await advanceCombatTurn(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const combatEndMatch = matchPath(
      pathname,
      /^\/api\/v1\/campaigns\/([^/]+)\/combat\/([^/]+)\/end$/,
    );
    if (combatEndMatch && request.method === 'POST') {
      operation = 'end_combat';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(endCombatBodySchema, await readJson(request, 100_000));
      const input = parseSchema(endCombatInputSchema, {
        campaign_id: combatEndMatch[0],
        combat_id: combatEndMatch[1],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await endCombat(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    const eventsMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/events$/);
    if (eventsMatch && request.method === 'GET') {
      operation = 'get_recent_events';
      const input = parseSchema(getRecentEventsInputSchema, {
        campaign_id: eventsMatch[0],
        after_sequence: url.searchParams.get('afterSequence') || undefined,
        before_sequence: url.searchParams.get('beforeSequence') || undefined,
        type: url.searchParams.get('type') || undefined,
        actor_id: url.searchParams.get('actorId') || undefined,
        session_id: url.searchParams.get('sessionId') || undefined,
        limit: url.searchParams.get('limit') || undefined,
      });
      campaignId = input.campaign_id;
      const data = await getRecentEvents(user, campaignId, {
        afterSequence: input.after_sequence,
        beforeSequence: input.before_sequence,
        type: input.type,
        actorId: input.actor_id,
        sessionId: input.session_id,
        limit: input.limit,
      });
      sendSuccess(response, requestId, data);
      return true;
    }
    if (eventsMatch && request.method === 'POST') {
      operation = 'append_campaign_event';
      previousRevision = parseRevision(request);
      idempotencyKey = parseIdempotencyKey(request);
      const body = parseSchema(appendCampaignEventBodySchema, await readJson(request, 250_000));
      const input = parseSchema(appendCampaignEventInputSchema, {
        campaign_id: eventsMatch[0],
        expected_revision: previousRevision,
        idempotency_key: idempotencyKey,
        ...body,
      });
      campaignId = input.campaign_id;
      const data = await appendCampaignEvent(user, input, { sourceClient: sourceClient(request) });
      resultingRevision = data.campaign_revision;
      sendSuccess(response, requestId, data, resultingRevision);
      return true;
    }

    throw new HelperError(404, 'NOT_FOUND', 'Endpoint not found.');
  } catch (error) {
    const helperError = sendApiError(response, requestId, error);
    if (helperError.code === 'INTERNAL_ERROR') console.error(error);
    return true;
  } finally {
    console.log(JSON.stringify({
      level: 'info',
      requestId,
      userId: user?.id || null,
      campaignId: campaignId || null,
      operation,
      idempotencyKey: idempotencyKey || null,
      previousRevision: previousRevision ?? null,
      resultingRevision: resultingRevision ?? null,
      durationMs: Date.now() - startedAt,
      success: response.statusCode < 400,
    }));
  }
}
