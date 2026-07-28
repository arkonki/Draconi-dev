import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  appendCampaignEventInputSchema,
  applyActorChangesInputSchema,
  getActorInputSchema,
  getCampaignStateInputSchema,
  getCombatStateInputSchema,
  getRecentEventsInputSchema,
  listCampaignsInputSchema,
  mcpReadResultSchema,
  mcpWriteResultSchema,
} from '../helper/schemas.js';
import { HelperApiClientError } from './client.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const MODIFYING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function readResult(envelope) {
  const result = {
    success: true,
    data: envelope.data,
    ...(envelope.meta?.campaignRevision === undefined
      ? {}
      : { campaign_revision: envelope.meta.campaignRevision }),
  };
  return {
    structuredContent: result,
    content: [{
      type: 'text',
      text: `Dragonbane Helper returned current structured state${result.campaign_revision === undefined ? '' : ` at campaign revision ${result.campaign_revision}`}.`,
    }],
  };
}

function writeResult(envelope) {
  return {
    structuredContent: envelope.data,
    content: [{ type: 'text', text: envelope.data.summary }],
  };
}

function errorResult(error) {
  const structuredContent = {
    success: false,
    error: {
      code: error instanceof HelperApiClientError ? error.code : 'MCP_TOOL_ERROR',
      message: error.message || 'MCP tool request failed.',
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  return {
    isError: true,
    structuredContent,
    content: [{
      type: 'text',
      text: `${structuredContent.error.code}: ${structuredContent.error.message}`,
    }],
  };
}

function safe(handler) {
  return async (input) => {
    try {
      return await handler(input);
    } catch (error) {
      return errorResult(error);
    }
  };
}

function safeResource(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const code = error instanceof HelperApiClientError ? error.code : 'MCP_RESOURCE_ERROR';
      throw new Error(`${code}: ${error.message || 'MCP resource request failed.'}`);
    }
  };
}

function jsonResource(uri, data) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

export function createDragonbaneMcpServer(apiClient) {
  const server = new McpServer(
    { name: 'dragonbane-helper', version: '1.0.0-mvp' },
    {
      instructions: [
        'Dragonbane Helper is authoritative. Before continuing a campaign, call get_campaign_state.',
        'Before every write use the latest campaign revision and a unique idempotency key.',
        'On REVISION_CONFLICT, read state again and reassess; never repeat stale arguments.',
        'Never invent HP, WP, conditions, inventory, combat, or campaign facts.',
      ].join(' '),
    },
  );

  server.registerTool('list_campaigns', {
    title: 'List Dragonbane campaigns',
    description: 'Use when the user needs to find campaigns they can access before selecting one.',
    inputSchema: listCampaignsInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.listCampaigns(input))));

  server.registerTool('get_campaign_state', {
    title: 'Get Dragonbane campaign state',
    description: 'Use before continuing an existing campaign and after a revision conflict. Returns a compact authoritative snapshot, not the full history.',
    inputSchema: getCampaignStateInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getCampaignState(input))));

  server.registerTool('get_actor', {
    title: 'Get exact actor state',
    description: 'Use before resolving an action that depends on exact current HP, WP, conditions, attributes, skills, or inventory.',
    inputSchema: getActorInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getActor(input))));

  server.registerTool('get_combat_state', {
    title: 'Get combat state',
    description: 'Use when an action depends on the active encounter, initiative, round, turn, participants, or combat vitals.',
    inputSchema: getCombatStateInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getCombatState(input))));

  server.registerTool('get_recent_events', {
    title: 'Get recent campaign events',
    description: 'Use to recover recent factual developments or inspect changes after a known event sequence.',
    inputSchema: getRecentEventsInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getRecentEvents(input))));

  server.registerTool('apply_actor_changes', {
    title: 'Apply actor changes',
    description: 'Use only after reading the latest campaign revision to atomically apply HP, WP, condition, or existing inventory quantity changes. Explain the intended mechanical effect to the user before calling.',
    inputSchema: applyActorChangesInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.applyActorChanges(input))));

  server.registerTool('append_campaign_event', {
    title: 'Append campaign event',
    description: 'Use for an important narrative development that future sessions must remember. Requires the latest revision and a unique idempotency key.',
    inputSchema: appendCampaignEventInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.appendCampaignEvent(input))));

  server.registerResource(
    'campaign-state',
    new ResourceTemplate('dragonbane://campaigns/{campaignId}/state', { list: undefined }),
    { title: 'Campaign state', description: 'Compact authoritative campaign snapshot', mimeType: 'application/json' },
    safeResource(async (uri, { campaignId }) => jsonResource(
      uri,
      (await apiClient.getCampaignState({ campaign_id: campaignId, recent_event_limit: 20 })).data,
    )),
  );

  server.registerResource(
    'campaign-characters',
    new ResourceTemplate('dragonbane://campaigns/{campaignId}/characters', { list: undefined }),
    { title: 'Campaign characters', description: 'Characters present in the current campaign state', mimeType: 'application/json' },
    safeResource(async (uri, { campaignId }) => {
      const state = (await apiClient.getCampaignState({
        campaign_id: campaignId,
        recent_event_limit: 5,
      })).data;
      return jsonResource(uri, state.actors);
    }),
  );

  server.registerResource(
    'rules-context',
    new ResourceTemplate('dragonbane://campaigns/{campaignId}/rules-context', { list: undefined }),
    { title: 'Supported rules context', description: 'Supported Helper operations without copyrighted rulebook text', mimeType: 'application/json' },
    async (uri, { campaignId }) => jsonResource(uri, {
      campaignId,
      system: 'dragonbane',
      supportedChanges: [
        'damage',
        'heal',
        'spend_wp',
        'restore_wp',
        'add_condition',
        'remove_condition',
        'adjust_inventory',
      ],
      standardConditions: [
        'exhausted',
        'sickly',
        'dazed',
        'angry',
        'scared',
        'disheartened',
      ],
      armorResolutionModes: [
        'roll_required',
        'fixed_reduction',
        'already_resolved',
        'not_applicable',
      ],
    }),
  );

  return server;
}

export const mcpToolAnnotations = {
  list_campaigns: READ_ONLY,
  get_campaign_state: READ_ONLY,
  get_actor: READ_ONLY,
  get_combat_state: READ_ONLY,
  get_recent_events: READ_ONLY,
  apply_actor_changes: MODIFYING,
  append_campaign_event: MODIFYING,
};
