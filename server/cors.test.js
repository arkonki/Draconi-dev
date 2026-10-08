import { describe, expect, it } from 'vitest';
import { preflightHeaders } from './cors.js';

const env = { PUBLIC_BASE_URL: 'https://draconi.ee', CORS_ALLOWED_ORIGINS: 'http://localhost:5173' };

describe('CORS preflight', () => {
  it('opens third-party client endpoints to any origin', () => {
    expect(preflightHeaders('/mcp', 'https://claude.ai', env)['access-control-allow-origin']).toBe('*');
    expect(preflightHeaders('/oauth/token', 'https://x.test', env)['access-control-allow-origin']).toBe('*');
    expect(preflightHeaders('/api/v1/campaigns', undefined, env)['access-control-allow-origin']).toBe('*');
  });

  it('reflects only configured origins for application endpoints', () => {
    expect(preflightHeaders('/api/data/query', 'https://draconi.ee', env)['access-control-allow-origin']).toBe('https://draconi.ee');
    expect(preflightHeaders('/api/data/query', 'http://localhost:5173', env)['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('denies unknown origins on application endpoints', () => {
    expect(preflightHeaders('/api/auth/sign-in', 'https://evil.test', env)).toBeNull();
    expect(preflightHeaders('/api/auth/sign-in', undefined, env)).toBeNull();
  });
});
