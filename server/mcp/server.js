import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  addEncounterParticipantsInputSchema,
  advanceCombatTurnInputSchema,
  appendCampaignEventInputSchema,
  applyActorChangesInputSchema,
  completeSessionInputSchema,
  createEncounterInputSchema,
  endCombatInputSchema,
  getActorInputSchema,
  getCampaignStateInputSchema,
  getCombatStateInputSchema,
  getEncounterSetupOptionsInputSchema,
  getRecentEventsInputSchema,
  getSessionHistoryInputSchema,
  listCampaignsInputSchema,
  mcpReadResultSchema,
  mcpWriteResultSchema,
  resolveGameActionInputSchema,
  removeEncounterParticipantInputSchema,
  startCombatInputSchema,
  startSessionInputSchema,
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
    { name: 'dragonbane-helper', version: '1.3.0' },
    {
      instructions: [
        'Dragonbane Helper is authoritative. Before continuing a campaign, call get_campaign_state.',
        'Before every write use the latest campaign revision and a unique idempotency key.',
        'On REVISION_CONFLICT, read state again and reassess; never repeat stale arguments.',
        'Use start_session before sustained play so later campaign and combat events are attached to the session; complete_session when play ends.',
        'To prepare combat, discover valid characters and monsters, create a planned encounter, add participants, then use start_combat to assign initiative and begin.',
        'During combat, resolve only the active actor, then advance the turn after its turn-consuming action.',
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

  server.registerTool('get_session_history', {
    title: 'Get game session history',
    description: 'List recent game sessions and their durable summaries. GM access also includes private GM notes.',
    inputSchema: getSessionHistoryInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getSessionHistory(input))));

  server.registerTool('start_session', {
    title: 'Start a game session',
    description: 'GM-only. Start one active game session, optionally record an opening scene and private GM notes, and bind subsequent campaign events to it. Read the latest campaign revision first.',
    inputSchema: startSessionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.startSession(input))));

  server.registerTool('complete_session', {
    title: 'Complete a game session',
    description: 'GM-only. Complete the active session with a durable summary, ending scene, and explicit unresolved threads for future continuation. Read the latest campaign revision first.',
    inputSchema: completeSessionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.completeSession(input))));

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

  server.registerTool('get_encounter_setup_options', {
    title: 'Get encounter setup options',
    description: 'GM-only. List party characters, searchable monster choices with resolved ferocity, and existing planned encounters. Use before creating or populating an encounter.',
    inputSchema: getEncounterSetupOptionsInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getEncounterSetupOptions(input))));

  server.registerTool('create_encounter', {
    title: 'Create a planned combat encounter',
    description: 'GM-only. Create an empty planned encounter. Read the latest campaign revision first, then add participants before starting it.',
    inputSchema: createEncounterInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.createEncounter(input))));

  server.registerTool('add_encounter_participants', {
    title: 'Add encounter participants',
    description: 'GM-only. Add party characters and monster selections to a planned encounter. Monster count and ferocity are expanded into the correct initiative actions. Read the latest campaign revision first.',
    inputSchema: addEncounterParticipantsInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.addEncounterParticipants(input))));

  server.registerTool('remove_encounter_participant', {
    title: 'Remove an encounter participant',
    description: 'GM-only. Remove one actor from a planned encounter using the actor_id returned by get_combat_state. Read the latest campaign revision first.',
    inputSchema: removeEncounterParticipantInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.removeEncounterParticipant(input))));

  server.registerTool('start_combat', {
    title: 'Start a combat encounter',
    description: 'GM-only. Start an existing planned encounter, optionally assign initiative cards 1–10, synchronize player-character vitals, and select the first active actor. Read campaign state immediately before calling.',
    inputSchema: startCombatInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.startCombat(input))));

  server.registerTool('resolve_game_action', {
    title: 'Resolve the active combat actor action',
    description: 'GM-only. Atomically record the active actor action and apply validated HP, WP, condition, or inventory effects to combat participants. Use only user/app-supplied roll outcomes; this tool does not roll dice. A turn-consuming action must be followed by advance_combat_turn.',
    inputSchema: resolveGameActionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveGameAction(input))));

  server.registerTool('advance_combat_turn', {
    title: 'Advance the combat turn',
    description: 'GM-only. Advance from an actor whose turn was resolved to the next living participant. When everyone has acted, start the next round while preserving the current initiative order.',
    inputSchema: advanceCombatTurnInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.advanceCombatTurn(input))));

  server.registerTool('end_combat', {
    title: 'End a combat encounter',
    description: 'GM-only. Complete an active combat encounter, clear its active turn, and record the outcome and summary for future sessions.',
    inputSchema: endCombatInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.endCombat(input))));

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
      supportedCombatOperations: [
        'get_encounter_setup_options',
        'create_encounter',
        'add_encounter_participants',
        'remove_encounter_participant',
        'start_combat',
        'resolve_game_action',
        'advance_combat_turn',
        'end_combat',
      ],
      supportedSessionOperations: [
        'get_session_history',
        'start_session',
        'complete_session',
      ],
      combatLimits: [
        'only party characters and monsters from the local catalog can be added',
        'monster ferocity may expand one creature into multiple initiative actions',
        'dice outcomes must come from the user or application',
        'initiative order is preserved when a new round starts',
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
  start_combat: MODIFYING,
  resolve_game_action: MODIFYING,
  advance_combat_turn: MODIFYING,
  end_combat: MODIFYING,
  get_recent_events: READ_ONLY,
  apply_actor_changes: MODIFYING,
  append_campaign_event: MODIFYING,
};
