import { currentUser } from '../auth.js';
import { authorizedChangeEvents, executeDataQuery } from '../data.js';
import { readJson, sendJson } from '../http.js';
import { projectorFunction } from '../projector.js';
import { assertDataRateAllowed } from '../requestRateLimit.js';
import { executeRpc } from '../rpc.js';
import { listObjects, removeObjects, servePublicObject, uploadObject } from '../storage.js';
import { signedIn } from './router.js';

const publicObject = ({ request, response, params }) => servePublicObject(request, response, params[0], params[1]);
const STORAGE_OBJECT = /^\/api\/storage\/([^/]+)(?:\/(.*))?$/;

export const dataRoutes = [
  ['POST', '/api/data/query', signedIn(async (user, { request }) => {
    assertDataRateAllowed(user);
    return { data: await executeDataQuery(user, await readJson(request)) };
  })],
  ['POST', /^\/api\/rpc\/([^/]+)$/, signedIn(async (user, { request, params }) => {
    assertDataRateAllowed(user);
    return { data: await executeRpc(user, params[0], await readJson(request)) };
  })],
  ['POST', /^\/api\/functions\/([^/]+)$/, async ({ request, response, params }) => {
    // The projector screen has no account: it reads its display with the token in its address.
    const user = await currentUser(request, params[0] !== 'get-player-display-state');
    sendJson(response, 200, await projectorFunction(user, params[0], await readJson(request)));
  }],
  ['POST', '/api/realtime/events', signedIn(async (user, { request }) => {
    const body = await readJson(request);
    return authorizedChangeEvents(user, body.afterId, body.bindings);
  })],

  // Uploaded images are public to read. These come before the signed-in storage routes, which would also fit.
  ['GET', /^\/api\/storage\/public\/([^/]+)\/(.+)$/, publicObject],
  ['HEAD', /^\/api\/storage\/public\/([^/]+)\/(.+)$/, publicObject],
  ['PUT', STORAGE_OBJECT, signedIn(async (user, { request, params }) => ({ data: await uploadObject(request, params[0], params[1] ?? '', user) }), 201)],
  ['GET', STORAGE_OBJECT, signedIn(async (user, { params, query }) => ({ data: await listObjects(params[0], params[1] ?? '', query.get('limit'), query.get('offset')) }))],
  ['DELETE', STORAGE_OBJECT, signedIn(async (user, { request, params }) => ({ data: await removeObjects(params[0], (await readJson(request)).paths, user) }))],
];
