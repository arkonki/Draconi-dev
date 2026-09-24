// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyOrders,
  bindingMatchesChange,
  buildAuthorizedSelectQuery,
  materializeAccessContext,
  normalizeNumericOutput,
} from './data.js';

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

describe('authorization context materialization', () => {
  it('builds all access lookup sets and maps from one aggregate database row', () => {
    const context = materializeAccessContext({ id: 'user-1', role: 'player' }, {
      party_access: [
        { party_id: 'party-owned', role: 'owner', owned: true },
        { party_id: 'party-player', role: 'player', owned: false },
      ],
      character_ids: ['character-1'],
      maps: [{ id: 'map-1', party_id: 'party-player' }],
      encounters: [{ id: 'encounter-1', party_id: 'party-owned' }],
      sessions: [{ id: 'session-1', party_id: 'party-owned' }],
    });

    expect(context.admin).toBe(false);
    expect([...context.ownedPartyIds]).toEqual(['party-owned']);
    expect([...context.partyIds]).toEqual(['party-owned', 'party-player']);
    expect(context.partyRoles.get('party-owned')).toBe('owner');
    expect(context.partyRoles.get('party-player')).toBe('player');
    expect(context.characterIds.has('character-1')).toBe(true);
    expect(context.mapParty.get('map-1')).toBe('party-player');
    expect(context.encounterParty.get('encounter-1')).toBe('party-owned');
    expect(context.sessionParty.get('session-1')).toBe('party-owned');
  });
});

describe('authorized PostgreSQL query construction', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const partyId = '22222222-2222-4222-8222-222222222222';
  const context = {
    user: { id: userId, role: 'player' },
    admin: false,
    ownedPartyIds: new Set(),
    partyIds: new Set([partyId]),
    partyRoles: new Map([[partyId, 'player']]),
    characterIds: new Set(),
    mapParty: new Map(),
    encounterParty: new Map(),
    sessionParty: new Map(),
  };

  const columns = new Map([
    ['id', { column_name: 'id', data_type: 'uuid', udt_name: 'uuid' }],
    ['party_id', { column_name: 'party_id', data_type: 'uuid', udt_name: 'uuid' }],
    ['name', { column_name: 'name', data_type: 'text', udt_name: 'text' }],
    ['created_at', { column_name: 'created_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz' }],
  ]);

  it('combines authorization, filters, ordering, and limit in one bound query', () => {
    const query = buildAuthorizedSelectQuery('parties', context, columns, {
      filters: [{ operator: 'ilike', column: 'name', value: '%ridge%' }],
      orders: [{ column: 'created_at', ascending: false }],
      limit: 20,
    });

    expect(query.text).toContain('t."id" = ANY($1::uuid[])');
    expect(query.text).toContain('t."name"::text ILIKE $2');
    expect(query.text).toContain('ORDER BY t."created_at" DESC NULLS LAST');
    expect(query.text).toContain('LIMIT $3::integer');
    expect(query.values).toEqual([[partyId], '%ridge%', 20]);
  });

  it('keeps hostile filter values out of SQL text', () => {
    const hostileValue = "x%' OR TRUE; DROP TABLE parties; --";
    const query = buildAuthorizedSelectQuery('parties', context, columns, {
      filters: [{ operator: 'ilike', column: 'name', value: hostileValue }],
    });

    expect(query.text).not.toContain(hostileValue);
    expect(query.values).toContain(hostileValue);
  });

  it('rejects unknown columns instead of interpolating identifiers', () => {
    expect(() => buildAuthorizedSelectQuery('parties', context, columns, {
      filters: [{ operator: 'eq', column: 'name" OR TRUE --', value: 'anything' }],
    })).toThrowError('Unknown column');
  });
});

describe('realtime event bindings', () => {
  const event = {
    table_name: 'messages',
    event_type: 'INSERT',
  };
  const row = { party_id: 'party-1' };

  it('matches table, event type, and equality filters before delivery', () => {
    expect(bindingMatchesChange(
      { table: 'messages', event: 'INSERT', filter: 'party_id=eq.party-1' },
      event,
      row,
    )).toBe(true);
    expect(bindingMatchesChange(
      { table: 'messages', event: 'UPDATE', filter: 'party_id=eq.party-1' },
      event,
      row,
    )).toBe(false);
    expect(bindingMatchesChange(
      { table: 'messages', event: '*', filter: 'party_id=eq.party-2' },
      event,
      row,
    )).toBe(false);
  });
});
