// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelperApiClientError } from './client.js';
import { createDragonbaneMcpServer } from './server.js';

const campaignId = 'b2f6308c-20c1-4701-bf9d-cb0949730d9c';
const actorId = '03d353da-eb85-407c-a405-3210430b21fc';
const combatId = '82783674-9f79-4539-bd97-d88b3c772cc0';
const monsterId = 'a245161e-d43c-4f17-a702-e1cbf7ca22d7';
const monsterActorId = 'f4974280-bb74-4560-a8c1-11117b6668af';
const sessionId = '9e748766-03c7-48ca-a59b-d17d66173c3f';
const missionId = 'f35f9f4e-65c8-4a7f-a63a-3aa66ac84f48';
const threatId = '4a7fd3d4-384d-42bc-9362-2c6379d70291';
const waypointId = 'b93bd6e4-7b86-4ccd-8639-cb5f5fd5dd56';
const soloAbilityId = '30000000-0000-4000-8000-000000000101';

let client;
let server;
let api;

beforeEach(async () => {
  api = {
    listCampaigns: vi.fn(async () => ({
      data: { campaigns: [{ id: campaignId, name: 'The Misty Vale', revision: 4 }] },
      meta: { requestId: 'request-1' },
    })),
    getCampaignState: vi.fn(async () => ({
      data: { campaign: { id: campaignId, revision: 42 }, actors: [] },
      meta: { requestId: 'request-2', campaignRevision: 42 },
    })),
    getSoloOptions: vi.fn(async () => ({
      data: {
        campaignRevision: 42,
        solo: { enabled: false },
        characters: [{ id: actorId, name: 'Alaric' }],
        modes: [{ key: 'custom', available: true }],
      },
      meta: { requestId: 'request-solo-options', campaignRevision: 42 },
    })),
    getSoloState: vi.fn(async () => ({
      data: {
        campaignRevision: 43,
        solo: { enabled: true, mode: 'custom', playerCharacterId: actorId },
        allowedNextActions: ['ask_fortune', 'draw_inspiration'],
      },
      meta: { requestId: 'request-solo-state', campaignRevision: 43 },
    })),
    enableSoloMode: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 43,
        event_ids: ['0d6f6202-9be2-41d4-b8d0-1a0655243eb7'],
        summary: 'Solo mode enabled for Alaric.',
        state_excerpt: { solo: { enabled: true, mode: 'custom' } },
      },
      meta: { requestId: 'request-solo-enable', campaignRevision: 43 },
    })),
    disableSoloMode: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 54,
        event_ids: ['6acbf745-8217-45dc-90c2-1ce65f29e19d'],
        summary: 'Solo mode disabled for this campaign.',
        state_excerpt: { solo: { enabled: false } },
      },
      meta: { requestId: 'request-solo-disable', campaignRevision: 54 },
    })),
    selectSoloHeroicAbility: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 44,
        event_ids: ['3ad553e5-32f9-42fa-a46f-a8e68afe88d4'],
        summary: 'Army of One selected for Alaric.',
        state_excerpt: {
          solo: { enabled: true, soloHeroicAbilityId: soloAbilityId },
          playerCharacter: { id: actorId, heroicAbilities: ['Army of One'] },
        },
      },
      meta: { requestId: 'request-solo-ability', campaignRevision: 44 },
    })),
    askFortune: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 45,
        event_ids: ['dbdcce2c-7c12-4160-8081-950e65050424'],
        summary: 'Fortune answered “yes” (1d6: 4; kept 4).',
        state_excerpt: { roll: { expression: '1d6', dice: [4], keptValues: [4] } },
      },
      meta: { requestId: 'request-fortune', campaignRevision: 45 },
    })),
    drawInspiration: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 46,
        event_ids: ['f530f6b7-605b-452c-a184-d3441a26c79b'],
        summary: 'Inspiration: reveal secret (4, 8).',
        state_excerpt: { roll: { expression: '2d20', dice: [4, 8] } },
      },
      meta: { requestId: 'request-inspiration', campaignRevision: 46 },
    })),
    startSoloMission: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 47,
        event_ids: ['ca287c76-d4c4-4ae7-a1ae-fc49becb8c81'],
        summary: 'Solo mission “The Sunken Bell” started. Threat begins at 1.',
        state_excerpt: {
          mission: { id: missionId, status: 'active' },
          threat: { id: threatId, counter: 1, status: 'active' },
        },
      },
      meta: { requestId: 'request-mission-start', campaignRevision: 47 },
    })),
    advanceThreat: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 48,
        event_ids: ['598f67de-e6c3-4ae1-b28c-e234df897f56'],
        summary: 'Threat advanced from 1 to 2.',
        state_excerpt: { threat: { id: threatId, counter: 2, status: 'active' } },
      },
      meta: { requestId: 'request-threat-advance', campaignRevision: 48 },
    })),
    revealWaypoint: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 49,
        event_ids: ['4592aeed-80fa-453c-be28-c39da8cdaef5'],
        summary: 'Waypoint revealed: Echoing gallery.',
        state_excerpt: { currentWaypoint: { id: waypointId, status: 'active' } },
      },
      meta: { requestId: 'request-waypoint-reveal', campaignRevision: 49 },
    })),
    searchWaypoint: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 50,
        event_ids: ['51ef1632-6649-4473-a157-8101f8fd1164', '9041421d-f2e4-498c-bb80-6f523020c97e'],
        summary: 'Search (success): Useful supplies. Threat 2 → 3.',
        state_excerpt: {
          roll: { expression: '1d20 + 1d10', dice: [7, 5] },
          waypoint: { id: waypointId, exploration: { searchCount: 1, scavengeCount: 0, stretchesSpent: 1 } },
          threat: { id: threatId, counter: 3 },
        },
      },
      meta: { requestId: 'request-waypoint-search', campaignRevision: 50 },
    })),
    scavengeWaypoint: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 51,
        event_ids: ['0548bb23-a291-4327-a0e3-77e24eeb1643'],
        summary: 'Scavenge: Something useful. Quick first pass; no threat advance.',
        state_excerpt: {
          roll: { expression: '1d10', dice: [8] },
          waypoint: { id: waypointId, exploration: { searchCount: 1, scavengeCount: 1, stretchesSpent: 1 } },
          threat: { id: threatId, counter: 3 },
        },
      },
      meta: { requestId: 'request-waypoint-scavenge', campaignRevision: 51 },
    })),
    takeSoloRest: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 52,
        event_ids: ['a9c518e0-c7a6-4a2e-bab4-d2316c071c9b', 'f74a3c1e-4378-4d95-b33c-17fcc0aeecc2'],
        summary: 'Stretch rest: 6 HP and 3 WP restored; cleared exhausted. Threat 3 → 4.',
        state_excerpt: {
          restState: { roundRestTaken: false, stretchRestTaken: true },
          roll: { expression: '1d20 + 3d6', dice: [7, 2, 4, 3] },
          threat: { id: threatId, counter: 4 },
        },
      },
      meta: { requestId: 'request-solo-rest', campaignRevision: 52 },
    })),
    completeSoloMission: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 53,
        event_ids: ['0dc71ac5-20e2-419e-a738-8342c7ee933a'],
        summary: 'Solo mission “The Sunken Bell” ended with abandoned.',
        state_excerpt: { mission: { id: missionId, status: 'abandoned' }, currentMissionId: null },
      },
      meta: { requestId: 'request-mission-complete', campaignRevision: 53 },
    })),
    getSessionHistory: vi.fn(async () => ({
      data: { campaignRevision: 42, sessions: [] },
      meta: { requestId: 'request-session-history', campaignRevision: 42 },
    })),
    startSession: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 43,
        event_ids: ['aeb5ecae-c39a-4dda-8b81-dde229489504'],
        summary: 'Night of the Manticore started.',
        state_excerpt: { session: { id: sessionId, status: 'active' } },
      },
      meta: { requestId: 'request-session-start', campaignRevision: 43 },
    })),
    completeSession: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 44,
        event_ids: ['907f3c7a-4685-43ff-a882-d7dbb249f54c'],
        summary: 'Night of the Manticore completed and its campaign summary was saved.',
        state_excerpt: { session: { id: sessionId, status: 'completed' } },
      },
      meta: { requestId: 'request-session-complete', campaignRevision: 44 },
    })),
    getActor: vi.fn(async () => ({
      data: { id: actorId, name: 'Alaric', hp: { current: 14, max: 14 }, revision: 42 },
      meta: { requestId: 'request-3', campaignRevision: 42 },
    })),
    getCombatState: vi.fn(async () => ({
      data: null,
      meta: { requestId: 'request-4', campaignRevision: 42 },
    })),
    getEncounterSetupOptions: vi.fn(async () => ({
      data: {
        campaignRevision: 42,
        characters: [{ id: actorId, name: 'Alaric' }],
        monsters: [{ id: monsterId, name: 'Goblin', resolvedFerocity: 1 }],
        plannedEncounters: [],
      },
      meta: { requestId: 'request-options', campaignRevision: 42 },
    })),
    createEncounter: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 43,
        event_ids: ['87f11f3a-32e1-4bf2-94ef-197e9564d549'],
        summary: 'Roadside ambush was created as a planned encounter.',
        state_excerpt: { combat: { id: combatId, status: 'planning', participants: [] } },
      },
      meta: { requestId: 'request-create', campaignRevision: 43 },
    })),
    addEncounterParticipants: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 44,
        event_ids: ['e327d643-9dcc-4575-b77d-f781f2e18ab9'],
        summary: 'Added 2 participants to Roadside ambush.',
        state_excerpt: {
          added_actor_ids: [actorId, monsterActorId],
          combat: { id: combatId, status: 'planning' },
        },
      },
      meta: { requestId: 'request-add-participants', campaignRevision: 44 },
    })),
    removeEncounterParticipant: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 45,
        event_ids: ['61983333-d90d-4f52-af1b-66afad9c634f'],
        summary: 'Goblin was removed from Roadside ambush.',
        state_excerpt: { combat: { id: combatId, status: 'planning' } },
      },
      meta: { requestId: 'request-remove-participant', campaignRevision: 45 },
    })),
    startCombat: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 43,
        event_ids: ['7495399a-29d0-4af2-a8d5-8992462f582f'],
        summary: 'Combat started.',
        state_excerpt: { combat: { id: combatId, status: 'active', round: 1 } },
      },
      meta: { requestId: 'request-combat-start', campaignRevision: 43 },
    })),
    resolveGameAction: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 44,
        event_ids: ['9e4e035b-543f-416e-97e9-7fef9e3c770b'],
        summary: 'Action resolved.',
        state_excerpt: { combat: { id: combatId, status: 'active', round: 1 } },
      },
      meta: { requestId: 'request-action', campaignRevision: 44 },
    })),
    advanceCombatTurn: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 45,
        event_ids: ['a99c9b66-c2ec-466a-af11-d49ecb9d27de'],
        summary: 'Turn advanced.',
        state_excerpt: { combat: { id: combatId, status: 'active', round: 1 } },
      },
      meta: { requestId: 'request-turn', campaignRevision: 45 },
    })),
    endCombat: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 46,
        event_ids: ['cd5d41d5-e836-4a53-a779-273d2d48de48'],
        summary: 'Combat ended.',
        state_excerpt: { combat: { id: combatId, status: 'completed', round: 1 } },
      },
      meta: { requestId: 'request-combat-end', campaignRevision: 46 },
    })),
    getRecentEvents: vi.fn(async () => ({
      data: [],
      meta: { requestId: 'request-5', campaignRevision: 42 },
    })),
    applyActorChanges: vi.fn(async () => ({
      data: {
        success: true,
        campaign_revision: 43,
        event_ids: ['4f5ccf68-7f6f-44ae-8aae-b59757fdf934'],
        summary: 'Alaric took 2 damage and now has 12 HP.',
        state_excerpt: { actor: { id: actorId, hp: { current: 12, max: 14 } } },
      },
      meta: { requestId: 'request-6', campaignRevision: 43 },
    })),
    appendCampaignEvent: vi.fn(),
  };
  server = createDragonbaneMcpServer(api);
  client = new Client({ name: 'dragonbane-helper-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await server.close();
});

describe('Dragonbane MCP server', () => {
  it('returns structured campaign data and advertises clear metadata', async () => {
    const result = await client.callTool({ name: 'list_campaigns', arguments: {} });
    expect(result.structuredContent).toEqual({
      success: true,
      data: { campaigns: [{ id: campaignId, name: 'The Misty Vale', revision: 4 }] },
    });

    const listed = await client.listTools();
    const stateTool = listed.tools.find(({ name }) => name === 'get_campaign_state');
    const writeTool = listed.tools.find(({ name }) => name === 'apply_actor_changes');
    expect(stateTool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(writeTool.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(stateTool.description).toMatch(/before continuing/i);
    expect(writeTool.description).toMatch(/latest campaign revision/i);
  });

  it('rejects an invalid UUID before calling the API', async () => {
    const result = await client.callTool({
      name: 'get_actor',
      arguments: { campaign_id: 'not-a-uuid', actor_id: actorId },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/invalid uuid/i);
    expect(api.getActor).not.toHaveBeenCalled();
  });

  it('returns unknown campaigns as structured tool errors', async () => {
    api.getCampaignState.mockRejectedValueOnce(new HelperApiClientError(
      404,
      { code: 'NOT_FOUND', message: 'Campaign not found.' },
      'request-404',
    ));
    const result = await client.callTool({
      name: 'get_campaign_state',
      arguments: { campaign_id: campaignId },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Campaign not found.' },
    });
  });

  it('returns revision conflicts to the model without retrying', async () => {
    api.applyActorChanges.mockRejectedValueOnce(new HelperApiClientError(
      409,
      {
        code: 'REVISION_CONFLICT',
        message: 'Campaign revision is 43, not 42.',
        details: { expectedRevision: 42, currentRevision: 43 },
      },
      'request-409',
    ));
    const result = await client.callTool({
      name: 'apply_actor_changes',
      arguments: {
        campaign_id: campaignId,
        actor_id: actorId,
        expected_revision: 42,
        idempotency_key: 'attack-turn-17',
        reason: 'Goblin sword hit',
        changes: [{ type: 'damage', amount: 2, damage_type: 'slashing' }],
      },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 43 },
    });
    expect(api.applyActorChanges).toHaveBeenCalledTimes(1);
  });

  it('returns the resulting campaign revision from a write', async () => {
    const result = await client.callTool({
      name: 'apply_actor_changes',
      arguments: {
        campaign_id: campaignId,
        actor_id: actorId,
        expected_revision: 42,
        idempotency_key: 'attack-turn-18',
        reason: 'Goblin sword hit',
        changes: [{ type: 'damage', amount: 2, damage_type: 'slashing' }],
      },
    });
    expect(result.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 43,
      event_ids: ['4f5ccf68-7f6f-44ae-8aae-b59757fdf934'],
    });
  });

  it('exposes the complete revision-safe combat workflow', async () => {
    const start = await client.callTool({
      name: 'start_combat',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        expected_revision: 42,
        idempotency_key: 'combat-start-1',
        initiatives: [{ actor_id: actorId, initiative: 4 }],
        reason: 'The ambush begins.',
      },
    });
    expect(start.structuredContent).toMatchObject({ success: true, campaign_revision: 43 });

    const action = await client.callTool({
      name: 'resolve_game_action',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        actor_id: actorId,
        expected_revision: 43,
        idempotency_key: 'combat-action-1',
        action: 'Defend',
        outcome: 'automatic',
        effects: [],
        consume_turn: true,
        reason: 'The actor takes a defensive action.',
      },
    });
    expect(action.structuredContent).toMatchObject({ success: true, campaign_revision: 44 });

    const advance = await client.callTool({
      name: 'advance_combat_turn',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        expected_revision: 44,
        idempotency_key: 'combat-advance-1',
        reason: 'The action is complete.',
      },
    });
    expect(advance.structuredContent).toMatchObject({ success: true, campaign_revision: 45 });

    const end = await client.callTool({
      name: 'end_combat',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        expected_revision: 45,
        idempotency_key: 'combat-end-1',
        outcome: 'victory',
        summary: 'The enemies surrendered.',
        reason: 'No enemies remain willing to fight.',
      },
    });
    expect(end.structuredContent).toMatchObject({ success: true, campaign_revision: 46 });

    const listed = await client.listTools();
    for (const name of ['start_combat', 'resolve_game_action', 'advance_combat_turn', 'end_combat']) {
      expect(listed.tools.find((tool) => tool.name === name)?.annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: true,
      });
    }
    expect(api.startCombat).toHaveBeenCalledTimes(1);
    expect(api.resolveGameAction).toHaveBeenCalledTimes(1);
    expect(api.advanceCombatTurn).toHaveBeenCalledTimes(1);
    expect(api.endCombat).toHaveBeenCalledTimes(1);
  });

  it('exposes encounter discovery and preparation before combat starts', async () => {
    const options = await client.callTool({
      name: 'get_encounter_setup_options',
      arguments: { campaign_id: campaignId, monster_search: 'goblin' },
    });
    expect(options.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 42,
      data: { monsters: [{ id: monsterId, name: 'Goblin' }] },
    });

    const created = await client.callTool({
      name: 'create_encounter',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 42,
        idempotency_key: 'encounter-create-1',
        name: 'Roadside ambush',
        reason: 'The GM requested a new combat.',
      },
    });
    expect(created.structuredContent).toMatchObject({ success: true, campaign_revision: 43 });

    const added = await client.callTool({
      name: 'add_encounter_participants',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        expected_revision: 43,
        idempotency_key: 'encounter-add-1',
        character_ids: [actorId],
        monsters: [{ monster_id: monsterId, count: 1, use_ferocity: true }],
        reason: 'Alaric encounters a goblin.',
      },
    });
    expect(added.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 44,
      state_excerpt: { added_actor_ids: [actorId, monsterActorId] },
    });

    const removed = await client.callTool({
      name: 'remove_encounter_participant',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        actor_id: monsterActorId,
        expected_revision: 44,
        idempotency_key: 'encounter-remove-1',
        reason: 'The GM changed the planned opposition.',
      },
    });
    expect(removed.structuredContent).toMatchObject({ success: true, campaign_revision: 45 });

    const listed = await client.listTools();
    for (const name of [
      'get_encounter_setup_options',
      'create_encounter',
      'add_encounter_participants',
      'remove_encounter_participant',
    ]) {
      expect(listed.tools.some((tool) => tool.name === name)).toBe(true);
    }
    expect(api.getEncounterSetupOptions).toHaveBeenCalledTimes(1);
    expect(api.createEncounter).toHaveBeenCalledTimes(1);
    expect(api.addEncounterParticipants).toHaveBeenCalledTimes(1);
    expect(api.removeEncounterParticipant).toHaveBeenCalledTimes(1);
  });

  it('exposes revision-safe game session lifecycle tools', async () => {
    const history = await client.callTool({
      name: 'get_session_history',
      arguments: { campaign_id: campaignId },
    });
    expect(history.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 42,
      data: { sessions: [] },
    });

    const started = await client.callTool({
      name: 'start_session',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 42,
        idempotency_key: 'session-start-1',
        title: 'Night of the Manticore',
        opening_scene: { location: 'Old bridge', situation: 'A roar in the fog' },
        reason: 'The GM begins play.',
      },
    });
    expect(started.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 43,
      state_excerpt: { session: { id: sessionId, status: 'active' } },
    });

    const completed = await client.callTool({
      name: 'complete_session',
      arguments: {
        campaign_id: campaignId,
        session_id: sessionId,
        expected_revision: 43,
        idempotency_key: 'session-complete-1',
        summary: 'The heroes drove off the manticore.',
        unresolved_threads: ['Who sent the beast?'],
        ending_scene: { location: 'Old bridge', situation: 'The fog clears' },
        reason: 'The GM ends play.',
      },
    });
    expect(completed.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 44,
      state_excerpt: { session: { id: sessionId, status: 'completed' } },
    });
    expect(api.getSessionHistory).toHaveBeenCalledTimes(1);
    expect(api.startSession).toHaveBeenCalledTimes(1);
    expect(api.completeSession).toHaveBeenCalledTimes(1);
  });

  it('exposes a revision-safe solo setup and oracle workflow', async () => {
    const options = await client.callTool({
      name: 'get_solo_options',
      arguments: { campaign_id: campaignId },
    });
    expect(options.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 42,
      data: { solo: { enabled: false }, characters: [{ id: actorId }] },
    });

    const enabled = await client.callTool({
      name: 'enable_solo_mode',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 42,
        idempotency_key: 'solo-enable-1',
        player_character_id: actorId,
        mode: 'custom',
        reason: 'The user starts a custom solo campaign.',
      },
    });
    expect(enabled.structuredContent).toMatchObject({ success: true, campaign_revision: 43 });

    const ability = await client.callTool({
      name: 'select_solo_heroic_ability',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 43,
        idempotency_key: 'solo-ability-1',
        ability_id: soloAbilityId,
        reason: 'The user confirmed Army of One as the additional solo ability.',
      },
    });
    expect(ability.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 44,
      state_excerpt: { playerCharacter: { heroicAbilities: ['Army of One'] } },
    });

    const fortune = await client.callTool({
      name: 'ask_fortune',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 44,
        idempotency_key: 'solo-fortune-1',
        question: 'Is the old gate guarded?',
        category: 'yes_no',
        tilt: 'even',
        reason: 'The answer is genuinely uncertain.',
      },
    });
    expect(fortune.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 45,
      state_excerpt: { roll: { expression: '1d6', dice: [4] } },
    });

    const inspiration = await client.callTool({
      name: 'draw_inspiration',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 45,
        idempotency_key: 'solo-inspire-1',
        columns: ['action', 'thing'],
        reason: 'The user asks what changes in the scene.',
      },
    });
    expect(inspiration.structuredContent).toMatchObject({ success: true, campaign_revision: 46 });

    const mission = await client.callTool({
      name: 'start_solo_mission',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 46,
        idempotency_key: 'solo-mission-1',
        title: 'The Sunken Bell',
        objective: 'Recover the bell before the tunnels flood.',
        waypoint_count: 3,
        opening_waypoint: {
          title: 'Flooded stair',
          description: 'Cold water flows down into the dark.',
        },
        threat: {
          description: 'The lower tunnels are filling with water.',
          recurring: false,
          trigger_effect: { type: 'flood', consequence: 'The return route closes.' },
        },
        reason: 'The player accepts the custom mission.',
      },
    });
    expect(mission.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 47,
      state_excerpt: { mission: { id: missionId }, threat: { id: threatId, counter: 1 } },
    });

    const threat = await client.callTool({
      name: 'advance_threat',
      arguments: {
        campaign_id: campaignId,
        threat_id: threatId,
        expected_revision: 47,
        idempotency_key: 'solo-threat-1',
        amount: 1,
        reason: 'The hero spends a stretch searching the entrance.',
      },
    });
    expect(threat.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 48,
      state_excerpt: { threat: { counter: 2 } },
    });

    const waypoint = await client.callTool({
      name: 'reveal_waypoint',
      arguments: {
        campaign_id: campaignId,
        waypoint_id: waypointId,
        expected_revision: 48,
        idempotency_key: 'solo-waypoint-1',
        title: 'Echoing gallery',
        description: 'Every footstep returns from a different tunnel.',
        reason: 'The hero leaves the entrance and enters the next area.',
      },
    });
    expect(waypoint.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 49,
      state_excerpt: { currentWaypoint: { id: waypointId, status: 'active' } },
    });

    const searched = await client.callTool({
      name: 'search_waypoint',
      arguments: {
        campaign_id: campaignId,
        waypoint_id: waypointId,
        expected_revision: 49,
        idempotency_key: 'solo-search-1',
        known_location: false,
        context: 'The alcoves behind the cracked mosaic.',
        reason: 'The hero performs a thorough search.',
      },
    });
    expect(searched.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 50,
      state_excerpt: { waypoint: { exploration: { searchCount: 1 } }, threat: { counter: 3 } },
    });

    const scavenged = await client.callTool({
      name: 'scavenge_waypoint',
      arguments: {
        campaign_id: campaignId,
        waypoint_id: waypointId,
        expected_revision: 50,
        idempotency_key: 'solo-scavenge-1',
        spend_stretch: false,
        context: 'The abandoned packs near the wall.',
        reason: 'The hero makes a quick scavenge.',
      },
    });
    expect(scavenged.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 51,
      state_excerpt: { waypoint: { exploration: { scavengeCount: 1 } }, threat: { counter: 3 } },
    });

    const rested = await client.callTool({
      name: 'take_solo_rest',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 51,
        idempotency_key: 'solo-rest-stretch-1',
        rest_type: 'stretch',
        use_healing: true,
        condition_to_clear: 'exhausted',
        safe_location: false,
        context: 'A sheltered alcove beside the gallery.',
        reason: 'The player explicitly chose a stretch rest.',
      },
    });
    expect(rested.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 52,
      state_excerpt: { restState: { stretchRestTaken: true }, threat: { counter: 4 } },
    });

    const completed = await client.callTool({
      name: 'complete_solo_mission',
      arguments: {
        campaign_id: campaignId,
        mission_id: missionId,
        expected_revision: 52,
        idempotency_key: 'solo-complete-1',
        outcome: 'abandoned',
        summary: 'The rising water forces the hero to turn back.',
        reason: 'The player abandons the mission.',
      },
    });
    expect(completed.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 53,
      state_excerpt: { currentMissionId: null },
    });
    const disabled = await client.callTool({
      name: 'disable_solo_mode',
      arguments: {
        campaign_id: campaignId,
        expected_revision: 53,
        idempotency_key: 'solo-disable-1',
        reason: 'The user confirmed that solo mode should be disabled.',
      },
    });
    expect(disabled.structuredContent).toMatchObject({
      success: true,
      campaign_revision: 54,
      state_excerpt: { solo: { enabled: false } },
    });
    expect(api.getSoloOptions).toHaveBeenCalledTimes(1);
    expect(api.enableSoloMode).toHaveBeenCalledTimes(1);
    expect(api.disableSoloMode).toHaveBeenCalledTimes(1);
    expect(api.selectSoloHeroicAbility).toHaveBeenCalledTimes(1);
    expect(api.askFortune).toHaveBeenCalledTimes(1);
    expect(api.drawInspiration).toHaveBeenCalledTimes(1);
    expect(api.startSoloMission).toHaveBeenCalledTimes(1);
    expect(api.advanceThreat).toHaveBeenCalledTimes(1);
    expect(api.revealWaypoint).toHaveBeenCalledTimes(1);
    expect(api.searchWaypoint).toHaveBeenCalledTimes(1);
    expect(api.scavengeWaypoint).toHaveBeenCalledTimes(1);
    expect(api.takeSoloRest).toHaveBeenCalledTimes(1);
    expect(api.completeSoloMission).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate combat effect targets before calling the API', async () => {
    const result = await client.callTool({
      name: 'resolve_game_action',
      arguments: {
        campaign_id: campaignId,
        combat_id: combatId,
        actor_id: actorId,
        expected_revision: 43,
        idempotency_key: 'combat-action-duplicate',
        action: 'Strike',
        outcome: 'success',
        effects: [
          { actor_id: actorId, changes: [{ type: 'damage', amount: 1 }] },
          { actor_id: actorId, changes: [{ type: 'damage', amount: 1 }] },
        ],
        reason: 'Invalid duplicate target test.',
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/combine changes/i);
    expect(api.resolveGameAction).not.toHaveBeenCalled();
  });
});
