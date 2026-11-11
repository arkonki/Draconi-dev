// @vitest-environment node
import { describe, expect, it } from 'vitest';

// Loading the routes loads the modules they call, and some of those read the database address as they load.
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/unused';
const { apiRoutes, findRoute } = await import('./index.js');

describe('API routes', () => {
  it('finds a route by its exact path and method', () => {
    expect(findRoute(apiRoutes, 'POST', '/api/data/query')).not.toBeNull();
    expect(findRoute(apiRoutes, 'GET', '/api/data/query')).toBeNull();
    expect(findRoute(apiRoutes, 'GET', '/api/nothing-here')).toBeNull();
  });

  it('hands the parts of a pattern to the handler, decoded', () => {
    expect(findRoute(apiRoutes, 'POST', '/api/rpc/create_campaign')?.params).toEqual(['create_campaign']);
    expect(findRoute(apiRoutes, 'GET', '/api/admin/game-data/items/a%20b/usage')?.params).toEqual(['items', 'a b']);
    expect(findRoute(apiRoutes, 'POST', '/api/admin/users/u1/reset-password')?.params).toEqual(['u1']);
    expect(findRoute(apiRoutes, 'POST', '/api/admin/users/u1/unknown')).toBeNull();
  });

  it('serves a public image without a session, before the signed-in storage routes', () => {
    const publicRead = findRoute(apiRoutes, 'GET', '/api/storage/public/images/portraits/a.png');
    const listing = findRoute(apiRoutes, 'GET', '/api/storage/images/portraits');
    expect(publicRead?.params).toEqual(['images', 'portraits/a.png']);
    expect(listing?.params).toEqual(['images', 'portraits']);
    expect(publicRead?.handler).not.toBe(listing?.handler);
    expect(findRoute(apiRoutes, 'GET', '/api/storage/images')?.params).toEqual(['images', undefined]);
  });

  it('lists every exact route once', () => {
    const seen = new Set();
    for (const [method, path] of apiRoutes) {
      if (typeof path !== 'string') continue;
      const key = `${method} ${path}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('only uses handlers that are functions, on known methods', () => {
    for (const [method, , handler] of apiRoutes) {
      expect(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(method);
      expect(typeof handler).toBe('function');
    }
  });
});
