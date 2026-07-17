import http from 'node:http';
import { bootstrapAdmin, currentUser, publicUser, sessionForRequest, signIn, signOut, signUp, updateAuthUser } from './auth.js';
import { executeDataQuery, authorizedChangeEvents } from './data.js';
import { waitForDatabase, pool } from './db.js';
import { handleError, HttpError, readJson, routePath, sendJson } from './http.js';
import { projectorFunction } from './projector.js';
import { executeRpc } from './rpc.js';
import { listObjects, removeObjects, servePublicObject, uploadObject } from './storage.js';

const PORT = Number(process.env.PORT || 3000);

function matchPath(pathname, expression) {
  const match = pathname.match(expression);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

const server = http.createServer(async (request, response) => {
  const pathname = routePath(request);
  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, x-upsert',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      });
      response.end();
      return;
    }

    if (pathname === '/api/health' && request.method === 'GET') {
      await pool.query('SELECT 1');
      sendJson(response, 200, { status: 'ok', database: 'postgresql' });
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

    throw new HttpError(404, 'Endpoint not found');
  } catch (error) {
    handleError(response, error);
  }
});

await waitForDatabase();
await bootstrapAdmin();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dragonbane local API listening on port ${PORT}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
