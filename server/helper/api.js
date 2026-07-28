import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { readJson, routePath, sendJson } from '../http.js';
import { authenticateHelperRequest, enforceHelperRateLimit } from './auth.js';
import { asHelperError, HelperError, validationError } from './errors.js';
import { documentationHtml, openApiDocument } from './openapi.js';
import {
  appendCampaignEventBodySchema,
  appendCampaignEventInputSchema,
  applyActorChangesBodySchema,
  applyActorChangesInputSchema,
  campaignIdInputSchema,
  getActorInputSchema,
  getCampaignStateInputSchema,
  getCombatStateInputSchema,
  getRecentEventsInputSchema,
  idempotencyKeySchema,
  listCampaignsInputSchema,
  revisionSchema,
} from './schemas.js';
import {
  appendCampaignEvent,
  applyActorChanges,
  getActor,
  getCampaignState,
  getCombatState,
  getRecentEvents,
  listActors,
  listCampaigns,
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

    const actorsMatch = matchPath(pathname, /^\/api\/v1\/campaigns\/([^/]+)\/actors$/);
    if (actorsMatch && request.method === 'GET') {
      operation = 'list_actors';
      const input = parseSchema(campaignIdInputSchema, { campaign_id: actorsMatch[0] });
      campaignId = input.campaign_id;
      const data = await listActors(user, campaignId);
      sendSuccess(response, requestId, data, data[0]?.revision);
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
