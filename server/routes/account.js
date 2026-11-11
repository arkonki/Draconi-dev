import { getAiSettings, removeAiKey, saveAiSettings } from '../aiSettings.js';
import { createPersonalToken, listConnections, revokeApp, revokePersonalToken } from '../connections.js';
import { readJson } from '../http.js';
import { signedIn } from './router.js';

// Which assistants can act as the signed-in person, and their own AI key and model for the built-in AI.
// A web session is required: connection tokens cannot manage connections.
export const accountRoutes = [
  ['GET', '/api/account/connections', signedIn((user) => listConnections(user))],
  ['POST', '/api/account/connections/tokens', signedIn(async (user, { request }) => createPersonalToken(user, await readJson(request)), 201)],
  ['DELETE', /^\/api\/account\/connections\/tokens\/([^/]+)$/, signedIn((user, { params }) => revokePersonalToken(user, params[0]))],
  ['DELETE', /^\/api\/account\/connections\/apps\/([^/]+)$/, signedIn((user, { params }) => revokeApp(user, params[0]))],

  ['GET', '/api/account/ai', signedIn((user) => getAiSettings(user))],
  ['PUT', '/api/account/ai', signedIn(async (user, { request }) => saveAiSettings(user, await readJson(request)))],
  ['DELETE', '/api/account/ai', signedIn((user) => removeAiKey(user))],
];
