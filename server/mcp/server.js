import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  addSoloWaypointsInputSchema,
  beginSoloReturnInputSchema,
  claimSoloAdvancementAbilityInputSchema,
  addEncounterParticipantsInputSchema,
  advanceCampaignTimeInputSchema,
  advanceCombatTurnInputSchema,
  advanceThreatInputSchema,
  askFortuneInputSchema,
  appendCampaignEventInputSchema,
  checkpointSessionInputSchema,
  completeSoloMissionInputSchema,
  completeSessionInputSchema,
  createCampaignTimeReminderInputSchema,
  createEncounterInputSchema,
  createRollRequestInputSchema,
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
  getResumeStateInputSchema,
  getRollHistoryInputSchema,
  getRollRequestInputSchema,
  getSessionHistoryInputSchema,
  getSoloOptionsInputSchema,
  getSoloStateInputSchema,
  generateSoloNpcInputSchema,
  listCampaignsInputSchema,
  mcpReadResultSchema,
  mcpWriteResultSchema,
  pushRollRequestInputSchema,
  pushSoloCheckInputSchema,
  resolveRollRequestServerInputSchema,
  resolveCampaignTimeNotificationInputSchema,
  resolveSoloCheckInputSchema,
  resolveSoloDyingActionInputSchema,
  resolveSoloInjuryActionInputSchema,
  resolveSoloNarrativeDamageInputSchema,
  resolveSoloNpcBehaviorInputSchema,
  resolveSoloAdvancementInputSchema,
  resolveThreatInputSchema,
  removeEncounterParticipantInputSchema,
  recordManualTreasureDrawInputSchema,
  revealWaypointInputSchema,
  scavengeWaypointInputSchema,
  searchWaypointInputSchema,
  startCombatInputSchema,
  startSessionInputSchema,
  startSoloMissionInputSchema,
  replaceSoloHeroicAbilityInputSchema,
  selectSoloMissionMarksInputSchema,
  setSoloThreatInputSchema,
  setCampaignTimeReminderActiveInputSchema,
  takeSoloRestInputSchema,
} from '../helper/schemas.js';
import { HelperApiClientError } from './client.js';
import { compactWriteStateExcerpt } from '../helper/writeDeltas.js';
import {
  actorChangesServiceInput,
  applyActorChangesMcpInputSchema,
  gameActionServiceInput,
  resolveGameActionMcpInputSchema,
  resolveSoloCheckConsequenceMcpInputSchema,
  soloCheckConsequenceServiceInput,
} from './schemas.js';
import {
  GM_WORKFLOW_URI,
  gmWorkflowGuide,
  gmWorkflowPrompts,
} from './workflows.js';

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

function sessionHistoryReadResult(envelope) {
  const data = { ...envelope.data };
  delete data.latestCheckpoint;
  return readResult({ ...envelope, data });
}

function writeResult(envelope) {
  const data = envelope.data?.state_excerpt
    ? { ...envelope.data, state_excerpt: compactWriteStateExcerpt(envelope.data.state_excerpt) }
    : envelope.data;
  return {
    structuredContent: data,
    content: [{ type: 'text', text: data.summary }],
  };
}

function actorDeltaWriteResult(envelope) {
  const data = envelope.data;
  const result = {
    success: data.success,
    campaign_revision: data.campaign_revision,
    event_ids: data.event_ids,
    summary: data.summary,
    state_excerpt: {
      changes: data.changes || [],
      next: data.next || { read_required: false },
      ...(data.state_excerpt?.warnings?.length
        ? { warnings: data.state_excerpt.warnings }
        : {}),
    },
  };
  return {
    structuredContent: result,
    content: [{ type: 'text', text: data.summary }],
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
      text: JSON.stringify(data),
    }],
  };
}

export function createDragonbaneMcpServer(apiClient) {
  const server = new McpServer(
    { name: 'dragonbane-helper', version: '1.21.0' },
    {
      instructions: [
        'Draconi is authoritative. Before continuing an existing campaign, call get_resume_state with detail="focused" and never reconstruct state from conversation memory.',
        'Before each write, use the latest campaign revision and a unique idempotency key. On REVISION_CONFLICT, reread state and reassess. After an uncertain lost response, verify state and events before retrying; reuse a key only for the exact same request.',
        'Never guess identifiers, mechanics, dice, or stored state. Resume returned active sessions and combats instead of creating duplicates.',
        'Keep gmContext, private GM notes, hidden content, and GM-only threads secret from player-facing output.',
        `Load ${GM_WORKFLOW_URI} or a published workflow prompt for session, combat, roll, Solo, recovery, treasure, advancement, NPC, and privacy procedures.`,
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

  server.registerTool('get_resume_state', {
    title: 'Resume a Dragonbane campaign',
    description: 'Preferred continuation read. Use detail="focused" for normal AI-GM turns, "compact" for status checks, and "full" only for diagnostics or complete exports. The default remains full for compatibility.',
    inputSchema: getResumeStateInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getResumeState(input))));

  server.registerTool('request_roll', {
    title: 'Request a trusted campaign roll',
    description: 'GM-only. Create an immutable player, server, or mixed-mode roll request linked to the current session and optional encounter, actor, and assigned user. Use a bounded NdS expression and never invent a player result.',
    inputSchema: createRollRequestInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.createRollRequest(input))));

  server.registerTool('get_roll_request', {
    title: 'Read a trusted roll request',
    description: 'Read a visible roll request, its pending/resolved/expired status, and its immutable result when resolved.',
    inputSchema: getRollRequestInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getRollRequest(input))));

  server.registerTool('get_roll_history', {
    title: 'List trusted campaign rolls',
    description: 'Read one bounded page of visible trusted rolls, optionally for one encounter. Follow nextCursor only when older results are needed.',
    inputSchema: getRollHistoryInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getRollHistory(input))));

  server.registerTool('push_roll', {
    title: 'Push one failed trusted roll',
    description: 'Push an ordinary failed d20 check exactly once. First ask the user to choose one inactive standard condition and describe how it applies. Atomically applies that condition and creates a linked unresolved request; this tool accepts no dice.',
    inputSchema: pushRollRequestInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.pushRollRequest(input))));

  server.registerTool('resolve_roll_server', {
    title: 'Resolve a request with server dice',
    description: 'Resolve a pending server or mixed-mode request using cryptographically secure server dice. This tool accepts no die values and rejects player-only requests.',
    inputSchema: resolveRollRequestServerInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveRollRequestServer(input))));

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

  server.registerTool('replace_solo_heroic_ability', {
    title: 'Replace an unsuitable Solo heroic ability',
    description: 'GM-only. Between missions and after explicit user confirmation, replace one existing unsuitable heroic ability one-for-one with an ability the Solo hero does not already know. This does not replace the additional Solo setup ability.',
    inputSchema: replaceSoloHeroicAbilityInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.replaceSoloHeroicAbility(input))));

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

  server.registerTool('generate_solo_npc', {
    title: 'Generate a simple Solo NPC',
    description: 'GM-only. Create a rules-compliant Solo v1.2 Minion or Boss with one or two of the melee, ranged, sneaky, or magic attacker roles. The returned monster ID can be added to a planned encounter.',
    inputSchema: generateSoloNpcInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.generateSoloNpc(input))));

  server.registerTool('resolve_solo_npc_behavior', {
    title: 'Resolve Solo NPC behavior',
    description: 'GM-only. Roll a selected NPC role attack on the exact Solo v1.2 D6 table, resolve uncertain intent with Fortune or Inspiration, or ask Fortune whether the NPC flees or surrenders. During active combat, supply the encounter and resolve only the active NPC.',
    inputSchema: resolveSoloNpcBehaviorInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloNpcBehavior(input))));

  server.registerTool('resolve_solo_check', {
    title: 'Resolve a solo skill or attribute check',
    description: 'GM-only. Resolve an authoritative Dragonbane D20 check outside combat using the solo hero stored skill or attribute target. Supports normal, boon, and bane rolls; records every die; marks a skill for advancement on Dragon or Demon; and returns a generic critical prompt or fail-forward requirement.',
    inputSchema: resolveSoloCheckInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloCheck(input))));

  server.registerTool('push_solo_check', {
    title: 'Push one failed Solo check',
    description: 'GM-only. Push an ordinary failed direct Solo check exactly once after the player explains how the push applies. Atomically take one inactive standard condition, or spend 3 WP when the hero knows Sole Survivor, then record the linked authoritative reroll. Demons and pushed rolls are rejected.',
    inputSchema: pushSoloCheckInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.pushSoloCheck(input))));

  server.registerTool('resolve_solo_check_consequence', {
    title: 'Resolve a failed Solo check consequence',
    description: 'GM-only. After explicit user confirmation, resolve fail-forward exactly once for a failed or Demon Solo check. Record one accepted consequence or provide two contextual alternatives for an authoritative 1D6 selection, then atomically apply the selected guarded effect.',
    inputSchema: resolveSoloCheckConsequenceMcpInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloCheckConsequence(
    soloCheckConsequenceServiceInput(input),
  ))));

  server.registerTool('start_solo_mission', {
    title: 'Start a custom solo mission',
    description: 'GM-only. Start one persisted custom mission with an active opening waypoint, hidden unknown waypoint placeholders, a revealed objective waypoint, and one threat counter beginning at 1.',
    inputSchema: startSoloMissionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.startSoloMission(input))));

  server.registerTool('add_solo_waypoints', {
    title: 'Add Solo route waypoints',
    description: 'GM-only. Insert one to six hidden unknown or diversion waypoints immediately after the current waypoint. Optionally generate each location from the installed Solo area and location tables with immutable server dice.',
    inputSchema: addSoloWaypointsInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.addSoloWaypoints(input))));

  server.registerTool('begin_solo_return', {
    title: 'Begin the Solo return journey',
    description: 'GM-only. After reaching the objective, begin a cleared return without incident, test Awareness or Sneaking for a dangerous route, or generate D4+2 hidden return waypoints when the direct route is impossible.',
    inputSchema: beginSoloReturnInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.beginSoloReturn(input))));

  server.registerTool('reveal_waypoint', {
    title: 'Reveal the next solo waypoint',
    description: 'GM-only. Resolve the current waypoint and activate only the next sequential waypoint. Unknown waypoint content is supplied at reveal time and later hidden waypoints remain absent from responses.',
    inputSchema: revealWaypointInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.revealWaypoint(input))));

  server.registerTool('search_waypoint', {
    title: 'Search the current solo waypoint',
    description: 'GM-only. Perform a Solo v1.2 Search at the active waypoint. The server resolves Spot Hidden unless a specific hiding place is known; if both its location and nature are known, no table roll is made. It records all table and subtable dice, consumes one stretch, advances time and the active threat, marks critical Spot Hidden rolls, and returns explicit trap, path, location, and treasure follow-ups.',
    inputSchema: searchWaypointInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.searchWaypoint(input))));

  server.registerTool('scavenge_waypoint', {
    title: 'Scavenge the current solo waypoint',
    description: 'GM-only. Roll on the Solo v1.2 Scavenge table and any required danger, supply, or interesting-item subtable. A first quick pass advances time by two minutes without advancing threat; repeat attempts or an explicitly prolonged pass consume one stretch, advance time by 15 minutes, and advance the threat by 1. Findings are recorded but not silently added to inventory.',
    inputSchema: scavengeWaypointInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.scavengeWaypoint(input))));

  server.registerTool('record_manual_treasure_draw', {
    title: 'Record a physical Solo treasure-card draw',
    description: 'GM-only. Record X cards the user physically drew from their official treasure deck after shuffling, including duplicates and user-entered contents. Requires confirmation that the cards were returned and the deck reshuffled. Never generate card text.',
    inputSchema: recordManualTreasureDrawInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.recordManualTreasureDraw(input))));

  server.registerTool('take_solo_rest', {
    title: 'Take a solo rest',
    description: 'GM-only. Resolve a round, stretch, or shift rest for the solo hero. The server enforces once-per-shift limits, rolls recovery, requires an explicit condition choice and safe-location confirmation where applicable, advances game time and temporary injury recovery, and advances an active mission threat for stretch or shift rests.',
    inputSchema: takeSoloRestInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.takeSoloRest(input))));

  server.registerTool('resolve_solo_dying_action', {
    title: 'Resolve a solo dying action',
    description: 'GM-only. At 0 HP, resolve a CON death roll, an unbaned Persuasion self-rally, a life-saving Healing attempt, or recovery for legacy state already at three successes. The server records all dice, counters, recovery, death, and any persisted severe injury.',
    inputSchema: resolveSoloDyingActionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloDyingAction(input))));

  server.registerTool('resolve_solo_narrative_damage', {
    title: 'Resolve solo narrative damage',
    description: 'GM-only. After explicit user confirmation, resolve slight, moderate, severe, or unknown narrative damage outside combat. Unknown severity is rolled from the Solo table; damage and any death-state consequence are applied atomically.',
    inputSchema: resolveSoloNarrativeDamageInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloNarrativeDamage(input))));

  server.registerTool('resolve_solo_injury_action', {
    title: 'Treat or resolve a solo severe injury',
    description: 'GM-only. After explicit user confirmation, attempt medical care with the stored Healing skill or apply an audited manual healed override. Successful care halves remaining recovery time; failed care is limited to once per injury per shift. Permanent injuries cannot be removed by medical care.',
    inputSchema: resolveSoloInjuryActionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloInjuryAction(input))));

  server.registerTool('advance_threat', {
    title: 'Advance the active solo threat',
    description: 'GM-only. Advance the current mission threat by 1 or 2 for the supplied reason. At 6, reveal and record its trigger effect and leave it triggered until resolved.',
    inputSchema: advanceThreatInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.advanceThreat(input))));

  server.registerTool('resolve_solo_threat', {
    title: 'Resolve a triggered Solo threat',
    description: 'GM-only. Record how a threat event at 6 was resolved. A recurring inherent threat resets to 1; a non-recurring threat is removed from the active mission and must be replaced while delving.',
    inputSchema: resolveThreatInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveThreat(input))));

  server.registerTool('set_solo_threat', {
    title: 'Set the current Solo threat',
    description: 'GM-only. Create and activate a replacement mission threat at counter 1, optionally removing the existing active or triggered threat.',
    inputSchema: setSoloThreatInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.setSoloThreat(input))));

  server.registerTool('complete_solo_mission', {
    title: 'Complete the current solo mission',
    description: 'GM-only. End the current solo mission as success, failure, or abandoned and record its durable summary and rewards. Success is allowed only at the final objective waypoint.',
    inputSchema: completeSoloMissionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.completeSoloMission(input))));

  server.registerTool('select_solo_mission_marks', {
    title: 'Select five Solo mission advancement marks',
    description: 'GM-only. After mission success and between missions, apply exactly five player-selected new skill marks. Each selected skill must exist and not already be marked.',
    inputSchema: selectSoloMissionMarksInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.selectSoloMissionMarks(input))));

  server.registerTool('resolve_solo_advancement', {
    title: 'Resolve Solo between-mission advancement',
    description: 'GM-only. Roll one authoritative D20 for every marked skill; rolls greater than the current value improve it by one to a maximum of 18. Clears marks and returns one heroic ability reward for each skill that reaches 18.',
    inputSchema: resolveSoloAdvancementInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveSoloAdvancement(input))));

  server.registerTool('claim_solo_advancement_ability', {
    title: 'Claim a Solo advancement heroic ability',
    description: 'GM-only. Claim one pending heroic ability reward after a marked skill reaches 18. The ability must exist and must not already be known.',
    inputSchema: claimSoloAdvancementAbilityInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.claimSoloAdvancementAbility(input))));

  server.registerTool('get_campaign_time', {
    title: 'Get campaign session time',
    description: 'GM-only. Read the authoritative elapsed campaign clock together with the active session, configured periodic roll reminders, and persistent due-roll notifications. Use before advancing time.',
    inputSchema: getCampaignStateInputSchema.pick({ campaign_id: true }),
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => readResult(await apiClient.getCampaignTime(input))));

  server.registerTool('advance_campaign_time', {
    title: 'Advance campaign time',
    description: 'GM-only. Advance the authoritative clock by rounds, stretches, shifts, or days. Also updates timed equipment and the visual Time tracker, and returns any roll reminders now due. Read get_campaign_time first.',
    inputSchema: advanceCampaignTimeInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.advanceCampaignTime(input))));

  server.registerTool('create_time_roll_reminder', {
    title: 'Schedule a campaign-time roll reminder',
    description: 'GM-only. After the user establishes the activity or adventure cadence, schedule a named dice roll every X rounds, stretches, or shifts, counted from now. Do not invent a universal official cadence.',
    inputSchema: createCampaignTimeReminderInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.createCampaignTimeReminder(input))));

  server.registerTool('set_time_roll_reminder_active', {
    title: 'Pause or resume a campaign-time roll reminder',
    description: 'GM-only. Pause or resume an existing periodic roll reminder.',
    inputSchema: setCampaignTimeReminderActiveInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.setCampaignTimeReminderActive(input))));

  server.registerTool('resolve_time_roll_notification', {
    title: 'Mark a due campaign-time roll handled',
    description: 'GM-only. Resolve a pending roll notification after the roll has actually been made or deliberately waived. This does not manufacture a die result.',
    inputSchema: resolveCampaignTimeNotificationInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveCampaignTimeNotification(input))));

  server.registerTool('get_session_history', {
    title: 'Get game session history',
    description: 'Read one bounded page of sessions and checkpoints. Follow each next cursor only when older history is needed; GM access includes private notes.',
    inputSchema: getSessionHistoryInputSchema,
    outputSchema: mcpReadResultSchema,
    annotations: READ_ONLY,
  }, safe(async (input) => sessionHistoryReadResult(await apiClient.getSessionHistory(input))));

  server.registerTool('start_session', {
    title: 'Start a game session',
    description: 'GM-only. Start one active game session, optionally record an opening scene and private GM notes, and bind subsequent campaign events to it. Read the latest campaign revision first.',
    inputSchema: startSessionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.startSession(input))));

  server.registerTool('checkpoint_session', {
    title: 'Checkpoint an active game session',
    description: 'GM-only. Atomically save a durable continuation summary, validated current scene, and optional unresolved threads without ending the active session. Read the latest campaign revision first.',
    inputSchema: checkpointSessionInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.checkpointSession(input))));

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
    inputSchema: resolveGameActionMcpInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => writeResult(await apiClient.resolveGameAction(
    gameActionServiceInput(input),
  ))));

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
    inputSchema: applyActorChangesMcpInputSchema,
    outputSchema: mcpWriteResultSchema,
    annotations: MODIFYING,
  }, safe(async (input) => actorDeltaWriteResult(await apiClient.applyActorChanges(
    actorChangesServiceInput(input),
  ))));

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
      (await apiClient.getCampaignState({ campaign_id: campaignId, recent_event_limit: 10 })).data,
    )),
  );

  server.registerResource(
    'campaign-resume-state',
    new ResourceTemplate('dragonbane://campaigns/{campaignId}/resume-state', { list: undefined }),
    { title: 'Campaign resume state', description: 'Revision-consistent authoritative continuation snapshot', mimeType: 'application/json' },
    safeResource(async (uri, { campaignId }) => jsonResource(
      uri,
      (await apiClient.getResumeState({ campaign_id: campaignId, detail: 'focused' })).data,
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
        'get_resume_state',
        'get_campaign_time',
        'advance_campaign_time',
        'create_time_roll_reminder',
        'set_time_roll_reminder_active',
        'resolve_time_roll_notification',
        'get_session_history',
        'start_session',
        'checkpoint_session',
        'complete_session',
      ],
      supportedRollOperations: [
        'request_roll',
        'get_roll_request',
        'get_roll_history',
        'push_roll',
        'resolve_roll_server',
      ],
      supportedSoloOperations: [
        'get_solo_options',
        'get_solo_state',
        'enable_solo_mode',
        'disable_solo_mode',
        'select_solo_heroic_ability',
        'ask_fortune',
        'draw_inspiration',
        'resolve_solo_check',
        'resolve_solo_check_consequence',
        'start_solo_mission',
        'reveal_waypoint',
        'search_waypoint',
        'scavenge_waypoint',
        'record_manual_treasure_draw',
        'take_solo_rest',
        'resolve_solo_dying_action',
        'resolve_solo_narrative_damage',
        'resolve_solo_injury_action',
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

  server.registerResource(
    'gm-session-workflow',
    GM_WORKFLOW_URI,
    {
      title: 'Dragonbane GM session workflow',
      description: 'State-first session, roll, encounter, combat, recovery, privacy, and example-prompt guidance',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri, gmWorkflowGuide),
  );

  for (const prompt of gmWorkflowPrompts) {
    server.registerPrompt(prompt.name, prompt.config, prompt.render);
  }

  return server;
}

export const mcpToolAnnotations = {
  list_campaigns: READ_ONLY,
  get_campaign_state: READ_ONLY,
  get_resume_state: READ_ONLY,
  request_roll: MODIFYING,
  get_roll_request: READ_ONLY,
  get_roll_history: READ_ONLY,
  push_roll: MODIFYING,
  resolve_roll_server: MODIFYING,
  get_solo_options: READ_ONLY,
  get_solo_state: READ_ONLY,
  enable_solo_mode: MODIFYING,
  disable_solo_mode: MODIFYING,
  select_solo_heroic_ability: MODIFYING,
  ask_fortune: MODIFYING,
  draw_inspiration: MODIFYING,
  resolve_solo_check: MODIFYING,
  resolve_solo_check_consequence: MODIFYING,
  start_solo_mission: MODIFYING,
  reveal_waypoint: MODIFYING,
  search_waypoint: MODIFYING,
  scavenge_waypoint: MODIFYING,
  record_manual_treasure_draw: MODIFYING,
  take_solo_rest: MODIFYING,
  resolve_solo_dying_action: MODIFYING,
  resolve_solo_narrative_damage: MODIFYING,
  resolve_solo_injury_action: MODIFYING,
  advance_threat: MODIFYING,
  complete_solo_mission: MODIFYING,
  get_campaign_time: READ_ONLY,
  advance_campaign_time: MODIFYING,
  create_time_roll_reminder: MODIFYING,
  set_time_roll_reminder_active: MODIFYING,
  resolve_time_roll_notification: MODIFYING,
  get_session_history: READ_ONLY,
  start_session: MODIFYING,
  checkpoint_session: MODIFYING,
  complete_session: MODIFYING,
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
