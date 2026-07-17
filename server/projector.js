import { createHash, randomBytes } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { HttpError } from './http.js';

const DEFAULT_SLOTS = [
  { corner: 'top_left', characterId: null, rotationDeg: 180, sortOrder: 0 },
  { corner: 'top_right', characterId: null, rotationDeg: 90, sortOrder: 1 },
  { corner: 'bottom_left', characterId: null, rotationDeg: 270, sortOrder: 2 },
  { corner: 'bottom_right', characterId: null, rotationDeg: 0, sortOrder: 3 },
];

const digest = (value) => createHash('sha256').update(value).digest('hex');

async function requireOwner(client, user, partyId) {
  const { rows } = await client.query('SELECT * FROM parties WHERE id = $1', [partyId]);
  if (!rows[0] || user.role !== 'admin' && rows[0].created_by !== user.id) throw new HttpError(403, 'Only the party owner can manage its display');
  return rows[0];
}

export async function projectorFunction(user, name, body) {
  if (name === 'get-player-display-state') return getPlayerDisplayState(body.sessionToken);
  if (!user) throw new HttpError(401, 'Authentication required');
  if (name === 'send-chat-push' || name === 'send-encounter-push') {
    return { sent: 0, skipped: 'Push delivery is disabled in the self-hosted local stack' };
  }

  return withTransaction(async (client) => {
    if (name === 'create-party-display-session') {
      const party = await requireOwner(client, user, body.partyId);
      const latest = await client.query(
        'SELECT * FROM party_display_sessions WHERE party_id = $1 ORDER BY created_at DESC LIMIT 1',
        [party.id],
      );
      let slots = DEFAULT_SLOTS;
      if (latest.rows[0]) {
        const previousSlots = await client.query('SELECT * FROM party_display_slots WHERE session_id = $1 ORDER BY sort_order', [latest.rows[0].id]);
        if (previousSlots.rows.length === 4) {
          slots = previousSlots.rows.map((slot) => ({
            corner: slot.corner, characterId: slot.character_id,
            rotationDeg: slot.rotation_deg, sortOrder: slot.sort_order,
          }));
        }
      }
      await client.query('UPDATE party_display_sessions SET revoked_at = now() WHERE party_id = $1 AND revoked_at IS NULL', [party.id]);
      const token = `${party.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${randomBytes(24).toString('base64url')}`;
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const inserted = await client.query(
        `INSERT INTO party_display_sessions (
           party_id, token_hash, created_by, display_map_id, display_image_url, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [party.id, digest(token), user.id, latest.rows[0]?.display_map_id ?? null, latest.rows[0]?.display_image_url ?? null, expiresAt],
      );
      const session = inserted.rows[0];
      const createdSlots = [];
      for (const slot of slots) {
        const result = await client.query(
          `INSERT INTO party_display_slots (session_id, corner, character_id, rotation_deg, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [session.id, slot.corner, slot.characterId, slot.rotationDeg, slot.sortOrder],
        );
        createdSlots.push(result.rows[0]);
      }
      return { sessionToken: token, session, slots: createdSlots };
    }

    const sessionId = body.sessionId;
    const { rows } = await client.query('SELECT * FROM party_display_sessions WHERE id = $1', [sessionId]);
    if (!rows[0]) throw new HttpError(404, 'Display session not found');
    await requireOwner(client, user, rows[0].party_id);

    if (name === 'revoke-party-display-session') {
      await client.query('UPDATE party_display_sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
      return { revoked: true };
    }
    if (name === 'renew-party-display-session') {
      const result = await client.query(
        `UPDATE party_display_sessions SET expires_at = now() + interval '12 hours', revoked_at = NULL
         WHERE id = $1 RETURNING *`, [sessionId],
      );
      return { session: result.rows[0] };
    }
    if (name === 'update-party-display-layout') {
      const result = await client.query(
        `UPDATE party_display_sessions SET display_image_url = $1, display_map_id = $2 WHERE id = $3 RETURNING *`,
        [body.displayImageUrl ?? null, body.displayMapId ?? null, sessionId],
      );
      await client.query('DELETE FROM party_display_slots WHERE session_id = $1', [sessionId]);
      const createdSlots = [];
      for (const slot of body.slots || DEFAULT_SLOTS) {
        const inserted = await client.query(
          `INSERT INTO party_display_slots (session_id, corner, character_id, rotation_deg, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [sessionId, slot.corner, slot.characterId ?? null, slot.rotationDeg ?? 0, slot.sortOrder],
        );
        createdSlots.push(inserted.rows[0]);
      }
      return { session: result.rows[0], slots: createdSlots };
    }
    throw new HttpError(404, `Unknown function: ${name}`);
  });
}

export async function getPlayerDisplayState(token) {
  if (!token) throw new HttpError(400, 'sessionToken is required');
  const { rows: sessions } = await pool.query(
    `SELECT * FROM party_display_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [digest(token)],
  );
  const session = sessions[0];
  if (!session) throw new HttpError(410, 'Display session is invalid, expired, or revoked');
  await pool.query('UPDATE party_display_sessions SET last_seen_at = now() WHERE id = $1', [session.id]);
  const [partyResult, mapResult, encounterResult, slotsResult] = await Promise.all([
    pool.query('SELECT id, name FROM parties WHERE id = $1', [session.party_id]),
    session.display_map_id
      ? pool.query('SELECT * FROM party_maps WHERE id = $1 AND party_id = $2', [session.display_map_id, session.party_id])
      : pool.query('SELECT * FROM party_maps WHERE party_id = $1 AND is_active = true ORDER BY updated_at DESC LIMIT 1', [session.party_id]),
    pool.query("SELECT name, current_round FROM encounters WHERE party_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1", [session.party_id]),
    pool.query('SELECT * FROM party_display_slots WHERE session_id = $1 ORDER BY sort_order', [session.id]),
  ]);
  const party = partyResult.rows[0];
  if (!party) throw new HttpError(404, 'Party not found');
  const map = mapResult.rows[0];
  const encounter = encounterResult.rows[0];
  const slots = slotsResult.rows.length ? slotsResult.rows : DEFAULT_SLOTS.map((slot) => ({
    corner: slot.corner, character_id: slot.characterId, rotation_deg: slot.rotationDeg, sort_order: slot.sortOrder,
  }));
  const ids = slots.map((slot) => slot.character_id).filter(Boolean);
  const characters = ids.length
    ? (await pool.query('SELECT id, name, portrait_url, current_hp, max_hp, current_wp, max_wp, conditions FROM characters WHERE id = ANY($1::uuid[])', [ids])).rows
    : [];
  const byId = new Map(characters.map((character) => [character.id, character]));
  return {
    party,
    displayImageUrl: session.display_image_url ?? null,
    map: map ? {
      imageUrl: map.image_url,
      gridType: map.grid_type,
      gridSize: map.grid_size,
      gridOpacity: Number(map.grid_opacity),
      gridOffsetX: Number(map.grid_offset_x),
      gridOffsetY: Number(map.grid_offset_y),
      gridColor: map.grid_color,
      gridRotation: Number(map.grid_rotation),
    } : null,
    encounter: { isActive: Boolean(encounter), name: encounter?.name ?? null, round: encounter?.current_round ?? null },
    slots: slots.map((slot) => {
      const character = byId.get(slot.character_id);
      return {
        corner: slot.corner,
        rotationDeg: slot.rotation_deg,
        sortOrder: slot.sort_order,
        character: character ? {
          id: character.id, name: character.name, portraitUrl: character.portrait_url,
          currentHp: character.current_hp, maxHp: character.max_hp,
          currentWp: character.current_wp, maxWp: character.max_wp,
          conditions: character.conditions || {},
        } : null,
      };
    }),
  };
}
