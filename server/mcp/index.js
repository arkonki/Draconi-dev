import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getBearerToken, sendJson } from '../http.js';
import { HelperApiClient } from './client.js';
import { createDragonbaneMcpServer } from './server.js';

const PORT = Number(process.env.MCP_PORT || 3100);
const HOST = process.env.ELKDATA_APP_IP || process.env.DRACONI_MCP_HOST || '0.0.0.0';
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

const httpServer = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-expose-headers': 'mcp-session-id',
    });
    response.end();
    return;
  }
  if (pathname === '/health/live' && request.method === 'GET') {
    sendJson(response, 200, { status: 'live', service: 'dragonbane-mcp' });
    return;
  }
  if (pathname !== '/mcp') {
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
    return;
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    sendJson(
      response,
      401,
      { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Bearer authentication is required.' } },
    );
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const mcpServer = createDragonbaneMcpServer(new HelperApiClient({
    baseUrl: API_BASE_URL,
    accessToken,
  }));
  response.on('close', () => {
    void transport.close();
    void mcpServer.close();
  });
  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'dragonbane-mcp',
      message: error.message,
    }));
    if (!response.headersSent) {
      sendJson(response, 500, {
        error: { code: 'MCP_INTERNAL_ERROR', message: 'MCP request failed.' },
      });
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Dragonbane MCP server listening on ${HOST}:${PORT}/mcp`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing Dragonbane MCP server...`);
  await new Promise((resolve, reject) => {
    httpServer.close((error) => error ? reject(error) : resolve());
    httpServer.closeIdleConnections?.();
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

