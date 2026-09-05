import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { bootstrapAdmin, currentUser, publicUser, sessionForRequest, signIn, signOut, signUp, updateAuthUser } from './auth.js';
import { executeDataQuery, authorizedChangeEvents } from './data.js';
import { waitForDatabase, pool } from './db.js';
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
import { createMcpHttpHandler } from './mcp/http.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.ELKDATA_APP_IP || process.env.DRACONI_HOST || '0.0.0.0';
const MCP_INTERNAL_API_BASE_URL = process.env.MCP_INTERNAL_API_BASE_URL || `http://${HOST}:${PORT}`;
const handleMcpHttpRequest = createMcpHttpHandler({
  apiBaseUrl: MCP_INTERNAL_API_BASE_URL,
  verifyAccessToken: (token) => authenticateOAuthAccessToken(token, true),
});

function matchPath(pathname, expression) {
  const match = pathname.match(expression);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

const server = http.createServer(async (request, response) => {
  const pathname = routePath(request);
  const suppliedRequestId = String(request.headers['x-request-id'] || '');
  request.requestId = /^[0-9a-f-]{36}$/i.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  response.setHeader('x-request-id', request.requestId);
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
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, x-upsert, if-match, idempotency-key, x-request-id, x-helper-client, mcp-protocol-version, mcp-session-id, last-event-id',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-expose-headers': 'mcp-session-id, www-authenticate',
      });
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

    if (pathname === '/api/admin/housekeeping' && request.method === 'GET') {
      sendJson(response, 200, await housekeepingStatus(await currentUser(request)));
      return;
    }
    if (pathname === '/api/admin/housekeeping/run' && request.method === 'POST') {
      sendJson(response, 200, await runHousekeepingNow(await currentUser(request)));
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
      sendJson(response, 200, await signIn(await readJson(request)));
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
    if (publicObjectMatch && request.method === 'GET') {
      await servePublicObject(response, publicObjectMatch[0], publicObjectMatch[1]);
      return;
    }
    const storageMatch = matchPath(pathname, /^\/api\/storage\/([^/]+)(?:\/(.*))?$/);
    if (storageMatch) {
      await currentUser(request);
      const [bucket, objectPath = ''] = storageMatch;
      if (request.method === 'PUT') {
        sendJson(response, 201, { data: await uploadObject(request, bucket, objectPath) });
        return;
      }
      if (request.method === 'GET') {
        const url = new URL(request.url, 'http://localhost');
        sendJson(response, 200, { data: await listObjects(bucket, objectPath, url.searchParams.get('limit')) });
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

await waitForDatabase();
await runMigrations();
await bootstrapAdmin();
const realtimeServer = await attachRealtimeServer(server);
server.listen(PORT, HOST, () => {
  console.log(`Dragonbane local API listening on ${HOST}:${PORT}`);
});
startHousekeeping();

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
    }), stopHousekeeping(), realtimeServer.close()]);
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
