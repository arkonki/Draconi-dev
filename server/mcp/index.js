import http from 'node:http';
import { sendJson } from '../http.js';
import { createMcpHttpHandler } from './http.js';

const PORT = Number(process.env.MCP_PORT || 3100);
const HOST = process.env.ELKDATA_APP_IP || process.env.DRACONI_MCP_HOST || '0.0.0.0';
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const handleMcpHttpRequest = createMcpHttpHandler({ apiBaseUrl: API_BASE_URL });

const httpServer = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/health/live' && request.method === 'GET') {
    sendJson(response, 200, { status: 'live', service: 'dragonbane-mcp' });
    return;
  }
  if (!await handleMcpHttpRequest(request, response)) {
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
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
