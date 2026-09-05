// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { oauthConfiguration, validateClientRegistration } from './oauth.js';

const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe('OAuth MCP configuration', () => {
  it('derives canonical discovery and endpoint URLs', () => {
    process.env.PUBLIC_BASE_URL = 'https://draconi.ee';
    expect(oauthConfiguration()).toEqual({
      issuer: 'https://draconi.ee',
      resource: 'https://draconi.ee/mcp',
      authorizationEndpoint: 'https://draconi.ee/oauth/authorize',
      tokenEndpoint: 'https://draconi.ee/oauth/token',
      registrationEndpoint: 'https://draconi.ee/oauth/register',
      protectedResourceMetadata: 'https://draconi.ee/.well-known/oauth-protected-resource',
    });
  });

  it('rejects non-HTTPS public origins in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_BASE_URL = 'http://draconi.ee';
    expect(() => oauthConfiguration()).toThrow(/HTTPS/);
  });

  it('rejects origins with an application path', () => {
    process.env.PUBLIC_BASE_URL = 'https://draconi.ee/helper';
    expect(() => oauthConfiguration()).toThrow(/without a path/);
  });
});

describe('OAuth dynamic client registration', () => {
  it('accepts a public authorization-code client with HTTPS callbacks', () => {
    expect(validateClientRegistration({
      client_name: 'ChatGPT Draconi',
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })).toEqual({
      client_name: 'ChatGPT Draconi',
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  it('rejects insecure remote callbacks and confidential client secrets', () => {
    expect(() => validateClientRegistration({
      redirect_uris: ['http://example.com/callback'],
    })).toThrow(/HTTPS/);
    expect(() => validateClientRegistration({
      redirect_uris: ['https://example.com/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    })).toThrow(/public clients/);
  });
});
