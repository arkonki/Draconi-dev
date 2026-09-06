import { z } from 'zod';
import {
  addEncounterParticipantsBodySchema,
  advanceCombatTurnBodySchema,
  advanceThreatBodySchema,
  askFortuneBodySchema,
  appendCampaignEventBodySchema,
  applyActorChangesBodySchema,
  completeSoloMissionBodySchema,
  completeSessionBodySchema,
  createEncounterBodySchema,
  drawInspirationBodySchema,
  disableSoloModeBodySchema,
  enableSoloModeBodySchema,
  selectSoloHeroicAbilityBodySchema,
  endCombatBodySchema,
  resolveGameActionBodySchema,
  resolveSoloDyingActionBodySchema,
  resolveSoloNarrativeDamageBodySchema,
  removeEncounterParticipantBodySchema,
  revealWaypointBodySchema,
  scavengeWaypointBodySchema,
  searchWaypointBodySchema,
  startSessionBodySchema,
  startCombatBodySchema,
  startSoloMissionBodySchema,
  takeSoloRestBodySchema,
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

const combatParameter = {
  name: 'combatId',
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
    'NOT_ACTORS_TURN',
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
    version: '1.10.0',
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
    { name: 'Solo' },
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
    '/api/v1/campaigns/{campaignId}/solo/options': {
      get: {
        tags: ['Solo'],
        summary: 'Get solo-mode setup options and prerequisites',
        parameters: [campaignParameter],
        responses: {
          200: { description: 'Solo setup options', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo': {
      get: {
        tags: ['Solo'],
        summary: 'Get authoritative solo continuation state',
        parameters: [campaignParameter],
        responses: {
          200: { description: 'Solo state', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      post: {
        tags: ['Solo'],
        summary: 'Enable custom solo mode for one campaign character',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(enableSoloModeBodySchema) } },
        },
        responses: {
          200: { description: 'Solo mode enabled', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
      delete: {
        tags: ['Solo'],
        summary: 'Disable solo mode for a campaign',
        description: 'GM-only. Active solo missions and combat must be completed first. Removes only a solo ability that Draconi originally granted.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(disableSoloModeBodySchema) } },
        },
        responses: {
          200: { description: 'Solo mode disabled', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/heroic-ability': {
      post: {
        tags: ['Solo'],
        summary: 'Select the solo character additional heroic ability',
        description: 'GM-only. Applies a user-confirmed heroic ability choice to the configured solo character and records the change as a campaign event.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(selectSoloHeroicAbilityBodySchema),
              example: {
                ability_id: '30000000-0000-4000-8000-000000000102',
                reason: 'The user selected Sole Survivor for the solo hero.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Ability selected or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/solo/fortune': {
      post: {
        tags: ['Solo'],
        summary: 'Ask the Fortune oracle with a recorded server roll',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(askFortuneBodySchema) } },
        },
        responses: {
          200: { description: 'Recorded Fortune result', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/inspiration': {
      post: {
        tags: ['Solo'],
        summary: 'Draw one or more recorded Inspiration columns',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(drawInspirationBodySchema) } },
        },
        responses: {
          200: { description: 'Recorded Inspiration result', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/missions': {
      post: {
        tags: ['Solo'],
        summary: 'Start a persisted custom solo mission',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(startSoloMissionBodySchema) } },
        },
        responses: {
          200: { description: 'Solo mission started', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/rest': {
      post: {
        tags: ['Solo'],
        summary: 'Resolve rest and recovery for the solo hero',
        description: 'Round and stretch rests are limited to once per shift. Stretch rests can clear one explicitly chosen standard condition, shift rests require a confirmed safe location, and stretch-or-longer rests advance an active mission threat. Poison, fear, and custom effects are preserved.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(takeSoloRestBodySchema) } },
        },
        responses: {
          200: { description: 'Solo rest resolved and recorded', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/dying/actions': {
      post: {
        tags: ['Solo'],
        summary: 'Resolve an authoritative action while the solo hero is dying',
        description: 'Resolve a CON death roll, unbaned Persuasion self-rally, life-saving Healing attempt, or legacy stabilized recovery. Three successes recover D6 HP; three failures mean death. Recovery also creates a persisted severe injury.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(resolveSoloDyingActionBodySchema) } },
        },
        responses: {
          200: { description: 'Dying action resolved and recorded', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/damage': {
      post: {
        tags: ['Solo'],
        summary: 'Resolve narrative damage outside combat',
        description: 'Use a chosen slight, moderate, or severe rating, or roll an unknown severity. The server rolls and applies damage atomically. Damage at 0 HP adds a failed death roll; combat damage must use the combat action engine.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(resolveSoloNarrativeDamageBodySchema) } },
        },
        responses: {
          200: { description: 'Narrative damage resolved and recorded', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/waypoints/{waypointId}/reveal': {
      post: {
        tags: ['Solo'],
        summary: 'Reveal and activate the next sequential waypoint',
        parameters: [
          campaignParameter,
          { name: 'waypointId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(revealWaypointBodySchema) } },
        },
        responses: {
          200: { description: 'Waypoint revealed', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/waypoints/{waypointId}/search': {
      post: {
        tags: ['Solo'],
        summary: 'Search the active waypoint with a recorded Spot Hidden check',
        description: 'A thorough Search consumes one stretch and advances the active threat by 1. Findings use the explicitly non-official Draconi generic exploration table.',
        parameters: [
          campaignParameter,
          { name: 'waypointId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(searchWaypointBodySchema) } },
        },
        responses: {
          200: { description: 'Search resolved and recorded', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/waypoints/{waypointId}/scavenge': {
      post: {
        tags: ['Solo'],
        summary: 'Scavenge the active waypoint with a recorded exploration roll',
        description: 'The first quick pass is free. Repeat attempts, or an explicitly thorough pass, consume one stretch and advance the active threat by 1. Findings use the explicitly non-official Draconi generic exploration table.',
        parameters: [
          campaignParameter,
          { name: 'waypointId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(scavengeWaypointBodySchema) } },
        },
        responses: {
          200: { description: 'Scavenge resolved and recorded', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/missions/{missionId}/complete': {
      post: {
        tags: ['Solo'],
        summary: 'Complete the current solo mission',
        parameters: [
          campaignParameter,
          { name: 'missionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(completeSoloMissionBodySchema) } },
        },
        responses: {
          200: { description: 'Mission completed', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/solo/threats/{threatId}/advance': {
      post: {
        tags: ['Solo'],
        summary: 'Advance and possibly trigger the active solo threat',
        parameters: [
          campaignParameter,
          { name: 'threatId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(advanceThreatBodySchema) } },
        },
        responses: {
          200: { description: 'Threat transition recorded', content: { 'application/json': { schema: successEnvelope() } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
          428: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/sessions': {
      get: {
        tags: ['Campaigns'],
        summary: 'List recent game sessions',
        description: 'Returns durable session summaries. Private GM notes are included only for GM access.',
        parameters: [
          campaignParameter,
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: { description: 'Game session history', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          429: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/sessions/start': {
      post: {
        tags: ['Campaigns'],
        summary: 'Start a game session',
        description: 'GM-only. Starts the campaign session and binds subsequent campaign events to it.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(startSessionBodySchema),
              example: {
                title: 'Night of the Manticore',
                gm_notes: 'The beast was sent by the masked rider.',
                opening_scene: { location: 'Old bridge', situation: 'A roar in the fog' },
                reason: 'The GM begins play.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Session started or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/sessions/{sessionId}/complete': {
      post: {
        tags: ['Campaigns'],
        summary: 'Complete the active game session',
        description: 'GM-only. Saves a durable summary, ending scene, and unresolved threads, then clears the active session.',
        parameters: [
          campaignParameter,
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(completeSessionBodySchema),
              example: {
                summary: 'The heroes drove the manticore from the old bridge.',
                unresolved_threads: ['Who sent the beast?'],
                ending_scene: { location: 'Old bridge', situation: 'The fog clears' },
                reason: 'The GM ends play.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Session completed or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/encounter-options': {
      get: {
        tags: ['Combat'],
        summary: 'List encounter setup options',
        description: 'GM-only. Returns party characters, searchable local monsters with resolved ferocity, and planned encounters.',
        parameters: [
          campaignParameter,
          { name: 'monsterSearch', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'monsterLimit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          200: { description: 'Encounter setup options', content: { 'application/json': { schema: successEnvelope() } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          429: errorResponse,
        },
      },
    },
    '/api/v1/campaigns/{campaignId}/encounters': {
      post: {
        tags: ['Combat'],
        summary: 'Create a planned encounter',
        description: 'GM-only. Creates an empty planned encounter that can be populated before combat starts.',
        parameters: [campaignParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(createEncounterBodySchema),
              example: {
                name: 'Roadside ambush',
                description: 'Two goblins block the old bridge.',
                reason: 'The GM requested a new encounter.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Encounter created or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/combat/{combatId}/participants': {
      post: {
        tags: ['Combat'],
        summary: 'Add participants to a planned encounter',
        description: 'GM-only. Adds party characters and catalog monsters. Monster count and ferocity expand into initiative actions.',
        parameters: [campaignParameter, combatParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(addEncounterParticipantsBodySchema),
              example: {
                character_ids: ['9e031ae2-f333-4546-8475-530962888e5f'],
                monsters: [{
                  monster_id: '2c85d47c-f6ce-4c3a-af53-43a0c81b77e0',
                  count: 2,
                  use_ferocity: true,
                }],
                reason: 'The heroes are confronted at the bridge.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Participants added or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/combat/{combatId}/participants/{actorId}': {
      delete: {
        tags: ['Combat'],
        summary: 'Remove a participant from a planned encounter',
        description: 'GM-only. Removes the participant identified by its actor ID.',
        parameters: [
          campaignParameter,
          combatParameter,
          { name: 'actorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          revisionHeader,
          idempotencyHeader,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(removeEncounterParticipantBodySchema),
              example: { reason: 'The GM changed the planned opposition.' },
            },
          },
        },
        responses: {
          200: { description: 'Participant removed or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/combat/{combatId}/start': {
      post: {
        tags: ['Combat'],
        summary: 'Start an existing planned combat encounter',
        description: 'GM-only. Synchronizes player-character vitals, applies optional initiative assignments, resets acted flags, and selects the first living actor. A lone Army of One hero must receive two distinct initiative_slots.',
        parameters: [campaignParameter, combatParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(startCombatBodySchema),
              example: {
                initiatives: [
                  { actor_id: '9e031ae2-f333-4546-8475-530962888e5f', initiative_slots: [3, 8] },
                ],
                reason: 'The ambushers spring from the ruined watchtower.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Combat started or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/combat/{combatId}/actions': {
      post: {
        tags: ['Combat'],
        summary: 'Resolve the active actor action atomically',
        description: 'GM-only. Records the declared outcome, applies all validated effects in one transaction, and optionally consumes the active actor turn. Dice are not rolled by this endpoint.',
        parameters: [campaignParameter, combatParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(resolveGameActionBodySchema),
              example: {
                actor_id: '9e031ae2-f333-4546-8475-530962888e5f',
                action: 'Longsword attack',
                outcome: 'success',
                effects: [{
                  actor_id: '2c85d47c-f6ce-4c3a-af53-43a0c81b77e0',
                  changes: [{ type: 'damage', amount: 6, damage_type: 'slashing' }],
                }],
                consume_turn: true,
                reason: 'The player reported a successful attack and 6 damage after armor.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Action resolved or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/combat/{combatId}/turns/advance': {
      post: {
        tags: ['Combat'],
        summary: 'Advance to the next living combatant',
        description: 'GM-only. Requires the current living actor turn to be consumed. Starts the next round automatically after all living participants have acted, preserving initiative order.',
        parameters: [campaignParameter, combatParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(advanceCombatTurnBodySchema),
              example: { reason: 'The active actor completed their action.' },
            },
          },
        },
        responses: {
          200: { description: 'Turn advanced or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
    '/api/v1/campaigns/{campaignId}/combat/{combatId}/end': {
      post: {
        tags: ['Combat'],
        summary: 'End an active combat encounter',
        description: 'GM-only. Marks the encounter completed, clears the active turn, and records its outcome and summary.',
        parameters: [campaignParameter, combatParameter, revisionHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: z.toJSONSchema(endCombatBodySchema),
              example: {
                outcome: 'victory',
                summary: 'The heroes drove the goblins from the watchtower.',
                reason: 'No hostile combatants remain.',
              },
            },
          },
        },
        responses: {
          200: { description: 'Combat ended or original idempotent result', content: { 'application/json': { schema: successEnvelope() } } },
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
