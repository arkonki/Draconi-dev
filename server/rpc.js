import { withTransaction } from './db.js';
import { loadCampaignAccess } from './campaignRoles.js';
import { HttpError } from './http.js';

async function requirePartyAccess(client, user, partyId, gmOnly = false) {
  const access = await loadCampaignAccess(client, user, partyId);
  const allowed = access?.canRead && (!gmOnly || access.isGm);
  if (!allowed) throw new HttpError(403, 'Permission denied');
  return access.campaign;
}

async function requireEncounterAccess(client, user, encounterId, ownerOnly = false) {
  const { rows } = await client.query('SELECT party_id FROM encounters WHERE id = $1', [encounterId]);
  if (!rows[0]) throw new HttpError(404, 'Encounter not found');
  await requirePartyAccess(client, user, rows[0].party_id, ownerOnly);
  return rows[0];
}

export async function executeRpc(user, name, args = {}) {
  return withTransaction(async (client) => {
    if (name === 'test_connection') return { connected: true, database: 'postgresql' };

    if (name === 'join_party_with_character' || name === 'join_party_secure') {
      const inviteCode = args.invite_code_input || args.p_invite_code || args.invite_code;
      const characterId = args.character_id_input || args.p_character_id || args.character_id;
      const { rows: parties } = await client.query('SELECT id FROM parties WHERE upper(invite_code) = upper($1)', [inviteCode]);
      if (!parties[0]) throw new HttpError(404, 'Invalid invite code');
      const { rows: characters } = await client.query('SELECT user_id FROM characters WHERE id = $1', [characterId]);
      if (characters[0]?.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'You do not own this character');
      await client.query(
        `INSERT INTO party_members (party_id, character_id, user_id)
         VALUES ($1, $2, $3) ON CONFLICT (party_id, character_id) DO NOTHING`,
        [parties[0].id, characterId, user.id],
      );
      await client.query('UPDATE characters SET party_id = $1 WHERE id = $2', [parties[0].id, characterId]);
      return parties[0].id;
    }

    if (name === 'increase_character_max_stat') {
      const characterId = args.character_id_input;
      const column = args.stat_name === 'hp' ? 'max_hp' : args.stat_name === 'wp' ? 'max_wp' : null;
      if (!column) throw new HttpError(400, 'stat_name must be hp or wp');
      const amount = Number(args.amount_increase || 0);
      const { rows } = await client.query('SELECT user_id FROM characters WHERE id = $1', [characterId]);
      if (rows[0]?.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'Permission denied');
      const result = await client.query(`UPDATE characters SET "${column}" = "${column}" + $1 WHERE id = $2 RETURNING *`, [amount, characterId]);
      return result.rows[0] || null;
    }

    if (name === 'spend_solo_survivor_wp') {
      const characterId = args.p_character_id;
      const { rows } = await client.query(
        `SELECT c.id, c.party_id, c.user_id, c.current_wp, c.heroic_ability,
                solo.enabled AS solo_enabled,
                solo.player_character_id AS solo_player_character_id
         FROM characters c
         LEFT JOIN solo_campaign_states solo ON solo.campaign_id = c.party_id
         WHERE c.id = $1
         FOR UPDATE OF c`,
        [characterId],
      );
      const character = rows[0];
      if (!character) throw new HttpError(404, 'Character not found');
      if (!character.party_id) throw new HttpError(409, 'Sole Survivor requires an active solo campaign');

      const access = await loadCampaignAccess(client, user, character.party_id);
      if (!access?.canWrite || (character.user_id !== user.id && !access.isGm)) {
        throw new HttpError(403, 'Permission denied');
      }
      const heroicAbilities = Array.isArray(character.heroic_ability)
        ? character.heroic_ability.map((ability) => String(ability).trim().toLowerCase())
        : [];
      if (
        !character.solo_enabled
        || character.solo_player_character_id !== character.id
        || !heroicAbilities.includes('sole survivor')
      ) {
        throw new HttpError(409, 'Sole Survivor is not available to this character');
      }

      const spent = await client.query(
        `UPDATE characters
         SET current_wp = current_wp - 3
         WHERE id = $1 AND current_wp >= 3
         RETURNING current_wp`,
        [character.id],
      );
      if (!spent.rows[0]) throw new HttpError(409, 'Sole Survivor requires 3 WP');

      await client.query(
        `UPDATE encounter_combatants AS combatant
         SET current_wp = $1
         FROM encounters AS encounter
         WHERE combatant.encounter_id = encounter.id
           AND encounter.status = 'active'
           AND combatant.character_id = $2`,
        [spent.rows[0].current_wp, character.id],
      );
      return { current_wp: Number(spent.rows[0].current_wp), spent_wp: 3 };
    }

    if (name === 'duplicate_encounter_with_combatants') {
      await requireEncounterAccess(client, user, args.p_encounter_id, true);
      const { rows } = await client.query('SELECT * FROM encounters WHERE id = $1', [args.p_encounter_id]);
      const original = rows[0];
      const inserted = await client.query(
        `INSERT INTO encounters (party_id, name, description, status, current_round, log)
         VALUES ($1, $2, $3, 'planning', 0, '[]'::jsonb) RETURNING *`,
        [original.party_id, args.p_new_name, original.description],
      );
      await client.query(
        `INSERT INTO encounter_combatants (
           encounter_id, character_id, monster_id, is_player_character, display_name,
           current_hp, max_hp, current_wp, max_wp, status_effects, initiative_roll, has_acted
         )
         SELECT $1, character_id, monster_id, is_player_character, display_name,
           max_hp, max_hp, max_wp, max_wp, '[]'::jsonb, NULL, false
         FROM encounter_combatants WHERE encounter_id = $2`,
        [inserted.rows[0].id, original.id],
      );
      return inserted.rows[0];
    }

    if (name === 'add_character_to_encounter') {
      await requireEncounterAccess(client, user, args.p_encounter_id, true);
      const { rows } = await client.query('SELECT * FROM characters WHERE id = $1', [args.p_character_id]);
      if (!rows[0]) throw new HttpError(404, 'Character not found');
      const character = rows[0];
      const result = await client.query(
        `INSERT INTO encounter_combatants (
           encounter_id, character_id, is_player_character, display_name,
           current_hp, max_hp, current_wp, max_wp, initiative_roll
         ) VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [args.p_encounter_id, character.id, character.name, character.current_hp, character.max_hp,
          character.current_wp, character.max_wp, args.p_initiative_roll ?? null],
      );
      return result.rows[0];
    }

    if (name === 'add_monster_to_encounter') {
      await requireEncounterAccess(client, user, args.p_encounter_id, true);
      const { rows } = await client.query('SELECT * FROM monsters WHERE id = $1', [args.p_monster_id]);
      if (!rows[0]) throw new HttpError(404, 'Monster not found');
      const stats = rows[0].stats || {};
      const maxHp = Number(stats.HP ?? stats.hp ?? 1);
      const maxWp = Number(stats.WP ?? stats.wp ?? 0);
      const result = await client.query(
        `INSERT INTO encounter_combatants (
           encounter_id, monster_id, is_player_character, display_name,
           current_hp, max_hp, current_wp, max_wp, initiative_roll
         ) VALUES ($1, $2, false, $3, $4, $4, $5, $5, $6) RETURNING *`,
        [args.p_encounter_id, rows[0].id, args.p_custom_name || rows[0].name, maxHp, maxWp, args.p_initiative_roll ?? null],
      );
      return result.rows[0];
    }

    if (name === 'append_to_log') {
      await requireEncounterAccess(client, user, args.p_encounter_id);
      await client.query(
        `UPDATE encounters SET log = COALESCE(log, '[]'::jsonb) || jsonb_build_array($1::jsonb) WHERE id = $2`,
        [JSON.stringify(args.p_log_entry), args.p_encounter_id],
      );
      return null;
    }

    if (name === 'advance_encounter_round') {
      await requireEncounterAccess(client, user, args.p_encounter_id, true);
      await client.query('UPDATE encounters SET current_round = current_round + 1 WHERE id = $1', [args.p_encounter_id]);
      await client.query(
        `UPDATE encounter_combatants
         SET has_acted = false, completed_initiative_slots = '{}'::integer[]
         WHERE encounter_id = $1`,
        [args.p_encounter_id],
      );
      return null;
    }

    if (name === 'roll_initiative_for_combatants') {
      await requireEncounterAccess(client, user, args.p_encounter_id, true);
      const ids = Array.isArray(args.p_combatant_ids) ? args.p_combatant_ids : [];
      const results = [];
      for (const id of ids) {
        const initiative = Math.floor(Math.random() * 10) + 1;
        const { rows } = await client.query(
          `UPDATE encounter_combatants
           SET initiative_roll = $1, initiative_slots = ARRAY[$1]::integer[],
             completed_initiative_slots = '{}'::integer[], has_acted = false
           WHERE id = $2 AND encounter_id = $3 RETURNING *`,
          [initiative, id, args.p_encounter_id],
        );
        if (rows[0]) results.push(rows[0]);
      }
      return results;
    }

    if (name === 'swap_initiative') {
      const { rows } = await client.query(
        'SELECT id, encounter_id, initiative_roll, initiative_slots FROM encounter_combatants WHERE id = ANY($1::uuid[])',
        [[args.id1, args.id2]],
      );
      if (rows.length !== 2 || rows[0].encounter_id !== rows[1].encounter_id) throw new HttpError(400, 'Combatants must share an encounter');
      await requireEncounterAccess(client, user, rows[0].encounter_id, true);
      const first = rows.find((row) => row.id === args.id1);
      const second = rows.find((row) => row.id === args.id2);
      await client.query(
        `UPDATE encounter_combatants SET
           initiative_roll = CASE id WHEN $1 THEN $3::integer WHEN $2 THEN $4::integer END,
           initiative_slots = CASE id WHEN $1 THEN $5::integer[] WHEN $2 THEN $6::integer[] END,
           completed_initiative_slots = '{}'::integer[], has_acted = false
         WHERE id = ANY($7::uuid[])`,
        [
          args.id1,
          args.id2,
          second.initiative_roll,
          first.initiative_roll,
          second.initiative_slots?.length ? second.initiative_slots : [second.initiative_roll],
          first.initiative_slots?.length ? first.initiative_slots : [first.initiative_roll],
          [args.id1, args.id2],
        ],
      );
      return null;
    }

    throw new HttpError(404, `Unknown RPC: ${name}`);
  });
}
