import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getBearerToken, sendJson } from '../http.js';
import { oauthBearerChallenge } from '../oauth.js';
import { HelperApiClient } from './client.js';
import { createDragonbaneMcpServer } from './server.js';

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-expose-headers': 'mcp-session-id, www-authenticate',
  };
}

function authenticationRequired(response, message = 'OAuth bearer authentication is required.') {
  sendJson(
    response,
    401,
    { error: { code: 'AUTHENTICATION_REQUIRED', message } },
    { ...corsHeaders(), 'www-authenticate': oauthBearerChallenge() },
  );
}

export function createMcpHttpHandler({ apiBaseUrl, verifyAccessToken } = {}) {
  if (!apiBaseUrl) throw new Error('apiBaseUrl is required for the MCP HTTP handler');

  return async function handleMcpHttpRequest(request, response) {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname !== '/mcp') return false;

    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders());
      response.end();
      return true;
    }

    const accessToken = getBearerToken(request);
    if (!accessToken) {
      authenticationRequired(response);
      return true;
    }
    if (verifyAccessToken) {
      try {
        await verifyAccessToken(accessToken);
      } catch (error) {
        authenticationRequired(response, error?.message || 'OAuth access token is invalid or expired.');
        return true;
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const mcpServer = createDragonbaneMcpServer(new HelperApiClient({
      baseUrl: apiBaseUrl,
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
        }, corsHeaders());
      }
    }
    return true;
  };
}
