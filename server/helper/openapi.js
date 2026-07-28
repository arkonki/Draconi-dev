import { z } from 'zod';
import {
  appendCampaignEventBodySchema,
  applyActorChangesBodySchema,
} from './schemas.js';

const errorResponse = {
  description: 'Structured API error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['error', 'meta'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
          },
          meta: {
            type: 'object',
            required: ['requestId'],
            properties: { requestId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      examples: {
        revisionConflict: {
          value: {
            error: {
              code: 'REVISION_CONFLICT',
              message: 'Campaign revision is 43, not 42.',
              details: { expectedRevision: 42, currentRevision: 43 },
            },
            meta: { requestId: '2c19ca48-d7bd-4244-876b-ce653e78efc5' },
          },
        },
      },
    },
  },
};

const successEnvelope = (dataSchema = {}) => ({
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: dataSchema,
    meta: {
      type: 'object',
      required: ['requestId'],
      properties: {
        requestId: { type: 'string', format: 'uuid' },
        campaignRevision: { type: 'integer', minimum: 0 },
      },
    },
  },
});

const campaignParameter = {
  name: 'campaignId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const revisionHeader = {
  name: 'If-Match',
  in: 'header',
  required: true,
  description: 'Latest campaign revision, for example `"42"`.',
  schema: { type: 'string', pattern: '^W/|"?[0-9]+"?$' },
};

const idempotencyHeader = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'Unique key of 8–200 characters. Reusing it with the same request returns the original result.',
  schema: { type: 'string', minLength: 8, maxLength: 200 },
};

export const openApiDocument = {
  openapi: '3.1.0',
  'x-error-codes': [
    'AUTHENTICATION_REQUIRED',
    'PERMISSION_DENIED',
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'INACTIVE_CAMPAIGN',
    'INACTIVE_SESSION',
    'INACTIVE_COMBAT',
    'ACTOR_DEFEATED',
    'INSUFFICIENT_HP',
    'INSUFFICIENT_WP',
    'REVISION_REQUIRED',
    'REVISION_CONFLICT',
    'IDEMPOTENCY_CONFLICT',
    'INVALID_STATE',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
  info: {
    title: 'Dragonbane Helper API',
    version: '1.0.0-mvp',
    description: [
      'Versioned API for reading and safely updating Dragonbane campaign state.',
      'PostgreSQL is authoritative. Every write requires If-Match and Idempotency-Key,',
      'increments the campaign revision, and appends one or more immutable events.',
      'Development mode accepts a bearer token from DEVELOPMENT_TOKEN.',
    ].join(' '),
  },
  servers: [{ url: '/', description: 'Current Dragonbane installation' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Health' },
    { name: 'Campaigns' },
    { name: 'Actors' },
    { name: 'Combat' },
    { name: 'Events' },
  ],
  paths: {
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Process liveness',
        security: [],
        responses: { 200: { description: 'Process is live' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Database readiness',
        security: [],
        responses: { 200: { description: 'API and database are ready' }, 503: errorResponse },
      },
    },
    '/api/v1/campaigns': {
      get: {
        tags: ['Campaigns'],
        summary: 'List campaigns visible to the authenticated user',
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { enum: ['active', 'paused', 'completed', 'archived'] },
          },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Campaign page', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          429: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/state': {
      get: {
        tags: ['Campaigns'],
        summary: 'Get a compact continuation snapshot',
        description: 'Returns current scene, actors, active combat, recent events, and GM context only when the token has GM access.',
        parameters: [
          campaignParameter,
          { name: 'recentEventLimit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: { description: 'Campaign snapshot', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/actors': {
      get: {
        tags: ['Actors'],
        summary: 'List campaign actors and active encounter creatures',
        parameters: [campaignParameter],
        responses: {
          200: { description: 'Visible actors', content: { 'application/json': { schema: successEnvelope({ type: 'array' }) } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/actors/{actorId}': {
      get: {
        tags: ['Actors'],
        summary: 'Get exact current actor state',
        parameters: [
          campaignParameter,
          { name: 'actorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Actor', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/actors/{actorId}/changes': {
      post: {
        tags: ['Actors'],
        summary: 'Apply validated actor state changes atomically',
        description: 'Supports damage, healing, WP changes, conditions, and existing inventory quantity adjustments.',
        parameters: [
          campaignParameter,
          { name: 'actorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(applyActorChangesBodySchema),
              example: {
                reason: 'Goblin longsword hit',
                changes: [{ type: 'damage', amount: 6, damage_type: 'slashing' }],
              },
            },
          },
        },
        responses: {
          200: { description: 'Applied or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
          428: errorResponse,
          429: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/combat': {
      get: {
        tags: ['Combat'],
        summary: 'Get active or selected combat state',
        parameters: [
          campaignParameter,
          { name: 'combatId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Combat or null', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/events': {
      get: {
        tags: ['Events'],
        summary: 'Read the immutable campaign event log',
        parameters: [
          campaignParameter,
          { name: 'afterSequence', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'beforeSequence', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'type', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'actorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sessionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: { description: 'Newest-first event page', content: { 'application/json': { schema: successEnvelope({ type: 'array' }) } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      post: {
        tags: ['Events'],
        summary: 'Append an important narrative or GM event',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(appendCampaignEventBodySchema),
              example: {
                type: 'campaign.clue_discovered',
                visibility: 'gm',
                payload: { clue: 'The ring bears the duke’s seal.' },
                reason: 'The party searched the abandoned desk.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Recorded or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
          428: errorResponse,
          429: errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'development token or application session',
      },
    },
  },
};

export const documentationHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dragonbane Helper API</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #11100e; color: #eee8dc; }
    main { max-width: 1080px; margin: auto; padding: 2.5rem 1.25rem 5rem; }
    h1 { color: #e5b95c; } h2 { margin-top: 2rem; }
    .note, .route { background: #1e1b17; border: 1px solid #3b342a; border-radius: 10px; padding: 1rem; margin: .75rem 0; }
    .method { display: inline-block; min-width: 3.5rem; color: #8ed4a4; font-weight: 700; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { overflow: auto; padding: 1rem; background: #090806; border-radius: 8px; }
    a { color: #e5b95c; }
  </style>
</head>
<body><main>
  <h1>Dragonbane Helper API</h1>
  <p class="note">PostgreSQL is authoritative. Writes require <code>If-Match</code> and <code>Idempotency-Key</code>. See the complete machine-readable contract at <a href="/openapi.json">/openapi.json</a>.</p>
  <div id="paths">Loading API contract…</div>
  <h2>Complete OpenAPI JSON</h2>
  <pre id="spec"></pre>
  <script>
    fetch('/openapi.json').then(r => r.json()).then(spec => {
      document.getElementById('paths').innerHTML = Object.entries(spec.paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(([method, operation]) =>
          '<div class="route"><span class="method">' + method.toUpperCase() + '</span><code>' +
          path + '</code><div>' + (operation.summary || '') + '</div></div>'
        )).join('');
      document.getElementById('spec').textContent = JSON.stringify(spec, null, 2);
    });
  </script>
</main></body></html>`;
