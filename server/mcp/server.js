import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  addEncounterParticipantsInputSchema,
  advanceCombatTurnInputSchema,
  advanceThreatInputSchema,
  askFortuneInputSchema,
  appendCampaignEventInputSchema,
  applyActorChangesInputSchema,
  completeSoloMissionInputSchema,
  completeSessionInputSchema,
  createEncounterInputSchema,
  drawInspirationInputSchema,
  disableSoloModeInputSchema,
  enableSoloModeInputSchema,
  selectSoloHeroicAbilityInputSchema,
  endCombatInputSchema,
  getActorInputSchema,
  getCampaignStateInputSchema,
  getCombatStateInputSchema,
  getEncounterSetupOptionsInputSchema,
  getRecentEventsInputSchema,
  getSessionHistoryInputSchema,
  getSoloOptionsInputSchema,
  getSoloStateInputSchema,
  listCampaignsInputSchema,
  mcpReadResultSchema,
  mcpWriteResultSchema,
  resolveGameActionInputSchema,
  removeEncounterParticipantInputSchema,
  revealWaypointInputSchema,
  scavengeWaypointInputSchema,
  searchWaypointInputSchema,
  startCombatInputSchema,
  startSessionInputSchema,
  startSoloMissionInputSchema,
  takeSoloRestInputSchema,
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
    { name: 'dragonbane-helper', version: '1.9.0' },
    {
      instructions: [
        'Dragonbane Helper is authoritative. Before continuing a campaign, call get_campaign_state.',
        'Before every write use the latest campaign revision and a unique idempotency key.',
        'On REVISION_CONFLICT, read state again and reassess; never repeat stale arguments.',
        'Use start_session before sustained play so later campaign and combat events are attached to the session; complete_session when play ends.',
        'To prepare combat, discover valid characters and monsters, create a planned encounter, add participants, then use start_combat to assign initiative and begin. A lone solo hero with Army of One requires two distinct initiative_slots.',
        'During combat, resolve only the active actor, then advance the turn after its turn-consuming action.',
        'For solo play, call get_solo_state before narrating. Fortune and Inspiration results are authoritative only when returned by their tools.',
        'Use search_waypoint for a thorough Spot Hidden search and scavenge_waypoint for a quick exploration find; honor their recorded stretch and threat consequences and treat generic findings as prompts, not automatic inventory.',
        'Use take_solo_rest only after the user chooses the rest type and any condition to clear. A shift rest requires explicit confirmation of a safe location; stretch and shift rests advance an active mission threat. Never clear poison, fear, or custom effects as a standard rest condition.',
        'Never reveal or infer a hidden waypoint. Use only the public waypoint fields returned by get_solo_state.',
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

  server.registerTool('get_solo_options', {
    title: 'Get solo-mode setup options',
    description: 'List eligible campaign characters, supported solo rulesets and modes, current solo configuration, and missing prerequisites. Use before enabling solo mode.',
    inputSchema: getSoloOptionsInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getSoloOptions(input))));

  server.registerTool('get_solo_state', {
    title: 'Get authoritative solo state',
    description: 'Use before narrating or continuing solo play. Returns the solo hero, public scene, recent trusted rolls, and currently allowed solo actions.',
    inputSchema: getSoloStateInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getSoloState(input))));

  server.registerTool('enable_solo_mode', {
    title: 'Enable solo mode for a campaign',
    description: 'GM-only. Bind one existing campaign player character to the supported solo ruleset. This never changes heroic abilities automatically and currently supports custom solo adventures only.',
    inputSchema: enableSoloModeInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.enableSoloMode(input))));

  server.registerTool('disable_solo_mode', {
    title: 'Disable solo mode for a campaign',
    description: 'GM-only. Disable solo mode after active solo missions and combat are complete. Removes only an additional heroic ability that Draconi itself granted for solo play.',
    inputSchema: disableSoloModeInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.disableSoloMode(input))));

  server.registerTool('select_solo_heroic_ability', {
    title: 'Select the solo hero additional ability',
    description: 'GM-only. After explicit user confirmation, assign or replace the configured solo character additional heroic ability. Use get_solo_options first and pass an ability ID returned there.',
    inputSchema: selectSoloHeroicAbilityInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.selectSoloHeroicAbility(input))));

  server.registerTool('ask_fortune', {
    title: 'Ask the solo Fortune oracle',
    description: 'GM-only. Resolve a genuinely uncertain solo question with an authoritative server roll, retaining every die, the kept result, table version, and campaign event.',
    inputSchema: askFortuneInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.askFortune(input))));

  server.registerTool('draw_inspiration', {
    title: 'Draw solo inspiration',
    description: 'GM-only. Roll any selected subset of action, attribute, and thing columns. Results are prompts, not established campaign facts until applied through a later event.',
    inputSchema: drawInspirationInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.drawInspiration(input))));

  server.registerTool('start_solo_mission', {
    title: 'Start a custom solo mission',
    description: 'GM-only. Start one persisted custom mission with an active opening waypoint, hidden unknown waypoint placeholders, a revealed objective waypoint, and one threat counter beginning at 1.',
    inputSchema: startSoloMissionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.startSoloMission(input))));

  server.registerTool('reveal_waypoint', {
    title: 'Reveal the next solo waypoint',
    description: 'GM-only. Resolve the current waypoint and activate only the next sequential waypoint. Unknown waypoint content is supplied at reveal time and later hidden waypoints remain absent from responses.',
    inputSchema: revealWaypointInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.revealWaypoint(input))));

  server.registerTool('search_waypoint', {
    title: 'Search the current solo waypoint',
    description: 'GM-only. Perform a thorough Search at the active waypoint. The server resolves Spot Hidden unless a specific known hiding place is supplied, records every die, consumes one stretch, advances the active threat by 1, and returns abstract Draconi-generic findings.',
    inputSchema: searchWaypointInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.searchWaypoint(input))));

  server.registerTool('scavenge_waypoint', {
    title: 'Scavenge the current solo waypoint',
    description: 'GM-only. Make a quick Draconi-generic d10 exploration find at the active waypoint. The first quick pass takes no stretch; repeat attempts or an explicitly thorough pass consume one stretch and advance the active threat by 1. All dice are recorded.',
    inputSchema: scavengeWaypointInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.scavengeWaypoint(input))));

  server.registerTool('take_solo_rest', {
    title: 'Take a solo rest',
    description: 'GM-only. Resolve a round, stretch, or shift rest for the solo hero. The server enforces once-per-shift limits, rolls recovery, requires an explicit condition choice and safe-location confirmation where applicable, advances game time, and advances an active mission threat for stretch or shift rests.',
    inputSchema: takeSoloRestInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.takeSoloRest(input))));

  server.registerTool('advance_threat', {
    title: 'Advance the active solo threat',
    description: 'GM-only. Advance the current mission threat by 1 or 2 for the supplied reason. At 6, reveal and record its trigger effect; recurring threats reset to 1.',
    inputSchema: advanceThreatInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.advanceThreat(input))));

  server.registerTool('complete_solo_mission', {
    title: 'Complete the current solo mission',
    description: 'GM-only. End the current solo mission as success, failure, or abandoned and record its durable summary and rewards. Success is allowed only at the final objective waypoint.',
    inputSchema: completeSoloMissionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.completeSoloMission(input))));

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
    description: 'GM-only. Start an existing planned encounter, optionally assign initiative cards 1–10, synchronize player-character vitals, and select the first active actor. For a lone solo hero with Army of One, pass two distinct initiative_slots on that actor assignment. Read campaign state immediately before calling.',
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
    description: 'GM-only. Advance from a resolved initiative slot to the next living participant slot. Army of One can therefore activate the same actor twice in one round. When all slots are resolved, start the next round while preserving the current initiative cards.',
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
      supportedSoloOperations: [
        'get_solo_options',
        'get_solo_state',
        'enable_solo_mode',
        'disable_solo_mode',
        'select_solo_heroic_ability',
        'ask_fortune',
        'draw_inspiration',
        'start_solo_mission',
        'reveal_waypoint',
        'search_waypoint',
        'scavenge_waypoint',
        'take_solo_rest',
        'advance_threat',
        'complete_solo_mission',
      ],
      combatLimits: [
        'only party characters and monsters from the local catalog can be added',
        'monster ferocity may expand one creature into multiple initiative actions',
        'dice outcomes must come from the user or application',
        'initiative order is preserved when a new round starts',
        'Army of One uses two distinct initiative slots on one actor; the actor is never duplicated',
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
  get_solo_options: READ_ONLY,
  get_solo_state: READ_ONLY,
  enable_solo_mode: MODIFYING,
  disable_solo_mode: MODIFYING,
  select_solo_heroic_ability: MODIFYING,
  ask_fortune: MODIFYING,
  draw_inspiration: MODIFYING,
  start_solo_mission: MODIFYING,
  reveal_waypoint: MODIFYING,
  search_waypoint: MODIFYING,
  scavenge_waypoint: MODIFYING,
  take_solo_rest: MODIFYING,
  advance_threat: MODIFYING,
  complete_solo_mission: MODIFYING,
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
