import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadAlertSettings, startAdminAlerts } from './adminAlerts.js';
import { emitAlert } from './alertBus.js';
import { bootstrapAdmin } from './auth.js';
import { loadStoredSmtp, startSmtpRefresh } from './smtpSettings.js';
import { waitForDatabase, pool } from './db.js';
import { assertRegistrationHasEmail, assertSafeConfig } from './configCheck.js';
import { preflightHeaders } from './cors.js';
import { getBearerToken, handleError, HttpError, routePath, sendJson } from './http.js';
import { startHousekeeping, stopHousekeeping } from './housekeeping.js';
import { runMigrations } from './migrations.js';
import { isApiPath, serveFrontend } from './static.js';
import { assertRegionAccess } from './regionGuard.js';
import { beginApplicationRequest, endApplicationRequest, maintenanceStatus } from './recovery.js';
import { attachRealtimeServer } from './realtime.js';
import { handleHelperApiRequest } from './helper/api.js';
import { handleOAuthRequest, authenticateOAuthAccessToken } from './oauth.js';
import { createMcpHttpHandler } from './mcp/http.js';
import { startAutomaticBackups, stopAutomaticBackups } from './automaticBackups.js';
import { stopPerformanceMonitoring, trackHttpRequest } from './performance.js';
import { apiRoutes, findRoute, queryOf } from './routes/index.js';

const PORT = Number(process.env.PORT || 3000);
const host = process.env.ELKDATA_APP_IP?.trim() || process.env.DRACONI_HOST?.trim() || '0.0.0.0';
const MCP_INTERNAL_API_BASE_URL = process.env.MCP_INTERNAL_API_BASE_URL || `http://${host}:${PORT}`;
const handleMcpHttpRequest = createMcpHttpHandler({
  apiBaseUrl: MCP_INTERNAL_API_BASE_URL,
  verifyAccessToken: (token) => authenticateOAuthAccessToken(token, true),
});

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

    // Outside the allowed countries, only people with a session (and signing in itself) reach the API.
    assertRegionAccess(request, pathname, Boolean(getBearerToken(request)));

    if (pathname === '/api/health' && request.method === 'GET') {
      await pool.query('SELECT 1');
      sendJson(response, 200, { status: 'ok', database: 'postgresql' });
      return;
    }

    const route = findRoute(apiRoutes, request.method, pathname);
    if (route) {
      await route.handler({ request, response, params: route.params, query: queryOf(request) });
      return;
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
await loadStoredSmtp();
startSmtpRefresh();
await loadAlertSettings();
startAdminAlerts();
assertRegistrationHasEmail();
const realtimeServer = await attachRealtimeServer(server);
server.listen(PORT, host, () => {
  console.log(`Dragonbane local API listening on ${host}:${PORT}`);
  emitAlert('server_started', { version: process.env.npm_package_version || '' });
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
