import { pool } from './db.js';
import { HttpError } from './http.js';
import { loadCampaignAccess } from './campaignRoles.js';
import { callModel, callModelStream } from './aiSettings.js';
import { getSoloState } from './helper/service.js';
import { buildNarratorMessages, buildSummaryMessages, parseNarratorReply } from './soloNarratorContext.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The newest exchanges sent verbatim with every request; anything older lives in the running summary. */
export const RECENT_TURNS = 8;
/** When this many exchanges have not been summarised yet, the oldest ones are folded into the summary. */
export const SUMMARISE_WHEN = 16;
export const MAX_SUMMARY_CHARS = 2000;
const TURNS_SHOWN = 60;

async function requireNarratorAccess(user, partyId) {
  if (!UUID.test(String(partyId || ''))) throw new HttpError(400, 'partyId is required', 'INVALID_CAMPAIGN');
  const access = await loadCampaignAccess(pool, user, partyId);
  if (!access?.canWrite) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
}

const turnOut = (row) => ({ id: row.id, role: row.role, content: row.content, actions: row.actions ?? [], createdAt: row.created_at });

/** What the narrator page shows when it opens: the conversation so far and the running summary. */
export async function getNarratorConversation(user, partyId) {
  await requireNarratorAccess(user, partyId);
  const [{ rows: turns }, { rows: memory }] = await Promise.all([
    pool.query('SELECT * FROM (SELECT * FROM solo_narrator_turns WHERE party_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) recent ORDER BY created_at, id', [partyId, TURNS_SHOWN]),
    pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]),
  ]);
  return { turns: turns.map(turnOut), summary: memory[0]?.summary ?? '' };
}

/** The player can correct the story so far by hand. */
export async function saveNarratorSummary(user, { partyId, summary } = {}) {
  await requireNarratorAccess(user, partyId);
  const text = String(summary ?? '').trim();
  if (text.length > MAX_SUMMARY_CHARS) throw new HttpError(400, `Keep the story so far under ${MAX_SUMMARY_CHARS} characters`, 'SUMMARY_TOO_LONG');
  await pool.query(
    `INSERT INTO solo_narrator_memory (party_id, summary) VALUES ($1, $2)
     ON CONFLICT (party_id) DO UPDATE SET summary = $2, updated_at = now()`,
    [partyId, text],
  );
  return { summary: text };
}

/** Forgets the conversation and the summary, to start the story afresh. */
export async function resetNarrator(user, partyId) {
  await requireNarratorAccess(user, partyId);
  await pool.query('DELETE FROM solo_narrator_turns WHERE party_id = $1', [partyId]);
  await pool.query('DELETE FROM solo_narrator_memory WHERE party_id = $1', [partyId]);
  return { turns: [], summary: '' };
}

/** Folds the oldest exchanges into the summary once too many have piled up. Failures leave things as they were. */
export async function summariseIfNeeded(user, partyId, { callImpl = callModel } = {}) {
  const { rows: pending } = await pool.query(
    'SELECT id, role, content FROM solo_narrator_turns WHERE party_id = $1 AND NOT summarized ORDER BY created_at, id',
    [partyId],
  );
  if (pending.length <= SUMMARISE_WHEN) return false;
  const older = pending.slice(0, pending.length - RECENT_TURNS);
  const { rows: memory } = await pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]);
  const result = await callImpl(user, {
    messages: buildSummaryMessages({ summary: memory[0]?.summary ?? '', turns: older }),
    purpose: 'solo-summary',
    partyId,
    temperature: 0.3,
    maxTokens: 500,
  });
  const text = result.text.slice(0, MAX_SUMMARY_CHARS);
  await pool.query(
    `INSERT INTO solo_narrator_memory (party_id, summary) VALUES ($1, $2)
     ON CONFLICT (party_id) DO UPDATE SET summary = $2, updated_at = now()`,
    [partyId, text],
  );
  await pool.query('UPDATE solo_narrator_turns SET summarized = true WHERE id = ANY($1::uuid[])', [older.map((turn) => turn.id)]);
  return true;
}

/**
 * One turn with the Solo narrator. The player says what the hero does; the narrator answers from the current game state
 * and the story so far. With `onDelta` the answer is passed on as it is written. Both sides of the exchange are kept,
 * and any rule actions the narrator proposes are checked against the game before they are returned.
 */
export async function narrateSolo(user, { partyId, message } = {}, { onDelta, signal } = {}) {
  await requireNarratorAccess(user, partyId);
  const said = String(message ?? '').trim();
  if (!said) throw new HttpError(400, 'Say what the hero does or asks', 'EMPTY_MESSAGE');
  const state = await getSoloState(user, partyId);
  if (!state?.solo?.enabled) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');

  const [{ rows: recent }, { rows: memory }] = await Promise.all([
    pool.query('SELECT role, content FROM solo_narrator_turns WHERE party_id = $1 AND NOT summarized ORDER BY created_at DESC, id DESC LIMIT $2', [partyId, RECENT_TURNS]),
    pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]),
  ]);
  const request = {
    messages: buildNarratorMessages({ state, summary: memory[0]?.summary ?? '', history: recent.reverse(), message: said }),
    purpose: 'solo',
    partyId,
    temperature: 0.8,
    maxTokens: 800,
  };
  const result = onDelta ? await callModelStream(user, request, { onDelta, signal }) : await callModel(user, request);
  const reply = parseNarratorReply(result.text, state);

  const { rows: saved } = await pool.query(
    `INSERT INTO solo_narrator_turns (party_id, role, content, actions, created_at)
     VALUES ($1, 'user', $2, NULL, now()), ($1, 'assistant', $3, $4, now() + interval '1 millisecond')
     RETURNING id, role`,
    [partyId, said.slice(0, 2000), reply.text.slice(0, 8000), reply.actions.length ? JSON.stringify(reply.actions) : null],
  );
  const assistantId = saved.find((row) => row.role === 'assistant')?.id;

  // Tidying the story so far can happen after the answer has been delivered; it is never allowed to fail the turn.
  void summariseIfNeeded(user, partyId).catch(() => false);
  return { id: assistantId, text: reply.text, actions: reply.actions, model: result.model, usage: result.usage };
}

/** A one-off generation for the Story Helper. The prompt is built by the page; the key and the call stay on the server. */
export async function generateStory(user, { prompt, partyId } = {}) {
  const text = String(prompt ?? '').trim();
  if (!text) throw new HttpError(400, 'prompt is required', 'EMPTY_PROMPT');
  if (text.length > 30_000) throw new HttpError(400, 'The prompt is too long', 'PROMPT_TOO_LONG');
  let campaign = null;
  if (partyId) {
    if (!UUID.test(String(partyId))) throw new HttpError(400, 'Invalid campaign', 'INVALID_CAMPAIGN');
    const access = await loadCampaignAccess(pool, user, partyId);
    if (!access?.isGm) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
    campaign = partyId;
  }
  const result = await callModel(user, { messages: [{ role: 'user', content: text }], purpose: 'story', partyId: campaign, temperature: 0.7, maxTokens: 2500 });
  return { text: result.text, model: result.model, usage: result.usage };
}
