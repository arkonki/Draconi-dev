// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelperApiClientError } from './client.js';
import { createDragonbaneMcpServer } from './server.js';

const campaignId = 'b2f6308c-20c1-4701-bf9d-cb0949730d9c';
const actorId = '03d353da-eb85-407c-a405-3210430b21fc';

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
    getActor: vi.fn(async () => ({
      data: { id: actorId, name: 'Alaric', hp: { current: 14, max: 14 }, revision: 42 },
      meta: { requestId: 'request-3', campaignRevision: 42 },
    })),
    getCombatState: vi.fn(async () => ({
      data: null,
      meta: { requestId: 'request-4', campaignRevision: 42 },
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
});
