// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertNarrowedChange,
  boundedQueryLimit,
  maxQueryRows,
  unchangedSince,
  executeDataQuery,
  applyOrders,
  bindingMatchesChange,
  buildAuthorizedSelectQuery,
  canRead,
  canWrite,
  changeInvalidatesAccessContext,
  restoreChangeEvent,
  assertCombatantChange,
  assertMessageContent,
  materializeAccessContext,
  normalizeItemListing,
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

describe('shared table access', () => {
  const access = (user, partyAccess, characterIds = []) => materializeAccessContext(user, {
    party_access: partyAccess, character_ids: characterIds, maps: [], encounters: [], sessions: [],
  });
  const gm = access({ id: 'gm', role: 'dm' }, [{ party_id: 'party', role: 'owner', owned: true }]);
  const player = access({ id: 'player', role: 'player' }, [{ party_id: 'party', role: 'player', owned: false }], ['hero']);
  const observer = access({ id: 'observer', role: 'player' }, [{ party_id: 'party', role: 'observer', owned: false }]);
  const outsider = access({ id: 'outsider', role: 'player' }, []);
  const hidden = { id: 'i1', party_id: 'party', visible: false, character_id: 'hero' };
  const shown = { ...hidden, visible: true };

  it('sends hidden tokens to the GM only, in reads and in live updates alike', () => {
    expect(canRead('table_items', hidden, gm)).toBe(true);
    expect(canRead('table_items', hidden, player)).toBe(false);
    expect(canRead('table_items', hidden, observer)).toBe(false);
    expect(canRead('table_items', hidden, outsider)).toBe(false);
  });

  it('shows revealed tokens to everyone in the campaign and nobody else', () => {
    expect(canRead('table_items', shown, player)).toBe(true);
    expect(canRead('table_items', shown, observer)).toBe(true);
    expect(canRead('table_items', shown, outsider)).toBe(false);
  });

  it('lets only the GM write tokens and the scene directly', () => {
    expect(canWrite('table_items', shown, gm)).toBe(true);
    expect(canWrite('table_items', shown, player)).toBe(false);
    expect(canWrite('party_table_state', { party_id: 'party' }, gm)).toBe(true);
    expect(canWrite('party_table_state', { party_id: 'party' }, player)).toBe(false);
    expect(canRead('party_table_state', { party_id: 'party' }, player)).toBe(true);
  });

  it('lets only the GM change a map, because its scale and grid size every token', () => {
    expect(canWrite('party_maps', { party_id: 'party' }, gm)).toBe(true);
    expect(canWrite('party_maps', { party_id: 'party' }, player)).toBe(false);
    expect(canWrite('party_maps', { party_id: 'party' }, observer)).toBe(false);
    expect(canRead('party_maps', { party_id: 'party' }, player)).toBe(true);
  });

  it('keeps a campaign\'s custom items inside that campaign', () => {
    const campaignItem = { id: 'item', name: 'Old Key', party_id: 'party' };
    const sharedItem = { id: 'shared', name: 'Torch', party_id: null };
    expect(canRead('game_items', campaignItem, player)).toBe(true);
    expect(canRead('game_items', campaignItem, outsider)).toBe(false);
    expect(canRead('game_items', sharedItem, outsider)).toBe(true);
    expect(canWrite('game_items', campaignItem, gm, true)).toBe(true);
    expect(canWrite('game_items', campaignItem, player, true)).toBe(false);
    expect(canWrite('game_items', sharedItem, gm, true)).toBe(false);

    const columns = new Map([['party_id', { data_type: 'uuid', udt_name: 'uuid' }]]);
    const outsiderQuery = buildAuthorizedSelectQuery('game_items', outsider, columns);
    expect(outsiderQuery.text).toContain('t."party_id" IS NULL');
  });

  it('keeps a campaign\'s own monsters and NPCs inside that campaign', () => {
    const campaignMonster = { id: 'wight', name: 'Bog Wight', party_id: 'party' };
    expect(canRead('monsters', campaignMonster, player)).toBe(true);
    expect(canRead('monsters', campaignMonster, outsider)).toBe(false);
    expect(canRead('monsters', { id: 'orc', party_id: null }, outsider)).toBe(true);
    expect(canWrite('monsters', campaignMonster, gm, true)).toBe(true);
    expect(canWrite('monsters', campaignMonster, player, true)).toBe(false);
    expect(canWrite('monsters', { id: 'orc', party_id: null }, gm)).toBe(false);
  });

  it('filters hidden tokens out of the SQL a player runs', () => {
    const columns = new Map([['party_id', { data_type: 'uuid', udt_name: 'uuid' }], ['visible', { data_type: 'boolean', udt_name: 'bool' }]]);
    const playerQuery = buildAuthorizedSelectQuery('table_items', player, columns);
    expect(playerQuery.text).toMatch(/"visible" = true/);
  });
});

describe('chat message limits', () => {
  it('accepts a normal message and refuses empty or oversized ones', () => {
    expect(() => assertMessageContent({ content: 'Hello' })).not.toThrow();
    expect(() => assertMessageContent({ content: '   ' })).toThrow('cannot be empty');
    expect(() => assertMessageContent({ content: 'x'.repeat(4001) })).toThrow('under 4000 characters');
    expect(() => assertMessageContent({ party_id: 'p' })).not.toThrow();
  });
});

describe('fight combatants', () => {
  const ctxFor = (role, characterIds = []) => materializeAccessContext({ id: role, role: 'player' }, {
    party_access: [{ party_id: 'party', role, owned: role === 'owner' }],
    character_ids: characterIds,
    encounters: [{ id: 'fight', party_id: 'party' }],
    maps: [], sessions: [],
  });
  const gm = ctxFor('owner');
  const player = ctxFor('player', ['hero']);
  const mine = { id: 'c1', encounter_id: 'fight', character_id: 'hero' };
  const monster = { id: 'c2', encounter_id: 'fight', character_id: null, monster_id: 'orc' };
  const ally = { id: 'c3', encounter_id: 'fight', character_id: 'friend' };

  it('lets a player change only their own character, and the GM anyone', () => {
    expect(canWrite('encounter_combatants', mine, player)).toBe(true);
    expect(canWrite('encounter_combatants', monster, player)).toBe(false);
    expect(canWrite('encounter_combatants', ally, player)).toBe(false);
    expect(canWrite('encounter_combatants', mine, player, true)).toBe(false);
    expect(canWrite('encounter_combatants', monster, gm)).toBe(true);
    expect(canWrite('encounter_combatants', monster, gm, true)).toBe(true);
  });

  it('keeps a player to turn, initiative, HP, WP and statuses, and removing to the GM', () => {
    expect(() => assertCombatantChange([mine], player, 'update', ['current_hp', 'has_acted', 'status_effects'])).not.toThrow();
    expect(() => assertCombatantChange([mine], player, 'update', ['max_hp'])).toThrow('Only the GM can change max_hp');
    expect(() => assertCombatantChange([mine], player, 'delete')).toThrow('Only the GM can remove');
    expect(() => assertCombatantChange([monster], gm, 'update', ['max_hp', 'display_name'])).not.toThrow();
    expect(() => assertCombatantChange([monster], gm, 'delete')).not.toThrow();
  });
});

describe('item listings', () => {
  it('moves a count out of the name and into units per purchase', () => {
    expect(normalizeItemListing({ name: 'Bandages (10)', quantity: 1, weight: 0.1 })).toEqual({ name: 'Bandages', quantity: 10, weight: 0.1 });
    expect(normalizeItemListing({ name: 'Rope (10 m)', quantity: 1 })).toEqual({ name: 'Rope (10 m)', quantity: 1 });
    expect(normalizeItemListing({ weight: 2 })).toEqual({ weight: 2 });
  });
});

describe('changes must name their rows', () => {
  it('refuses an update or delete that carries no filter', async () => {
    for (const filters of [undefined, [], [{ operator: 'match', value: {} }], [{ operator: 'or', value: '' }], [{ operator: 'eq' }]]) {
      expect(() => assertNarrowedChange(filters)).toThrow('needs at least one filter');
    }
    // Refused before the database is touched.
    await expect(executeDataQuery({ id: 'user' }, { table: 'notes', action: 'delete' }))
      .rejects.toMatchObject({ status: 400, code: 'FILTER_REQUIRED' });
    await expect(executeDataQuery({ id: 'user' }, { table: 'characters', action: 'update', payload: { name: 'x' }, filters: [] }))
      .rejects.toMatchObject({ status: 400, code: 'FILTER_REQUIRED' });
  });

  it('accepts any filter that narrows the rows', () => {
    expect(() => assertNarrowedChange([{ operator: 'eq', column: 'id', value: '1' }])).not.toThrow();
    expect(() => assertNarrowedChange([{ operator: 'in', column: 'id', value: ['1'] }])).not.toThrow();
    expect(() => assertNarrowedChange([{ operator: 'match', value: { party_id: '1' } }])).not.toThrow();
    expect(() => assertNarrowedChange([{ operator: 'or', value: 'id.eq.1,id.eq.2' }])).not.toThrow();
  });
});

describe('compact change events', () => {
  it('rebuilds the row before an update from the row after it and the changed columns', () => {
    const event = {
      event_type: 'UPDATE',
      new_record: { id: 'c1', name: 'Hero', current_hp: 7, conditions: null },
      old_record: { current_hp: 12, conditions: { dazed: true } },
    };
    expect(restoreChangeEvent(event).old_record).toEqual({ id: 'c1', name: 'Hero', current_hp: 12, conditions: { dazed: true } });
    // The stored event is left as it was.
    expect(event.old_record).toEqual({ current_hp: 12, conditions: { dazed: true } });
  });

  it('keeps a full old row from before the log was compacted, and leaves inserts and deletes alone', () => {
    const full = { event_type: 'UPDATE', new_record: { id: 'c1', hp: 7 }, old_record: { id: 'c1', hp: 12 } };
    expect(restoreChangeEvent(full).old_record).toEqual({ id: 'c1', hp: 12 });
    const inserted = { event_type: 'INSERT', new_record: { id: 'c1' }, old_record: null };
    expect(restoreChangeEvent(inserted)).toBe(inserted);
    const deleted = { event_type: 'DELETE', new_record: null, old_record: { id: 'c1', title: 'Gone' } };
    expect(restoreChangeEvent(deleted)).toBe(deleted);
  });
});

describe('access cache invalidation', () => {
  it('keeps the cache through updates that cannot change access', () => {
    expect(changeInvalidatesAccessContext('characters', false)).toBe(false);
    expect(changeInvalidatesAccessContext('encounters', false)).toBe(false);
  });

  it('drops the cache for inserts, deletes, ownership changes and anything unknown', () => {
    expect(changeInvalidatesAccessContext('characters', true)).toBe(true);
    expect(changeInvalidatesAccessContext('characters')).toBe(true);
    expect(changeInvalidatesAccessContext('campaign_memberships', undefined)).toBe(true);
  });

  it('ignores tables that never decide access', () => {
    expect(changeInvalidatesAccessContext('messages', true)).toBe(false);
  });
});

describe('read ceiling', () => {
  it('uses the ceiling when no limit is asked for and never goes above it', () => {
    expect(boundedQueryLimit(undefined, 5000)).toBe(5000);
    expect(boundedQueryLimit(null, 5000)).toBe(5000);
    expect(boundedQueryLimit('many', 5000)).toBe(5000);
    expect(boundedQueryLimit(1_000_000, 5000)).toBe(5000);
  });

  it('keeps a smaller limit that was asked for', () => {
    expect(boundedQueryLimit(25, 5000)).toBe(25);
    expect(boundedQueryLimit(0, 5000)).toBe(0);
    expect(boundedQueryLimit(-3, 5000)).toBe(0);
  });

  it('reads the ceiling from the environment and rejects nonsense', () => {
    expect(maxQueryRows({})).toBe(5000);
    expect(maxQueryRows({ DATA_QUERY_MAX_ROWS: '200' })).toBe(200);
    expect(() => maxQueryRows({ DATA_QUERY_MAX_ROWS: '0' })).toThrow('DATA_QUERY_MAX_ROWS');
  });
});

describe('saving only what nobody else changed', () => {
  it('matches the time the browser last saw, to the millisecond', () => {
    const stored = new Date('2026-03-01T10:00:00.123Z');
    expect(unchangedSince(stored, '2026-03-01T10:00:00.123Z')).toBe(true);
    expect(unchangedSince(stored, '2026-03-01T12:00:00.123+02:00')).toBe(true);
    expect(unchangedSince(stored, '2026-03-01T10:00:00.124Z')).toBe(false);
    expect(unchangedSince(stored, 'yesterday')).toBe(false);
  });
});
