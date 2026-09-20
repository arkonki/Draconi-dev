// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyOrders, normalizeNumericOutput } from './data.js';

describe('local data ordering', () => {
  const rows = [
    { id: 'april', created_at: new Date('2026-04-24T17:04:58.318Z') },
    { id: 'september', created_at: new Date('2026-09-17T16:03:32.396Z') },
    { id: 'january', created_at: new Date('2026-01-10T21:22:18.102Z') },
  ];

  it('sorts PostgreSQL timestamp values chronologically', () => {
    expect(applyOrders(rows, [{ column: 'created_at', ascending: true }]).map((row) => row.id))
      .toEqual(['january', 'april', 'september']);
  });

  it('sorts PostgreSQL timestamp values newest first', () => {
    expect(applyOrders(rows, [{ column: 'created_at', ascending: false }]).map((row) => row.id))
      .toEqual(['september', 'april', 'january']);
  });

  it('uses later order clauses to break timestamp ties', () => {
    const tiedRows = [
      { id: 'a', created_at: new Date('2026-09-17T16:03:32.396Z') },
      { id: 'b', created_at: new Date('2026-09-17T16:03:32.396Z') },
    ];

    expect(applyOrders(tiedRows, [
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]).map((row) => row.id)).toEqual(['b', 'a']);
  });
});

describe('PostgreSQL numeric output compatibility', () => {
  it('returns Atlas pin coordinates as JavaScript numbers', () => {
    expect(normalizeNumericOutput('party_map_pins', { id: 'pin-1', x: '742.5', y: '318.25' }))
      .toEqual({ id: 'pin-1', x: 742.5, y: 318.25 });
  });

  it('normalizes map configuration and drawing thickness values', () => {
    expect(normalizeNumericOutput('party_maps', {
      grid_opacity: '0.35',
      grid_offset_x: '12.5',
      grid_offset_y: '8',
      grid_rotation: '15',
    })).toEqual({
      grid_opacity: 0.35,
      grid_offset_x: 12.5,
      grid_offset_y: 8,
      grid_rotation: 15,
    });
    expect(normalizeNumericOutput('party_map_drawings', { thickness: '3.5' }))
      .toEqual({ thickness: 3.5 });
  });
});
