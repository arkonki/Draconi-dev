import { pool, withTransaction } from './db.js';
import { canCampaignRoleWrite, isCampaignGmRole } from './campaignRoles.js';
import { HttpError } from './http.js';

const TABLES = new Set([
  'users', 'magic_schools', 'heroic_abilities', 'game_heroic_abilities', 'kin',
  'professions', 'game_skills', 'game_spells', 'game_items', 'monsters', 'bio_data',
  'characters', 'parties', 'party_members', 'campaign_memberships', 'notes', 'messages', 'party_inventory',
  'party_inventory_log', 'party_tasks', 'time_trackers', 'random_tables', 'story_ideas',
  'compendium', 'compendium_templates', 'encounters', 'encounter_combatants',
  'party_maps', 'party_map_pins', 'party_map_drawings', 'party_display_sessions',
  'party_display_slots', 'push_subscriptions', 'user_notification_settings',
  'campaign_events',
]);

const REFERENCE_TABLES = new Set([
  'magic_schools', 'heroic_abilities', 'game_heroic_abilities', 'kin', 'professions',
  'game_skills', 'game_spells', 'game_items', 'bio_data', 'monsters',
]);

const PARTY_SCOPED = new Set([
  'messages', 'party_inventory', 'party_inventory_log', 'party_tasks', 'time_trackers',
  'random_tables', 'story_ideas', 'encounters', 'party_maps',
]);

const ACCESS_CONTEXT_TABLES = new Set([
  'parties', 'party_members', 'campaign_memberships', 'characters', 'party_maps',
  'encounters', 'party_display_sessions',
]);

const AUTH_CONTEXT_CACHE_MS = Number(process.env.AUTH_CONTEXT_CACHE_MS || 5_000);
if (!Number.isInteger(AUTH_CONTEXT_CACHE_MS) || AUTH_CONTEXT_CACHE_MS < 0 || AUTH_CONTEXT_CACHE_MS > 60_000) {
  throw new Error('AUTH_CONTEXT_CACHE_MS must be an integer between 0 and 60000');
}

const accessContextCache = new Map();
const accessContextMetrics = {
  hits: 0,
  misses: 0,
  coalesced: 0,
  loads: 0,
  invalidations: 0,
};

const columnCache = new Map();

export function clearDataSchemaCache() {
  columnCache.clear();
}

function assertTable(table) {
  if (!TABLES.has(table)) throw new HttpError(400, `Unknown table: ${table}`);
}

async function columnsFor(table, client = pool) {
  if (columnCache.has(table)) return columnCache.get(table);
  const { rows } = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const map = new Map(rows.map((row) => [row.column_name, row]));
  if (map.size === 0) throw new HttpError(400, `Table is not initialized: ${table}`);
  columnCache.set(table, map);
  return map;
}

function aliasesFor(table, value) {
  const result = { ...value };
  if (table === 'users' && 'last_login' in result) {
    result.last_login_at = result.last_login;
    delete result.last_login;
  }
  if (table === 'monsters' && 'effectsSummary' in result) {
    result.effects_summary = result.effectsSummary;
    delete result.effectsSummary;
  }
  return result;
}

const NUMERIC_OUTPUT_FIELDS = new Map([
  ['party_maps', ['grid_opacity', 'grid_offset_x', 'grid_offset_y', 'grid_rotation']],
  ['party_map_pins', ['x', 'y']],
  ['party_map_drawings', ['thickness']],
]);

export function normalizeNumericOutput(table, row) {
  if (!row) return row;
  const fields = NUMERIC_OUTPUT_FIELDS.get(table);
  if (!fields) return row;

  const normalized = { ...row };
  for (const field of fields) {
    if (normalized[field] === null || normalized[field] === undefined) continue;
    const value = Number(normalized[field]);
    if (Number.isFinite(value)) normalized[field] = value;
  }
  return normalized;
}

function outwardAliases(table, row) {
  if (!row) return row;
  let aliased = row;
  if (table === 'monsters') aliased = { ...row, effectsSummary: row.effects_summary };
  if (table === 'users') aliased = { ...row, last_login: row.last_login_at };
  return normalizeNumericOutput(table, aliased);
}

function encodeValue(value, column) {
  if (value === undefined) return null;
  if (column.data_type === 'json' || column.data_type === 'jsonb') return JSON.stringify(value);
  return value;
}

async function preparePayload(table, input, client = pool) {
  const columns = await columnsFor(table, client);
  const payload = aliasesFor(table, input || {});
  const prepared = {};
  for (const [key, value] of Object.entries(payload)) {
    const column = columns.get(key);
    if (!column || key === 'id' && (value === undefined || value === null || value === '')) continue;
    prepared[key] = encodeValue(value, column);
  }
  return prepared;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function contextBase(row) {
  const partyAccessRows = arrayValue(row.party_access);
  return {
    ownedPartyIds: new Set(partyAccessRows.filter((party) => party.owned).map((party) => party.party_id)),
    partyIds: new Set(partyAccessRows.map((party) => party.party_id)),
    partyRoles: new Map(partyAccessRows.map((party) => [party.party_id, party.role])),
    characterIds: new Set(arrayValue(row.character_ids)),
    mapParty: new Map(arrayValue(row.maps).map((map) => [map.id, map.party_id])),
    encounterParty: new Map(arrayValue(row.encounters).map((encounter) => [encounter.id, encounter.party_id])),
    sessionParty: new Map(arrayValue(row.sessions).map((session) => [session.id, session.party_id])),
  };
}

export function materializeAccessContext(user, row) {
  return {
    user,
    admin: user.role === 'admin',
    ...contextBase(row),
  };
}

async function loadAccessContext(userId, client) {
  accessContextMetrics.loads += 1;
  const { rows } = await client.query(
    `WITH party_access AS MATERIALIZED (
       SELECT p.id AS party_id, 'owner'::text AS role, true AS owned
       FROM parties p
       WHERE p.created_by = $1
       UNION ALL
       SELECT cm.party_id, cm.role, false AS owned
       FROM campaign_memberships cm
       JOIN parties p ON p.id = cm.party_id
       WHERE cm.user_id = $1 AND p.created_by <> $1
     )
     SELECT
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'party_id', party_id,
           'role', role,
           'owned', owned
         ) ORDER BY party_id)
         FROM party_access
       ), '[]'::jsonb) AS party_access,
       COALESCE((
         SELECT array_agg(c.id ORDER BY c.id) FROM characters c WHERE c.user_id = $1
       ), '{}'::uuid[]) AS character_ids,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object('id', m.id, 'party_id', m.party_id) ORDER BY m.id)
         FROM party_maps m JOIN party_access pa ON pa.party_id = m.party_id
       ), '[]'::jsonb) AS maps,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object('id', e.id, 'party_id', e.party_id) ORDER BY e.id)
         FROM encounters e JOIN party_access pa ON pa.party_id = e.party_id
       ), '[]'::jsonb) AS encounters,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object('id', s.id, 'party_id', s.party_id) ORDER BY s.id)
         FROM party_display_sessions s JOIN party_access pa ON pa.party_id = s.party_id
       ), '[]'::jsonb) AS sessions`,
    [userId],
  );
  return contextBase(rows[0] || {});
}

async function accessContext(user, client = pool) {
  if (client !== pool || AUTH_CONTEXT_CACHE_MS === 0) {
    return { user, admin: user.role === 'admin', ...await loadAccessContext(user.id, client) };
  }

  const now = Date.now();
  const cached = accessContextCache.get(user.id);
  if (cached?.value && cached.expiresAt > now) {
    accessContextMetrics.hits += 1;
    return { user, admin: user.role === 'admin', ...cached.value };
  }
  if (cached?.promise) {
    accessContextMetrics.hits += 1;
    accessContextMetrics.coalesced += 1;
    return { user, admin: user.role === 'admin', ...await cached.promise };
  }

  accessContextMetrics.misses += 1;
  const promise = loadAccessContext(user.id, pool);
  accessContextCache.set(user.id, { promise, expiresAt: 0 });
  try {
    const value = await promise;
    accessContextCache.set(user.id, { value, expiresAt: Date.now() + AUTH_CONTEXT_CACHE_MS });
    return { user, admin: user.role === 'admin', ...value };
  } catch (error) {
    if (accessContextCache.get(user.id)?.promise === promise) accessContextCache.delete(user.id);
    throw error;
  }
}

export function invalidateAccessContextCache(userIds = null) {
  accessContextMetrics.invalidations += 1;
  if (!userIds) {
    accessContextCache.clear();
    return;
  }
  for (const userId of userIds) accessContextCache.delete(userId);
}

export function authorizationCacheSnapshot() {
  const now = Date.now();
  let activeEntries = 0;
  let pendingEntries = 0;
  for (const entry of accessContextCache.values()) {
    if (entry.promise) pendingEntries += 1;
    if (entry.value && entry.expiresAt > now) activeEntries += 1;
  }
  return {
    ttlMs: AUTH_CONTEXT_CACHE_MS,
    entries: accessContextCache.size,
    activeEntries,
    pendingEntries,
    ...accessContextMetrics,
  };
}

function partyAccess(ctx, partyId) {
  return Boolean(partyId && ctx.partyIds.has(partyId));
}

function partyRole(ctx, partyId) {
  if (ctx.ownedPartyIds.has(partyId)) return 'owner';
  return ctx.partyRoles.get(partyId) || null;
}

function partyGmAccess(ctx, partyId) {
  return ctx.admin || isCampaignGmRole(partyRole(ctx, partyId));
}

function partyWriteAccess(ctx, partyId) {
  return ctx.admin || canCampaignRoleWrite(partyRole(ctx, partyId));
}

function canRead(table, row, ctx) {
  if (ctx.admin || REFERENCE_TABLES.has(table) || table === 'users') return true;
  if (table === 'campaign_events') {
    return partyAccess(ctx, row.campaign_id)
      && (
        partyGmAccess(ctx, row.campaign_id)
        || ['public', 'players'].includes(row.visibility)
        || (row.visibility === 'assigned' && row.payload?.assignedUserId === ctx.user.id)
      );
  }
  if (table === 'characters') return row.user_id === ctx.user.id || partyAccess(ctx, row.party_id);
  if (table === 'parties') return partyAccess(ctx, row.id);
  if (table === 'party_members') {
    return row.user_id === ctx.user.id || ctx.characterIds.has(row.character_id) || partyAccess(ctx, row.party_id);
  }
  if (table === 'campaign_memberships') return partyAccess(ctx, row.party_id);
  if (PARTY_SCOPED.has(table)) return partyAccess(ctx, row.party_id);
  if (table === 'notes') return row.user_id === ctx.user.id || partyAccess(ctx, row.party_id);
  if (table === 'compendium') return row.is_public || row.created_by === ctx.user.id || partyAccess(ctx, row.party_id);
  if (table === 'compendium_templates') return row.is_public || row.created_by === ctx.user.id;
  if (table === 'encounter_combatants') return partyAccess(ctx, ctx.encounterParty.get(row.encounter_id));
  if (table === 'party_map_pins' || table === 'party_map_drawings') return partyAccess(ctx, ctx.mapParty.get(row.map_id));
  if (table === 'party_display_sessions') return partyAccess(ctx, row.party_id);
  if (table === 'party_display_slots') return partyAccess(ctx, ctx.sessionParty.get(row.session_id));
  if (table === 'push_subscriptions' || table === 'user_notification_settings') return row.user_id === ctx.user.id;
  return false;
}

function canWrite(table, row, ctx, inserting = false) {
  if (ctx.admin) return true;
  if (REFERENCE_TABLES.has(table) || table === 'users') return table === 'users' && row.id === ctx.user.id;
  if (table === 'characters') {
    if (inserting) return row.user_id === ctx.user.id;
    const canEditOwnCharacter = row.user_id === ctx.user.id
      && (!row.party_id || partyWriteAccess(ctx, row.party_id));
    return canEditOwnCharacter || partyGmAccess(ctx, row.party_id);
  }
  if (table === 'parties') return row.created_by === ctx.user.id;
  if (table === 'campaign_memberships') return ctx.admin || partyRole(ctx, row.party_id) === 'owner';
  if (table === 'party_members') {
    if (!partyWriteAccess(ctx, row.party_id)) return false;
    if (inserting) return partyGmAccess(ctx, row.party_id) || ctx.characterIds.has(row.character_id);
    return partyGmAccess(ctx, row.party_id) || ctx.characterIds.has(row.character_id)
      || row.user_id === ctx.user.id;
  }
  if (table === 'messages') {
    return partyWriteAccess(ctx, row.party_id)
      && (row.user_id === ctx.user.id || partyGmAccess(ctx, row.party_id));
  }
  if (PARTY_SCOPED.has(table)) return partyWriteAccess(ctx, row.party_id);
  if (table === 'notes') return partyWriteAccess(ctx, row.party_id) && (row.user_id === ctx.user.id || partyGmAccess(ctx, row.party_id));
  if (table === 'compendium') {
    return row.created_by === ctx.user.id && (!row.party_id || partyWriteAccess(ctx, row.party_id));
  }
  if (table === 'compendium_templates') return row.created_by === ctx.user.id;
  if (table === 'encounter_combatants') return partyWriteAccess(ctx, ctx.encounterParty.get(row.encounter_id));
  if (table === 'party_map_pins' || table === 'party_map_drawings') return partyWriteAccess(ctx, ctx.mapParty.get(row.map_id));
  if (table === 'party_display_sessions') return partyGmAccess(ctx, row.party_id);
  if (table === 'party_display_slots') return partyGmAccess(ctx, ctx.sessionParty.get(row.session_id));
  if (table === 'push_subscriptions' || table === 'user_notification_settings') return row.user_id === ctx.user.id;
  return false;
}

function getValues(value, path) {
  if (path.length === 0) return Array.isArray(value) ? value.flatMap((entry) => getValues(entry, [])) : [value];
  if (Array.isArray(value)) return value.flatMap((entry) => getValues(entry, path));
  if (value === null || value === undefined) return [undefined];
  return getValues(value[path[0]], path.slice(1));
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(String);
  return String(value || '').replace(/^\(/, '').replace(/\)$/, '').split(',').map((entry) => entry.trim());
}

function scalarMatches(actual, operator, expected) {
  if (operator === 'eq') return String(actual) === String(expected);
  if (operator === 'gt') return actual !== null && actual !== undefined && actual > expected;
  if (operator === 'is') return expected === null ? actual === null || actual === undefined : actual === expected;
  if (operator === 'in') return parseList(expected).includes(String(actual));
  if (operator === 'ilike') {
    const pattern = String(expected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('%', '.*');
    return new RegExp(`^${pattern}$`, 'i').test(String(actual ?? ''));
  }
  return false;
}

function matchesFilter(row, filter) {
  if (filter.operator === 'match') {
    return Object.entries(filter.value || {}).every(([key, value]) =>
      getValues(row, key.split('.')).some((actual) => scalarMatches(actual, 'eq', value)));
  }
  if (filter.operator === 'or') {
    return String(filter.value || '').split(',').some((clause) => {
      const [column, operator, ...rest] = clause.split('.');
      let expected = rest.join('.');
      if (operator === 'is' && expected === 'null') expected = null;
      return getValues(row, column.split('.')).some((actual) => scalarMatches(actual, operator, expected));
    });
  }
  const values = getValues(row, String(filter.column).split('.'));
  const matched = values.some((actual) => scalarMatches(actual, filter.operator, filter.value));
  return filter.operator === 'not' ? !values.some((actual) => scalarMatches(actual, filter.notOperator, filter.value)) : matched;
}

function applyFilters(rows, filters = []) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

function compareOrderValues(left, right) {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

export function applyOrders(rows, orders = []) {
  if (!orders.length) return rows;
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const a = getValues(left, order.column.split('.'))[0];
      const b = getValues(right, order.column.split('.'))[0];
      if (a === b) continue;
      if (a === null || a === undefined) return order.nullsLast === false ? -1 : 1;
      if (b === null || b === undefined) return order.nullsLast === false ? 1 : -1;
      const compared = compareOrderValues(a, b);
      if (compared === 0) continue;
      return order.ascending === false ? -compared : compared;
    }
    return 0;
  });
}

async function enrichRows(table, rows, client = pool, ctx = null) {
  if (rows.length === 0) return rows;
  if (table === 'characters') {
    const schools = await client.query('SELECT * FROM magic_schools');
    const members = await client.query('SELECT party_id, character_id FROM party_members');
    const schoolMap = new Map(schools.rows.map((row) => [row.id, row]));
    return rows.map((row) => ({
      ...row,
      magic_school: schoolMap.get(row.magic_school) || null,
      party_members: members.rows.filter((member) => member.character_id === row.id).map(({ party_id }) => ({ party_id })),
    }));
  }
  if (table === 'parties') {
    const [memberResult, membershipResult] = await Promise.all([
      client.query(
      `SELECT pm.*, row_to_json(c) AS characters
       FROM party_members pm JOIN characters c ON c.id = pm.character_id`,
      ),
      client.query(
        `SELECT cm.*, jsonb_build_object(
           'id', u.id,
           'username', u.username,
           'first_name', u.first_name,
           'last_name', u.last_name,
           'avatar_url', u.avatar_url
         ) AS users
         FROM campaign_memberships cm
         JOIN users u ON u.id = cm.user_id`,
      ),
    ]);
    return rows.map((row) => ({
      ...row,
      campaign_role: ctx?.admin && !ctx.partyRoles.has(row.id) ? 'gm' : partyRole(ctx, row.id),
      members: memberResult.rows.filter((member) => member.party_id === row.id),
      campaign_memberships: membershipResult.rows.filter((member) => member.party_id === row.id),
    }));
  }
  if (table === 'party_members') {
    const parties = await client.query('SELECT * FROM parties');
    const characters = await client.query('SELECT * FROM characters');
    const partyMap = new Map(parties.rows.map((row) => [row.id, row]));
    const characterMap = new Map(characters.rows.map((row) => [row.id, row]));
    return rows.map((row) => ({
      ...row,
      parties: partyMap.get(row.party_id) || null,
      characters: characterMap.get(row.character_id) || null,
      character: characterMap.get(row.character_id) || null,
    }));
  }
  if (table === 'campaign_memberships') {
    const users = await client.query(
      'SELECT id, username, first_name, last_name, avatar_url FROM users',
    );
    const userMap = new Map(users.rows.map((row) => [row.id, row]));
    return rows.map((row) => ({ ...row, users: userMap.get(row.user_id) || null }));
  }
  if (table === 'notes') {
    const characters = await client.query('SELECT id, name FROM characters');
    const parties = await client.query('SELECT id, name FROM parties');
    const characterMap = new Map(characters.rows.map((row) => [row.id, row]));
    const partyMap = new Map(parties.rows.map((row) => [row.id, row]));
    return rows.map((row) => ({ ...row, character: characterMap.get(row.character_id) || null, party: partyMap.get(row.party_id) || null }));
  }
  if (table === 'game_spells') {
    const { rows: schools } = await client.query('SELECT * FROM magic_schools');
    const map = new Map(schools.map((row) => [row.id, row]));
    return rows.map((row) => ({ ...row, magic_schools: map.get(row.school_id) || null }));
  }
  if (table === 'encounter_combatants') {
    const { rows: characters } = await client.query('SELECT id, current_hp, max_hp, current_wp, max_wp, heroic_ability FROM characters');
    const map = new Map(characters.map((row) => [row.id, row]));
    return rows.map((row) => ({ ...row, character: map.get(row.character_id) || null }));
  }
  return rows;
}

async function allAuthorizedRows(table, ctx, client = pool) {
  const { rows } = await client.query(`SELECT * FROM "${table}"`);
  const visible = rows.filter((row) => canRead(table, row, ctx)).map((row) => outwardAliases(table, row));
  return enrichRows(table, visible, client, ctx);
}

function applyOwnership(table, payload, user) {
  const row = { ...payload };
  if (table === 'characters') row.user_id = user.id;
  if (table === 'parties') row.created_by = user.id;
  if (table === 'campaign_memberships') row.invited_by = user.id;
  if (table === 'notes' || table === 'messages' || table === 'story_ideas') row.user_id = user.id;
  if (table === 'party_tasks') row.created_by_user_id = user.id;
  if (table === 'compendium' || table === 'compendium_templates') row.created_by = user.id;
  if (table === 'party_map_pins' || table === 'party_map_drawings') row.created_by = user.id;
  if (table === 'push_subscriptions' || table === 'user_notification_settings') row.user_id = user.id;
  return row;
}

const ENCOUNTER_VITAL_FIELDS = ['current_hp', 'max_hp', 'current_wp', 'max_wp'];

async function synchronizeActiveEncounterVitals(table, rows, prepared, client) {
  const fields = ENCOUNTER_VITAL_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(prepared, field));
  if (fields.length === 0) return;

  const assignments = fields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .join(', ');

  if (table === 'encounter_combatants') {
    for (const row of rows) {
      if (!row.character_id) continue;
      await client.query(
        `UPDATE characters SET ${assignments} WHERE id = $${fields.length + 1}`,
        [...fields.map((field) => row[field]), row.character_id],
      );
    }
    return;
  }

  if (table === 'characters') {
    for (const row of rows) {
      await client.query(
        `UPDATE encounter_combatants AS combatant
         SET ${assignments}
         FROM encounters AS encounter
         WHERE combatant.encounter_id = encounter.id
           AND encounter.status = 'active'
           AND combatant.character_id = $${fields.length + 1}`,
        [...fields.map((field) => row[field]), row.id],
      );
    }
  }
}

async function insertOne(table, input, ctx, client, onConflict) {
  const owned = applyOwnership(table, input, ctx.user);
  let prepared = await preparePayload(table, owned, client);
  if (!canWrite(table, { ...owned, ...prepared }, ctx, true)) throw new HttpError(403, 'Permission denied');
  const keys = Object.keys(prepared);
  if (keys.length === 0) throw new HttpError(400, 'No valid fields were supplied');
  const identifiers = keys.map((key) => `"${key}"`).join(', ');
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  let conflict = '';
  if (onConflict) {
    const allowed = onConflict.split(',').map((key) => key.trim());
    const columns = await columnsFor(table, client);
    if (!allowed.every((key) => columns.has(key))) throw new HttpError(400, 'Invalid upsert conflict target');
    const updates = keys.filter((key) => !allowed.includes(key)).map((key) => `"${key}" = EXCLUDED."${key}"`);
    conflict = ` ON CONFLICT (${allowed.map((key) => `"${key}"`).join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`;
  }
  const { rows } = await client.query(
    `INSERT INTO "${table}" (${identifiers}) VALUES (${placeholders})${conflict} RETURNING *`,
    keys.map((key) => prepared[key]),
  );
  return outwardAliases(table, rows[0] || null);
}

export async function executeDataQuery(user, request) {
  const { table, action = 'select', filters = [], orders = [], limit, payload, onConflict } = request;
  assertTable(table);

  if (action === 'select') {
    const ctx = await accessContext(user);
    let rows = await allAuthorizedRows(table, ctx);
    rows = applyFilters(rows, filters);
    rows = applyOrders(rows, orders);
    if (Number.isFinite(limit)) rows = rows.slice(0, Math.max(0, limit));
    return rows;
  }

  const result = await withTransaction(async (client) => {
    await client.query(
      `SELECT set_config('draconi.source_user_id', $1, true),
         set_config('draconi.source_client', 'dragonbane-web', true)`,
      [user.id],
    );
    const transactionCtx = await accessContext(user, client);
    if (action === 'insert' || action === 'upsert') {
      const values = Array.isArray(payload) ? payload : [payload];
      const inserted = [];
      for (const value of values) inserted.push(await insertOne(table, value, transactionCtx, client, action === 'upsert' ? onConflict : null));
      return inserted.filter(Boolean);
    }

    let candidates = await allAuthorizedRows(table, transactionCtx, client);
    candidates = applyFilters(candidates, filters);
    if (!candidates.every((row) => canWrite(table, row, transactionCtx))) throw new HttpError(403, 'Permission denied');
    const ids = candidates.map((row) => row.id);
    if (ids.length === 0) return [];

    if (action === 'delete') {
      const { rows } = await client.query(`DELETE FROM "${table}" WHERE id = ANY($1::uuid[]) RETURNING *`, [ids]);
      return rows.map((row) => outwardAliases(table, row));
    }
    if (action === 'update') {
      const prepared = await preparePayload(table, payload, client);
      delete prepared.id;
      const keys = Object.keys(prepared);
      if (keys.length === 0) return candidates;
      const assignments = keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ');
      const { rows } = await client.query(
        `UPDATE "${table}" SET ${assignments} WHERE id = ANY($${keys.length + 1}::uuid[]) RETURNING *`,
        [...keys.map((key) => prepared[key]), ids],
      );
      await synchronizeActiveEncounterVitals(table, rows, prepared, client);
      return rows.map((row) => outwardAliases(table, row));
    }
    throw new HttpError(400, `Unsupported action: ${action}`);
  });
  if (ACCESS_CONTEXT_TABLES.has(table)) invalidateAccessContextCache();
  return result;
}

export async function authorizedChangeEvents(user, afterId, bindings) {
  const tables = [...new Set((bindings || []).map((binding) => binding.table).filter((table) => TABLES.has(table)))];
  if (afterId === null || afterId === undefined) {
    const { rows } = await pool.query('SELECT COALESCE(MAX(id), 0) AS last_id FROM app_change_events');
    return { events: [], lastId: Number(rows[0].last_id) };
  }

  const cursor = Number(afterId);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new HttpError(400, 'Invalid realtime event cursor');
  if (tables.length === 0) return { events: [], lastId: cursor };

  const ctx = await accessContext(user);
  const { rows } = await pool.query(
    `SELECT * FROM app_change_events WHERE id > $1 AND table_name = ANY($2::text[]) ORDER BY id ASC LIMIT 250`,
    [cursor, tables],
  );
  const events = rows.filter((event) => {
    const row = event.new_record || event.old_record;
    if (!row || !canRead(event.table_name, row, ctx)) return false;
    return bindings.some((binding) => {
      if (binding.table !== event.table_name) return false;
      if (!binding.filter) return true;
      const [column, expected] = String(binding.filter).split('=eq.');
      return expected === undefined || String(row[column]) === expected;
    });
  });
  return { events, lastId: Number(rows.at(-1)?.id ?? cursor) };
}
