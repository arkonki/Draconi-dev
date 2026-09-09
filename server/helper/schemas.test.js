// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { searchWaypointInputSchema } from './schemas.js';

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
});
