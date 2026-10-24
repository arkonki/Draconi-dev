import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { bootstrapAdmin, currentUser, publicUser, sessionForRequest, signIn, signOut, signUp, updateAuthUser } from './auth.js';
import { executeDataQuery, authorizedChangeEvents } from './data.js';
import { waitForDatabase, pool } from './db.js';
import { assertSafeConfig } from './configCheck.js';
import { preflightHeaders } from './cors.js';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from './loginRateLimit.js';
import { handleError, HttpError, readJson, routePath, sendJson } from './http.js';
import {
  housekeepingStatus,
  runHousekeepingNow,
  startHousekeeping,
  stopHousekeeping,
} from './housekeeping.js';
import { runMigrations } from './migrations.js';
import { projectorFunction } from './projector.js';
import { executeRpc } from './rpc.js';
import { listObjects, removeObjects, servePublicObject, uploadObject } from './storage.js';
import { isApiPath, serveFrontend } from './static.js';
import {
  beginApplicationRequest,
  createAndDownloadBackup,
  downloadStoredBackup,
  endApplicationRequest,
  listBackups,
  maintenanceStatus,
  recoveryDatabaseName,
  restoreStagedBackup,
  stageStoredBackup,
  stageUploadedBackup,
} from './recovery.js';
import { attachRealtimeServer } from './realtime.js';
import { handleHelperApiRequest } from './helper/api.js';
import { handleOAuthRequest, authenticateOAuthAccessToken } from './oauth.js';
import { createPersonalToken, listConnections, revokeApp, revokePersonalToken } from './connections.js';
import { listAllConnections, revokeConnections } from './adminConnections.js';
import { aiUsageOverview } from './adminAiUsage.js';
import { archiveStory, continueFromStory, listStories } from './soloLibrary.js';
import { getAiSettings, removeAiKey, saveAiSettings } from './aiSettings.js';
import { decideToolCall, generateStory, getNarratorConversation, narrateSolo, polishRecap, proposeMission, resetNarrator, resumeSolo, saveNarratorSummary, setNarrationGlossary, setNarrationLanguage, setNarratorMode } from './soloNarrator.js';
import { createMcpHttpHandler } from './mcp/http.js';
import { adminOverview, pruneBackups } from './adminOverview.js';
import {
  automaticBackupStatus,
  runAutomaticBackupNow,
  startAutomaticBackups,
  stopAutomaticBackups,
} from './automaticBackups.js';
import { gameDataUsage } from './gameDataUsage.js';
import {
  deleteUser,
  listAuditLog,
  listUsers,
  resetPassword,
  revokeUserSessions,
  updateUser,
  userImpact,
} from './adminUsers.js';
import {
  performanceStatus,
  resetPerformanceMetrics,
  stopPerformanceMonitoring,
  trackHttpRequest,
} from './performance.js';

const PORT = Number(process.env.PORT || 3000);
const host = process.env.ELKDATA_APP_IP?.trim() || process.env.DRACONI_HOST?.trim() || '0.0.0.0';
const MCP_INTERNAL_API_BASE_URL = process.env.MCP_INTERNAL_API_BASE_URL || `http://${host}:${PORT}`;
const handleMcpHttpRequest = createMcpHttpHandler({
  apiBaseUrl: MCP_INTERNAL_API_BASE_URL,
  verifyAccessToken: (token) => authenticateOAuthAccessToken(token, true),
});

function matchPath(pathname, expression) {
  const match = pathname.match(expression);
  // Optional groups that did not take part in the match stay undefined (decodeURIComponent would turn them into "undefined").
  return match ? match.slice(1).map((part) => (part === undefined ? undefined : decodeURIComponent(part))) : null;
}

const server = http.createServer(async (request, response) => {
  const pathname = routePath(request);
  const suppliedRequestId = String(request.headers['x-request-id'] || '');
  request.requestId = /^[0-9a-f-]{36}$/i.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  response.setHeader('x-request-id', request.requestId);
  trackHttpRequest(request, response, pathname);
  let trackedRequest = false;
  try {
    const maintenance = maintenanceStatus();
    if (maintenance.active) {
      if (pathname === '/health/live' && request.method === 'GET') {
        sendJson(response, 200, { status: 'live' });
        return;
      }
      if (pathname === '/health/ready' && request.method === 'GET') {
        sendJson(response, 503, {
          error: { code: 'NOT_READY', message: 'Application maintenance is active.' },
          meta: { requestId: request.requestId },
        });
        return;
      }
      if (pathname === '/api/health' && request.method === 'GET') {
        sendJson(response, 200, { status: 'maintenance', operation: maintenance.operation, database: 'postgresql' });
        return;
      }
      throw new HttpError(503, `Application is temporarily unavailable during ${maintenance.operation}`, 'MAINTENANCE_MODE');
    }

    if (pathname !== '/api/health' && pathname !== '/health/live' && pathname !== '/health/ready') {
      beginApplicationRequest();
      trackedRequest = true;
    }

    if (request.method === 'OPTIONS') {
      const headers = preflightHeaders(pathname, request.headers.origin);
      response.writeHead(headers ? 204 : 403, headers || {});
      response.end();
      return;
    }

    if (await handleOAuthRequest(request, response)) {
      return;
    }

    if (await handleMcpHttpRequest(request, response)) {
      return;
    }

    if (await handleHelperApiRequest(request, response)) {
      return;
    }

    if (pathname === '/api/health' && request.method === 'GET') {
      await pool.query('SELECT 1');
      sendJson(response, 200, { status: 'ok', database: 'postgresql' });
      return;
    }

    // Which assistants can act as the signed-in user. A web session is required: connection tokens cannot manage connections.
    if (pathname === '/api/account/connections' && request.method === 'GET') {
      sendJson(response, 200, await listConnections(await currentUser(request)));
      return;
    }
    if (pathname === '/api/account/connections/tokens' && request.method === 'POST') {
      sendJson(response, 201, await createPersonalToken(await currentUser(request), await readJson(request)));
      return;
    }
    const connectionTokenMatch = matchPath(pathname, /^\/api\/account\/connections\/tokens\/([^/]+)$/);
    if (connectionTokenMatch && request.method === 'DELETE') {
      sendJson(response, 200, await revokePersonalToken(await currentUser(request), connectionTokenMatch[0]));
      return;
    }
    const connectionAppMatch = matchPath(pathname, /^\/api\/account\/connections\/apps\/([^/]+)$/);
    if (connectionAppMatch && request.method === 'DELETE') {
      sendJson(response, 200, await revokeApp(await currentUser(request), connectionAppMatch[0]));
      return;
    }

    // The person's own AI key and model for the built-in AI. A web session is required.
    if (pathname === '/api/account/ai') {
      const actor = await currentUser(request);
      if (request.method === 'GET') { sendJson(response, 200, await getAiSettings(actor)); return; }
      if (request.method === 'PUT') { sendJson(response, 200, await saveAiSettings(actor, await readJson(request))); return; }
      if (request.method === 'DELETE') { sendJson(response, 200, await removeAiKey(actor)); return; }
    }
    if (pathname === '/api/ai/story' && request.method === 'POST') {
      sendJson(response, 200, await generateStory(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-mission' && request.method === 'POST') {
      sendJson(response, 200, await proposeMission(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-stories') {
      const actor = await currentUser(request);
      if (request.method === 'GET') { sendJson(response, 200, await listStories(actor, new URL(request.url, 'http://localhost').searchParams.get('partyId'))); return; }
      if (request.method === 'POST') { sendJson(response, 200, await archiveStory(actor, await readJson(request))); return; }
    }
    if (pathname === '/api/ai/solo-stories/continue' && request.method === 'POST') {
      sendJson(response, 200, await continueFromStory(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/recap' && request.method === 'POST') {
      sendJson(response, 200, await polishRecap(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-narrator/glossary' && request.method === 'PUT') {
      sendJson(response, 200, await setNarrationGlossary(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-narrator/mode' && request.method === 'PUT') {
      sendJson(response, 200, await setNarratorMode(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-narrator/decide' && request.method === 'POST') {
      sendJson(response, 200, await decideToolCall(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-narrator/language' && request.method === 'PUT') {
      sendJson(response, 200, await setNarrationLanguage(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/ai/solo-narrator') {
      const actor = await currentUser(request);
      const partyId = new URL(request.url, 'http://localhost').searchParams.get('partyId');
      if (request.method === 'GET') { sendJson(response, 200, await getNarratorConversation(actor, partyId)); return; }
      if (request.method === 'DELETE') { sendJson(response, 200, await resetNarrator(actor, partyId)); return; }
      if (request.method === 'PUT') { sendJson(response, 200, await saveNarratorSummary(actor, await readJson(request))); return; }
      if (request.method === 'POST') { sendJson(response, 200, await narrateSolo(actor, await readJson(request))); return; }
    }
    // The same turn, with the answer sent as it is written (server-sent events): 'delta' for text, 'tool' each time a
    // tool call changes status, and a final 'done'. Problems found before the first word is written come back as an
    // ordinary error response. 'resume' carries on a reply once the player has decided what it was waiting for.
    const narratorStream = pathname === '/api/ai/solo-narrator/stream' ? narrateSolo : pathname === '/api/ai/solo-narrator/resume' ? resumeSolo : null;
    if (narratorStream && request.method === 'POST') {
      const actor = await currentUser(request);
      const body = await readJson(request);
      const controller = new AbortController();
      response.on('close', () => controller.abort());
      let started = false;
      const begin = () => {
        if (started) return;
        started = true;
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
      };
      const emit = (event, data) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        const result = await narratorStream(actor, body, {
          signal: controller.signal,
          onDelta: (text) => { begin(); emit('delta', { text }); },
          onTool: (call) => { begin(); emit('tool', { id: call.id, name: call.name, label: call.label, status: call.status, summary: call.summary ?? null, error: call.error ?? null }); },
        });
        begin();
        emit('done', result);
        response.end();
      } catch (error) {
        if (!started) throw error;
        emit('error', { message: error instanceof Error ? error.message : 'The narrator stopped.', code: error?.code });
        response.end();
      }
      return;
    }

    if (pathname === '/api/admin/users' && request.method === 'GET') {
      sendJson(response, 200, await listUsers(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/ai-usage' && request.method === 'GET') {
      sendJson(response, 200, await aiUsageOverview(await currentUser(request), { month: new URL(request.url, 'http://localhost').searchParams.get('month') || undefined }));
      return;
    }
    if (pathname === '/api/admin/connections' && request.method === 'GET') {
      sendJson(response, 200, await listAllConnections(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/connections/revoke' && request.method === 'POST') {
      sendJson(response, 200, await revokeConnections(await currentUser(request), await readJson(request)));
      return;
    }
    if (pathname === '/api/admin/audit' && request.method === 'GET') {
      const params = new URL(request.url, 'http://localhost').searchParams;
      sendJson(response, 200, await listAuditLog(await currentUser(request), {
        limit: params.get('limit'),
        userId: params.get('user'),
      }));
      return;
    }
    if (pathname === '/api/admin/overview' && request.method === 'GET') {
      sendJson(response, 200, await adminOverview(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/backups/automatic' && request.method === 'GET') {
      sendJson(response, 200, await automaticBackupStatus(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/backups/automatic/run' && request.method === 'POST') {
      sendJson(response, 200, await runAutomaticBackupNow(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/backups/prune' && request.method === 'POST') {
      const body = await readJson(request);
      sendJson(response, 200, await pruneBackups(await currentUser(request), { dryRun: body?.dryRun !== false }));
      return;
    }
    const gameDataUsageMatch = matchPath(pathname, /^\/api\/admin\/game-data\/([^/]+)\/([^/]+)\/usage$/);
    if (gameDataUsageMatch && request.method === 'GET') {
      const [category, id] = gameDataUsageMatch;
      sendJson(response, 200, await gameDataUsage(await currentUser(request), { category, id }));
      return;
    }
    const adminUserMatch = matchPath(pathname, /^\/api\/admin\/users\/([^/]+)(?:\/(impact|reset-password|revoke-sessions))?$/);
    if (adminUserMatch) {
      const [userId, action] = adminUserMatch;
      const actor = await currentUser(request);
      if (!action && request.method === 'PATCH') {
        sendJson(response, 200, await updateUser(actor, userId, await readJson(request)));
        return;
      }
      if (!action && request.method === 'DELETE') {
        sendJson(response, 200, await deleteUser(actor, userId, await readJson(request)));
        return;
      }
      if (action === 'impact' && request.method === 'GET') {
        sendJson(response, 200, await userImpact(actor, userId));
        return;
      }
      if (action === 'reset-password' && request.method === 'POST') {
        sendJson(response, 200, await resetPassword(actor, userId, await readJson(request)));
        return;
      }
      if (action === 'revoke-sessions' && request.method === 'POST') {
        sendJson(response, 200, await revokeUserSessions(actor, userId));
        return;
      }
    }

    if (pathname === '/api/admin/housekeeping' && request.method === 'GET') {
      sendJson(response, 200, await housekeepingStatus(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/housekeeping/run' && request.method === 'POST') {
      sendJson(response, 200, await runHousekeepingNow(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/performance' && request.method === 'GET') {
      sendJson(response, 200, await performanceStatus(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/performance/reset' && request.method === 'POST') {
      sendJson(response, 200, resetPerformanceMetrics(await currentUser(request)));
      return;
    }

    if (pathname === '/api/admin/recovery/backup' && request.method === 'POST') {
      await createAndDownloadBackup(response, await currentUser(request));
      return;
    }
    if (pathname === '/api/admin/recovery/backups' && request.method === 'GET') {
      sendJson(response, 200, {
        data: await listBackups(await currentUser(request)),
        databaseName: recoveryDatabaseName(),
      });
      return;
    }
    const storedBackupMatch = matchPath(pathname, /^\/api\/admin\/recovery\/backups\/([^/]+)$/);
    if (storedBackupMatch && request.method === 'GET') {
      await downloadStoredBackup(response, await currentUser(request), storedBackupMatch[0]);
      return;
    }
    if (pathname === '/api/admin/recovery/stage-upload' && request.method === 'POST') {
      sendJson(response, 200, await stageUploadedBackup(request, await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/recovery/stage-server' && request.method === 'POST') {
      const user = await currentUser(request);
      const body = await readJson(request, 50_000);
      sendJson(response, 200, await stageStoredBackup(user, body.filename));
      return;
    }
    if (pathname === '/api/admin/recovery/restore' && request.method === 'POST') {
      const user = await currentUser(request);
      sendJson(response, 200, await restoreStagedBackup(user, await readJson(request, 50_000)));
      return;
    }

    if (pathname === '/api/auth/session' && request.method === 'GET') {
      sendJson(response, 200, { session: await sessionForRequest(request) });
      return;
    }
    if (pathname === '/api/auth/sign-in' && request.method === 'POST') {
      const credentials = await readJson(request);
      assertLoginAllowed(request, credentials.email);
      try {
        sendJson(response, 200, await signIn(credentials));
        clearLoginFailures(request, credentials.email);
      } catch (error) {
        if (error?.code === 'INVALID_CREDENTIALS') recordLoginFailure(request, credentials.email);
        throw error;
      }
      return;
    }
    if (pathname === '/api/auth/sign-up' && request.method === 'POST') {
      const actor = await currentUser(request, false);
      sendJson(response, 201, await signUp(actor, await readJson(request)));
      return;
    }
    if (pathname === '/api/auth/sign-out' && request.method === 'POST') {
      await signOut(request);
      sendJson(response, 200, {});
      return;
    }
    if (pathname === '/api/auth/user' && request.method === 'GET') {
      sendJson(response, 200, { user: publicUser(await currentUser(request)) });
      return;
    }
    if (pathname === '/api/auth/user' && request.method === 'PUT') {
      const body = await readJson(request);
      sendJson(response, 200, { user: await updateAuthUser(request, body) });
      return;
    }

    if (pathname === '/api/data/query' && request.method === 'POST') {
      const user = await currentUser(request);
      sendJson(response, 200, { data: await executeDataQuery(user, await readJson(request)) });
      return;
    }

    const rpcMatch = matchPath(pathname, /^\/api\/rpc\/([^/]+)$/);
    if (rpcMatch && request.method === 'POST') {
      const user = await currentUser(request);
      sendJson(response, 200, { data: await executeRpc(user, rpcMatch[0], await readJson(request)) });
      return;
    }

    const functionMatch = matchPath(pathname, /^\/api\/functions\/([^/]+)$/);
    if (functionMatch && request.method === 'POST') {
      const user = await currentUser(request, functionMatch[0] !== 'get-player-display-state');
      sendJson(response, 200, await projectorFunction(user, functionMatch[0], await readJson(request)));
      return;
    }

    if (pathname === '/api/realtime/events' && request.method === 'POST') {
      const user = await currentUser(request);
      const body = await readJson(request);
      sendJson(response, 200, await authorizedChangeEvents(user, body.afterId, body.bindings));
      return;
    }

    const publicObjectMatch = matchPath(pathname, /^\/api\/storage\/public\/([^/]+)\/(.+)$/);
    if (publicObjectMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      await servePublicObject(request, response, publicObjectMatch[0], publicObjectMatch[1]);
      return;
    }
    const storageMatch = matchPath(pathname, /^\/api\/storage\/([^/]+)(?:\/(.*))?$/);
    if (storageMatch) {
      const user = await currentUser(request);
      const [bucket, objectPath = ''] = storageMatch;
      if (request.method === 'PUT') {
        sendJson(response, 201, { data: await uploadObject(request, bucket, objectPath, user) });
        return;
      }
      if (request.method === 'GET') {
        const url = new URL(request.url, 'http://localhost');
        sendJson(response, 200, { data: await listObjects(bucket, objectPath, url.searchParams.get('limit'), url.searchParams.get('offset')) });
        return;
      }
      if (request.method === 'DELETE') {
        sendJson(response, 200, { data: await removeObjects(bucket, (await readJson(request)).paths) });
        return;
      }
    }

    if (!isApiPath(pathname) && await serveFrontend(request, response)) {
      return;
    }

    throw new HttpError(404, 'Endpoint not found');
  } catch (error) {
    if (response.headersSent) {
      console.error(error);
      response.destroy();
    } else {
      handleError(response, error);
    }
  } finally {
    if (trackedRequest) endApplicationRequest();
  }
});

assertSafeConfig();
await waitForDatabase();
await runMigrations();
await bootstrapAdmin();
const realtimeServer = await attachRealtimeServer(server);
server.listen(PORT, host, () => {
  console.log(`Dragonbane local API listening on ${host}:${PORT}`);
});
startHousekeeping();
await startAutomaticBackups();

let shutdownStarted = false;

async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; waiting for active requests to finish...`);

  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 8_000);
  forceExit.unref();

  try {
    await Promise.all([new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    }), stopHousekeeping(), stopAutomaticBackups(), realtimeServer.close()]);
    stopPerformanceMonitoring();
    await pool.end();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error('Graceful shutdown failed:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
