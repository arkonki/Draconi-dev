import { pool } from './db.js';
import { HttpError } from './http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Game Data screen's categories and the table behind each one.
export const GAME_DATA_TABLES = {
  items: 'game_items',
  spells: 'game_spells',
  abilities: 'heroic_abilities',
  kin: 'kin',
  profession: 'professions',
  skills: 'game_skills',
  monsters: 'monsters',
  bio: 'bio_data',
};

// Every string value anywhere inside a JSON document equals $1 (case-insensitive). Characters keep items,
// spells and gear as plain names inside JSON, so this finds them wherever they are nested.
const jsonHasString = (column) => `EXISTS (
  SELECT 1 FROM jsonb_path_query(COALESCE(${column}, 'null'::jsonb), '$.**') AS v
  WHERE jsonb_typeof(v) = 'string' AND lower(v #>> '{}') = lower($1))`;
const arrayHas = (column) => `EXISTS (SELECT 1 FROM unnest(COALESCE(${column}, ARRAY[]::text[])) AS e WHERE lower(e) = lower($1))`;

// Each check selects a human-readable label per place the entry is used. $1 = entry name, $2 = entry id.
// Characters, professions and kin refer to game data by name; monsters and encounters use ids.
const CHECKS = {
  items: [
    { key: 'characters', label: 'characters carrying or wearing it', sql: `SELECT c.name AS label FROM characters c WHERE ${jsonHasString('c.equipment')}` },
    { key: 'stashes', label: 'party stashes', sql: `SELECT p.name || ' (stash)' AS label FROM party_inventory i JOIN parties p ON p.id = i.party_id WHERE lower(i.name) = lower($1)` },
    { key: 'monsters', label: 'monsters carrying it', sql: `SELECT m.name AS label FROM monsters m WHERE ${jsonHasString("m.stats->'GEAR'")}` },
  ],
  spells: [
    { key: 'characters', label: 'characters who know or have prepared it', sql: `SELECT c.name AS label FROM characters c WHERE ${jsonHasString('c.spells')} OR ${arrayHas('c.prepared_spells')}` },
  ],
  abilities: [
    { key: 'characters', label: 'characters with this heroic ability', sql: `SELECT c.name AS label FROM characters c WHERE ${arrayHas('c.heroic_ability')}` },
    { key: 'kin', label: 'kin that grant it', sql: `SELECT k.name AS label FROM kin k WHERE lower(k.heroic_ability) = lower($1)` },
    { key: 'professions', label: 'professions that grant it', sql: `SELECT p.name AS label FROM professions p WHERE lower(p.heroic_ability) = lower($1)` },
    { key: 'monsters', label: 'monsters that use it', sql: `SELECT m.name AS label FROM monsters m WHERE m.stats->'HEROIC_ABILITY_ITEMS' @> jsonb_build_array(jsonb_build_object('ability_id', $2::text))` },
  ],
  skills: [
    {
      key: 'characters',
      label: 'characters who have trained or rated it',
      sql: `SELECT c.name AS label FROM characters c
            WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(c.skill_levels) = 'object' THEN c.skill_levels ELSE '{}'::jsonb END) AS k WHERE lower(k) = lower($1))
               OR ${arrayHas('c.trained_skills')} OR ${arrayHas('c.marked_skills')}`,
    },
    {
      key: 'professions',
      label: 'professions that include it',
      sql: `SELECT p.name AS label FROM professions p WHERE ${arrayHas('p.skills')} OR lower(p.associated_skill) = lower($1)`,
    },
    { key: 'monsters', label: 'monsters that use it', sql: `SELECT m.name AS label FROM monsters m WHERE m.stats->'SKILL_ENTRIES' @> jsonb_build_array(jsonb_build_object('skill_id', $2::text))` },
  ],
  kin: [
    { key: 'characters', label: 'characters of this kin', sql: `SELECT c.name AS label FROM characters c WHERE lower(c.kin) = lower($1)` },
  ],
  profession: [
    { key: 'characters', label: 'characters with this profession', sql: `SELECT c.name AS label FROM characters c WHERE lower(c.profession) = lower($1)` },
  ],
  monsters: [
    {
      key: 'encounters',
      label: 'encounters it appears in',
      sql: `SELECT DISTINCT e.name AS label FROM encounter_combatants ec JOIN encounters e ON e.id = ec.encounter_id WHERE ec.monster_id = $2::uuid`,
    },
  ],
  bio: [],
};

export function usageChecksFor(category) {
  return CHECKS[category] ?? null;
}

export async function gameDataUsage(actor, { category, id }) {
  if (actor?.role !== 'admin') throw new HttpError(403, 'Administrator access is required', 'ADMIN_REQUIRED');
  const table = GAME_DATA_TABLES[category];
  if (!table) throw new HttpError(400, 'Unknown game data category', 'INVALID_CATEGORY');
  if (!UUID.test(String(id || ''))) throw new HttpError(400, 'Invalid entry id', 'INVALID_ID');

  const { rows } = await pool.query(`SELECT name FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Entry not found', 'NOT_FOUND');
  const name = rows[0].name;

  const usage = [];
  for (const check of CHECKS[category]) {
    // Postgres cannot type a bind parameter a statement never mentions, so the wrapper refers to both
    // ($1 name, $2 id) no matter which of them an individual check needs.
    const result = await pool.query(
      `SELECT count(*)::int AS count, (array_agg(label ORDER BY label))[1:5] AS examples
       FROM (${check.sql}) AS usage WHERE $1::text IS NOT NULL AND $2::text IS NOT NULL`,
      [name, id],
    );
    const { count, examples } = result.rows[0];
    if (count > 0) usage.push({ key: check.key, label: check.label, count, examples: examples ?? [] });
  }
  return { category, id, name, total: usage.reduce((sum, entry) => sum + entry.count, 0), usage };
}
