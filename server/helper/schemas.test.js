// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  generateSoloNpcInputSchema,
  resolveSoloNpcBehaviorInputSchema,
  searchWaypointInputSchema,
} from './schemas.js';

const baseSearch = {
  campaign_id: '5a135eb4-13a0-4d18-b000-8e050647c04f',
  waypoint_id: '7d2d87a5-83c8-43af-8c9f-738032664570',
  expected_revision: 3,
  idempotency_key: 'solo-search-schema-test',
  reason: 'Test the Solo Search contract.',
};

describe('Helper API schemas', () => {
  it('defaults Solo Search knowledge flags to false', () => {
    expect(searchWaypointInputSchema.parse(baseSearch)).toMatchObject({
      known_location: false,
      known_nature: false,
    });
  });

  it('requires a known location before the hidden item nature can be known', () => {
    expect(() => searchWaypointInputSchema.parse({
      ...baseSearch,
      known_location: false,
      known_nature: true,
    })).toThrow(/known nature requires/i);
    expect(searchWaypointInputSchema.parse({
      ...baseSearch,
      known_location: true,
      known_nature: true,
    })).toMatchObject({ known_location: true, known_nature: true });
  });

  it('accepts one or two supported roles for a simple Solo NPC', () => {
    expect(generateSoloNpcInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      expected_revision: 3,
      idempotency_key: 'solo-npc-schema-test',
      name: 'Ashfang Captain',
      template: 'boss',
      roles: ['melee', 'ranged'],
      reason: 'Create the foe established in the scene.',
    })).toMatchObject({ template: 'boss', roles: ['melee', 'ranged'] });
  });

  it('keeps the NPC behavior schema flat for MCP conversion', () => {
    expect(resolveSoloNpcBehaviorInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      npc_id: '7d2d87a5-83c8-43af-8c9f-738032664570',
      expected_revision: 4,
      idempotency_key: 'solo-npc-action-test',
      behavior: 'attack',
      role: 'sneaky',
      reason: 'Resolve the active NPC turn.',
    })).toMatchObject({
      behavior: 'attack', role: 'sneaky', oracle: 'fortune',
      inspiration_columns: ['action', 'thing'],
    });
  });
});
