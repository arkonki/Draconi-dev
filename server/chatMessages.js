import { HttpError } from './http.js';

// Chat messages that do more than show text: a poke, a shared journal note, a shared compendium entry and a shared
// dice roll. They used to be tags typed into the text, which anyone could fake. Now each is a kind with a payload the
// server checks, and the server writes their text itself, so what the chat shows is what really happened.

export const MESSAGE_KINDS = new Set(['text', 'poke', 'note', 'compendium', 'roll']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_TAG = /<<<\s*(POKE|NOTE|COMPENDIUM)\s*:/i;

const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const uuidOf = (value, label) => {
  const id = String(value ?? '');
  if (!UUID.test(id)) throw new HttpError(400, `${label} is missing`, 'INVALID_MESSAGE');
  return id;
};

/** A shared roll as the sender's own dice reported it. Only these fields are kept, each cut to a sensible size. */
export function rollPayload(raw = {}) {
  const total = Number(raw.total);
  const payload = {
    label: clip(raw.label, 120) || 'Dice roll',
    total: raw.total !== null && raw.total !== undefined && raw.total !== '' && Number.isFinite(total) ? Math.round(total) : null,
    outcome: clip(raw.outcome, 60),
    dice: clip(raw.dice, 60),
    critical: raw.critical === true,
    success: typeof raw.success === 'boolean' ? raw.success : null,
    manual: raw.manual === true,
  };
  return payload;
}

/** The text a shared roll shows, built from its payload. */
export function rollText(payload) {
  const result = payload.total !== null ? `Result: ${payload.total}` : payload.outcome ? `Result: ${payload.outcome}` : 'rolled';
  const parts = [`🎲 **${payload.label}**: ${result}${payload.dice ? ` (${payload.dice})` : ''}`];
  if (payload.critical) parts.push('🔥 CRITICAL!');
  if (payload.success !== null) parts.push(payload.success ? '✅ Success' : '❌ Failure');
  if (payload.manual) parts.push('(entered by hand)');
  return parts.join(' ');
}

/**
 * Checks a new message and returns the fields to store. `row` is the message as sent, already owned by the sender.
 * Plain text may not carry the old tags; every other kind is checked against the campaign and gets its text here.
 */
export async function prepareChatMessage(client, row) {
  const kind = row.kind === undefined || row.kind === null ? 'text' : String(row.kind);
  if (!MESSAGE_KINDS.has(kind)) throw new HttpError(400, 'Unknown message kind', 'INVALID_MESSAGE');
  const raw = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const partyId = uuidOf(row.party_id, 'The campaign');

  if (kind === 'text') {
    if (LEGACY_TAG.test(String(row.content ?? ''))) throw new HttpError(400, 'Use the share buttons to share notes, entries and pokes', 'INVALID_MESSAGE');
    return { kind, payload: {}, content: row.content };
  }

  if (kind === 'poke') {
    const targetUserId = uuidOf(raw.targetUserId, 'Who to poke');
    // Anyone in the campaign: its owner, a member, or a player whose character is in it.
    const { rows } = await client.query(
      `SELECT COALESCE(
         (SELECT c.name FROM party_members pm JOIN characters c ON c.id = pm.character_id
          WHERE pm.party_id = $1 AND c.user_id = $2 ORDER BY c.name LIMIT 1),
         (SELECT u.username FROM users u WHERE u.id = $2 AND (
            EXISTS (SELECT 1 FROM parties p WHERE p.id = $1 AND p.created_by = u.id)
            OR EXISTS (SELECT 1 FROM campaign_memberships cm WHERE cm.party_id = $1 AND cm.user_id = u.id)))
       ) AS name`,
      [partyId, targetUserId],
    );
    if (!rows[0]?.name) throw new HttpError(400, 'That person is not in this campaign', 'INVALID_MESSAGE');
    return { kind, payload: { targetUserId }, content: `👉 Poked ${clip(rows[0].name, 80)}!` };
  }

  if (kind === 'note') {
    const noteId = uuidOf(raw.noteId, 'The note');
    const { rows } = await client.query('SELECT title FROM notes WHERE id = $1 AND party_id = $2', [noteId, partyId]);
    if (!rows[0]) throw new HttpError(400, 'That note is not in this campaign', 'INVALID_MESSAGE');
    const title = clip(rows[0].title, 200) || 'Untitled note';
    return { kind, payload: { noteId, title }, content: `Shared a note: ${title}` };
  }

  if (kind === 'compendium') {
    const entryId = uuidOf(raw.entryId, 'The entry');
    // Only an entry the campaign's members can open.
    const { rows } = await client.query(
      'SELECT title FROM compendium WHERE id = $1 AND (is_public OR party_id = $2)',
      [entryId, partyId],
    );
    if (!rows[0]) throw new HttpError(400, 'That entry is not public or part of this campaign', 'INVALID_MESSAGE');
    const title = clip(rows[0].title, 200) || 'Untitled entry';
    return { kind, payload: { entryId, title }, content: `📖 **Shared Entry:** ${title}` };
  }

  const payload = rollPayload(raw);
  return { kind, payload, content: rollText(payload) };
}
