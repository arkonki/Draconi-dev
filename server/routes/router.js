import { currentUser } from '../auth.js';
import { sendJson } from '../http.js';

/**
 * A route is `[method, path, handler]`. `path` is the exact path, or a regular expression whose groups become
 * `params`. The handler gets `{ request, response, params, query }` and sends the response itself.
 *
 * Routes are tried in the order they are listed and the first one that fits both the method and the path wins, so
 * a narrower pattern must come before a broader one that would also fit.
 */
export function findRoute(routes, method, pathname) {
  for (const [routeMethod, path, handler] of routes) {
    if (routeMethod !== method) continue;
    if (typeof path === 'string') {
      if (path === pathname) return { handler, params: [] };
      continue;
    }
    const match = pathname.match(path);
    // Optional groups that did not take part in the match stay undefined (decodeURIComponent would turn them into "undefined").
    if (match) return { handler, params: match.slice(1).map((part) => (part === undefined ? undefined : decodeURIComponent(part))) };
  }
  return null;
}

export function queryOf(request) {
  return new URL(request.url, 'http://localhost').searchParams;
}

/**
 * For the common case: the person must be signed in, and whatever `work` returns is sent as JSON. The session is
 * checked before `work` runs, so nothing of the request body is read for someone who is not signed in.
 */
export function signedIn(work, status = 200) {
  return async (context) => {
    const user = await currentUser(context.request);
    sendJson(context.response, status, await work(user, context));
  };
}
