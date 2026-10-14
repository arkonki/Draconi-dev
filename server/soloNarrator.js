import { pool } from './db.js';
import { HttpError } from './http.js';
import { loadCampaignAccess } from './campaignRoles.js';
import { callModel, callModelStream, callModelWithTools } from './aiSettings.js';
import { getSessionHistory, getSoloState, recordNarration } from './helper/service.js';
import { buildNarratorMessages, buildSummaryMessages, parseNarratorReply } from './soloNarratorContext.js';
import { needsApproval, parseToolArguments, runTool, toolByName, toolSpecs } from './soloNarratorTools.js';
import { buildRecapMessages } from './recapPrompt.js';
import { buildMissionMessages, missionContext, parseMissionProposal } from './soloMissionProposal.js';
import { DEFAULT_GLOSSARIES, MAX_GLOSSARY_CHARS, effectiveGlossary, isNarrationLanguage, normalizeNarrationLanguage, sanitizeGlossaryInput } from './soloNarrationLanguage.js';

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
  return access;
}

/** Every tool call of a reply in order, as the page shows them. The raw results stay on the server. */
export const toolCallsOf = (row) => (row.tool_calls?.steps ?? []).flatMap((step) => step.calls ?? []).map((call) => ({
  id: call.id, name: call.name, args: call.args ?? {}, label: call.label, tier: call.tier, status: call.status, summary: call.summary ?? null, error: call.error ?? null,
}));

/** A reply whose last step called tools, all decided, and which has not been carried on yet. */
const canResume = (row) => {
  const steps = row.tool_calls?.steps ?? [];
  const last = steps[steps.length - 1];
  return Boolean(last?.calls?.length) && !last.calls.some((call) => call.status === 'pending');
};

const turnOut = (row) => ({ id: row.id, role: row.role, content: row.content, actions: row.actions ?? [], toolCalls: toolCallsOf(row), canResume: canResume(row), createdAt: row.created_at, tokens: row.tokens ?? null, cachedTokens: row.cached_tokens ?? null, costUsd: row.cost_usd === null || row.cost_usd === undefined ? null : Number(row.cost_usd) });

/** The language this campaign is narrated in, and its own glossary of game terms if it has one. */
async function campaignLanguage(partyId) {
  const { rows } = await pool.query('SELECT narration_language, narration_glossary, narrator_mode FROM solo_campaign_states WHERE campaign_id = $1', [partyId]);
  return { language: normalizeNarrationLanguage(rows[0]?.narration_language), glossary: rows[0]?.narration_glossary ?? null, mode: NARRATOR_MODES.has(rows[0]?.narrator_mode) ? rows[0].narrator_mode : 'ask' };
}

/** How much the narrator may do: only suggest, act after the player approves, or act on its own. */
export const NARRATOR_MODES = new Set(['suggest', 'ask', 'trust']);
const MAX_TOOL_STEPS = 5;
const MAX_CALLS_PER_STEP = 3;

export async function setNarratorMode(user, { partyId, mode } = {}) {
  await requireNarratorAccess(user, partyId);
  if (!NARRATOR_MODES.has(mode)) throw new HttpError(400, 'Choose suggest, ask or trust', 'INVALID_MODE');
  const { rowCount } = await pool.query('UPDATE solo_campaign_states SET narrator_mode = $2 WHERE campaign_id = $1', [partyId, mode]);
  if (rowCount === 0) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  return { mode };
}

const glossaryOut = (language, custom) => ({
  /** What this campaign saved, or null when it uses the built-in list. */
  custom,
  /** The built-in list for the language, for the editor to start from. */
  builtIn: DEFAULT_GLOSSARIES[language] ?? '',
  terms: effectiveGlossary(language, custom).length,
});

/** Saves the campaign's own glossary of game terms, or (with an empty value) goes back to the built-in one. */
export async function setNarrationGlossary(user, { partyId, glossary } = {}) {
  await requireNarratorAccess(user, partyId);
  let value;
  try {
    value = sanitizeGlossaryInput(glossary);
  } catch {
    throw new HttpError(400, `Keep the glossary under ${MAX_GLOSSARY_CHARS} characters`, 'GLOSSARY_TOO_LONG');
  }
  const { rowCount } = await pool.query('UPDATE solo_campaign_states SET narration_glossary = $2 WHERE campaign_id = $1', [partyId, value]);
  if (rowCount === 0) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  const { language } = await campaignLanguage(partyId);
  return { glossary: glossaryOut(language, value) };
}

/** Switches the language of the story. It is a setting, not game state, so the campaign revision stays as it is. */
export async function setNarrationLanguage(user, { partyId, language } = {}) {
  await requireNarratorAccess(user, partyId);
  if (!isNarrationLanguage(language)) throw new HttpError(400, 'Choose English or Estonian', 'INVALID_LANGUAGE');
  const { rowCount } = await pool.query('UPDATE solo_campaign_states SET narration_language = $2 WHERE campaign_id = $1', [partyId, language]);
  if (rowCount === 0) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  return { language };
}

/** What the narrator page shows when it opens: the conversation so far and the running summary. */
export async function getNarratorConversation(user, partyId) {
  const access = await requireNarratorAccess(user, partyId);
  const [{ rows: turns }, { rows: memory }, history] = await Promise.all([
    pool.query('SELECT * FROM (SELECT * FROM solo_narrator_turns WHERE party_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) recent ORDER BY created_at, id', [partyId, TURNS_SHOWN]),
    pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]),
    getSessionHistory(user, partyId, { limit: 3 }),
  ]);
  const { language, glossary, mode } = await campaignLanguage(partyId);
  // What the narrator also reads from the campaign, shown so the player can see the story is shared: the latest
  // checkpoint (whoever saved it), the open threads and the summaries of finished sessions.
  const checkpoint = history.latestCheckpoint;
  return {
    turns: turns.map(turnOut),
    summary: memory[0]?.summary ?? '',
    language,
    mode,
    glossary: glossaryOut(language, glossary),
    campaign: {
      checkpoint: checkpoint ? { summary: checkpoint.summary, location: checkpoint.scene?.location ?? '', createdAt: checkpoint.createdAt } : null,
      openThreads: (access.campaign.open_threads ?? []).map((thread) => (typeof thread === 'string' ? thread : JSON.stringify(thread))).slice(0, 10),
      sessions: history.sessions.filter((session) => session.status === 'completed' && session.summary).slice(0, 3).map((session) => ({ title: session.title, summary: session.summary, endedAt: session.endedAt })),
    },
  };
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
  const { language, glossary, mode } = await campaignLanguage(partyId);
  return { turns: [], summary: '', language, mode, glossary: glossaryOut(language, glossary), campaign: null };
}

/** Folds the oldest exchanges into the summary once too many have piled up. Failures leave things as they were. */
export async function summariseIfNeeded(user, partyId, { callImpl = callModel } = {}) {
  const { language, glossary } = await campaignLanguage(partyId);
  const { rows: pending } = await pool.query(
    'SELECT id, role, content FROM solo_narrator_turns WHERE party_id = $1 AND NOT summarized ORDER BY created_at, id',
    [partyId],
  );
  if (pending.length <= SUMMARISE_WHEN) return false;
  const older = pending.slice(0, pending.length - RECENT_TURNS);
  const { rows: memory } = await pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]);
  const result = await callImpl(user, {
    messages: buildSummaryMessages({ summary: memory[0]?.summary ?? '', turns: older, language, glossary }),
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
 * One turn with the narrator in "suggest" mode (or when the model cannot use tools): the answer is only a story and
 * buttons the player may tap. One turn with the Solo narrator. The player says what the hero does; the narrator answers from the current game state
 * and the story so far. With `onDelta` the answer is passed on as it is written. Both sides of the exchange are kept,
 * and any rule actions the narrator proposes are checked against the game before they are returned.
 */
async function narrateSuggest(user, { partyId, message } = {}, { onDelta, signal } = {}, { toolsUnavailable = false } = {}) {
  await requireNarratorAccess(user, partyId);
  const said = String(message ?? '').trim();
  if (!said) throw new HttpError(400, 'Say what the hero does or asks', 'EMPTY_MESSAGE');
  const state = await getSoloState(user, partyId);
  if (!state?.solo?.enabled) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  const { latestCheckpoint } = await getSessionHistory(user, partyId, { limit: 1 });
  const narration = await campaignLanguage(partyId);

  const [{ rows: recent }, { rows: memory }] = await Promise.all([
    pool.query('SELECT role, content FROM solo_narrator_turns WHERE party_id = $1 AND NOT summarized ORDER BY created_at DESC, id DESC LIMIT $2', [partyId, RECENT_TURNS]),
    pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]),
  ]);
  const request = {
    messages: buildNarratorMessages({ state, checkpoint: latestCheckpoint, summary: memory[0]?.summary ?? '', history: recent.reverse(), message: said, language: normalizeNarrationLanguage(state.solo?.narrationLanguage), glossary: narration.glossary }),
    purpose: 'solo',
    partyId,
    temperature: 0.8,
    maxTokens: 800,
  };
  const result = onDelta ? await callModelStream(user, request, { onDelta, signal }) : await callModel(user, request);
  const reply = parseNarratorReply(result.text, state);

  const { rows: saved } = await pool.query(
    `INSERT INTO solo_narrator_turns (party_id, role, content, actions, tokens, cost_usd, cached_tokens, created_at)
     VALUES ($1, 'user', $2, NULL, NULL, NULL, NULL, now()), ($1, 'assistant', $3, $4, $5, $6, $7, now() + interval '1 millisecond')
     RETURNING id, role`,
    [partyId, said.slice(0, 2000), reply.text.slice(0, 8000), reply.actions.length ? JSON.stringify(reply.actions) : null, result.usage.promptTokens + result.usage.completionTokens, result.usage.costUsd, result.usage.cachedTokens ?? 0],
  );
  const assistantId = saved.find((row) => row.role === 'assistant')?.id;

  // The exchange also goes into the campaign's event log, so an AI assistant connected over MCP and the Solo journal
  // see the same story. It changes no game state, and a problem here never fails the turn.
  await recordNarration(user, { campaignId: partyId, said, narration: reply.text }).catch(() => null);
  // Tidying the story so far can happen after the answer has been delivered; it is never allowed to fail the turn.
  void summariseIfNeeded(user, partyId).catch(() => false);
  return { id: assistantId, text: reply.text, actions: reply.actions, toolCalls: [], awaiting: 0, mode: 'suggest', ...(toolsUnavailable ? { toolsUnavailable: true } : {}), model: result.model, usage: result.usage };
}

const sumUsage = (total, usage) => ({
  promptTokens: total.promptTokens + usage.promptTokens,
  completionTokens: total.completionTokens + usage.completionTokens,
  cachedTokens: total.cachedTokens + (usage.cachedTokens ?? 0),
  costUsd: usage.costUsd === null && total.costUsd === null ? null : (total.costUsd ?? 0) + (usage.costUsd ?? 0),
});
const NO_USAGE = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: null };

/** What a tool call tells the model about its outcome. */
function toolResultText(call) {
  if (call.status === 'done') return call.summary || 'Done.';
  if (call.status === 'failed') return `Problem: ${call.error || 'it did not work'}`;
  return 'The player declined this, or moved on. It did not happen. Do not describe it as done.';
}

/** The assistant and tool messages that replay what happened in earlier steps of a reply. */
export function replaySteps(steps) {
  const messages = [];
  for (const step of steps) {
    const calls = step.calls ?? [];
    if (calls.length === 0) {
      if (step.text) messages.push({ role: 'assistant', content: step.text });
      continue;
    }
    messages.push({ role: 'assistant', content: step.text || null, tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) } })) });
    for (const call of calls) messages.push({ role: 'tool', tool_call_id: call.id, content: toolResultText(call) });
  }
  return messages;
}

/** A short note of what the app did in a reply, kept with it so later turns remember it. */
export function appNotes(row) {
  const notes = toolCallsOf(row).filter((call) => ['done', 'declined'].includes(call.status)).map((call) => (call.status === 'done' ? `${call.label}: ${String(call.summary ?? '').slice(0, 140)}` : `declined: ${call.label}`));
  return notes.length ? `\n[App: ${notes.join(' | ').slice(0, 420)}]` : '';
}

/** The unsummarised conversation before `before` (or all of it), oldest first, with what the app did woven in. */
async function loadHistory(partyId, before = null) {
  const { rows } = await pool.query(
    `SELECT role, content, tool_calls FROM solo_narrator_turns
     WHERE party_id = $1 AND NOT summarized AND ($3::timestamptz IS NULL OR created_at < $3)
     ORDER BY created_at DESC, id DESC LIMIT $2`,
    [partyId, RECENT_TURNS, before],
  );
  return rows.reverse().map((row) => ({ role: row.role, content: row.role === 'assistant' ? `${row.content}${appNotes(row)}` : row.content }));
}

/** Calls waiting for the player when the player says something else are given up: the story has moved on. */
async function expirePending(partyId) {
  const { rows } = await pool.query("SELECT id, tool_calls FROM solo_narrator_turns WHERE party_id = $1 AND tool_calls::text LIKE '%\"status\": \"pending\"%'", [partyId]);
  for (const row of rows) {
    const steps = (row.tool_calls?.steps ?? []).map((step) => ({ ...step, calls: (step.calls ?? []).map((call) => (call.status === 'pending' ? { ...call, status: 'expired' } : call)) }));
    await pool.query('UPDATE solo_narrator_turns SET tool_calls = $2::jsonb WHERE id = $1', [row.id, JSON.stringify({ steps })]);
  }
}

/**
 * Runs the model and its tools until it has written the reply, or until it asks for something the player must approve.
 * `steps` collects what happened ({ text, calls }); calls that need approval are left 'pending' and end the run.
 */
async function runToolSteps({ user, partyId, messages, mode, steps, onDelta, onTool, signal }) {
  let usage = NO_USAGE;
  let model = null;
  let wrote = steps.some((step) => step.text);
  for (let index = 0; index < MAX_TOOL_STEPS; index += 1) {
    const lastChance = index === MAX_TOOL_STEPS - 1;
    let firstPiece = true;
    let result;
    try {
      result = await callModelWithTools(user, {
        messages, tools: lastChance ? [] : toolSpecs(), purpose: 'solo', partyId, temperature: 0.8, maxTokens: 800,
      }, { onDelta: (piece) => { if (!piece) return; if (firstPiece) { firstPiece = false; if (wrote) onDelta?.('\n\n'); wrote = true; } onDelta?.(piece); }, signal });
    } catch (error) {
      // After tools ran, an empty closing answer just means there was nothing more to say.
      if (index > 0 && error?.code === 'AI_EMPTY_ANSWER') break;
      throw error;
    }
    usage = sumUsage(usage, result.usage);
    model = result.model;
    const text = parseNarratorReply(result.text, null).text;
    const step = { text, calls: [] };
    steps.push(step);
    const calls = result.toolCalls.slice(0, MAX_CALLS_PER_STEP);
    if (calls.length === 0) break;
    messages.push({ role: 'assistant', content: text || null, tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })) });
    let waiting = false;
    for (const call of calls) {
      const tool = toolByName(call.name);
      let args = {};
      let problem = tool ? null : `There is no tool called ${call.name}.`;
      if (tool) { try { args = parseToolArguments(call.arguments); } catch (error) { problem = error.message; } }
      const record = { id: call.id, name: call.name, args, label: tool ? tool.label(args) : call.name, tier: tool?.tier ?? 'unknown', status: 'pending' };
      step.calls.push(record);
      if (problem) {
        Object.assign(record, { status: 'failed', error: problem });
      } else if (needsApproval(tool, mode)) {
        waiting = true;
        onTool?.(record);
        continue;
      } else {
        const outcome = await runTool(user, partyId, call.name, args);
        Object.assign(record, outcome.ok ? { status: 'done', summary: outcome.summary } : { status: 'failed', error: outcome.error });
      }
      onTool?.(record);
      messages.push({ role: 'tool', tool_call_id: call.id, content: toolResultText(record) });
    }
    if (waiting) break;
  }
  return { usage, model, wrote };
}

const joinText = (steps) => steps.map((step) => step.text).filter(Boolean).join('\n\n');
const countPending = (steps) => steps.reduce((total, step) => total + (step.calls ?? []).filter((call) => call.status === 'pending').length, 0);

/**
 * One turn with the Solo narrator. With tools (the campaign mode is "ask" or "trust") the narrator can roll dice and
 * use the same game operations as an AI assistant over MCP: rolls run at once, and changes to the hero or the story
 * wait for the player's approval unless the campaign lets the narrator act on its own. Both sides of the exchange are
 * kept. A model that cannot use tools falls back to plain suggestions.
 */
export async function narrateSolo(user, { partyId, message } = {}, { onDelta, onTool, signal } = {}) {
  await requireNarratorAccess(user, partyId);
  const said = String(message ?? '').trim();
  if (!said) throw new HttpError(400, 'Say what the hero does or asks', 'EMPTY_MESSAGE');
  const state = await getSoloState(user, partyId);
  if (!state?.solo?.enabled) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  const narration = await campaignLanguage(partyId);
  if (narration.mode === 'suggest') return narrateSuggest(user, { partyId, message }, { onDelta, signal });

  await expirePending(partyId);
  const { latestCheckpoint } = await getSessionHistory(user, partyId, { limit: 1 });
  const [history, { rows: memory }] = await Promise.all([loadHistory(partyId), pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId])]);
  const messages = buildNarratorMessages({ state, checkpoint: latestCheckpoint, summary: memory[0]?.summary ?? '', history, message: said, language: normalizeNarrationLanguage(state.solo?.narrationLanguage), glossary: narration.glossary, withTools: true });
  const steps = [];
  let outcome;
  try {
    outcome = await runToolSteps({ user, partyId, messages, mode: narration.mode, steps, onDelta, onTool, signal });
  } catch (error) {
    if (error?.code === 'AI_TOOLS_UNSUPPORTED' && steps.length === 0) return narrateSuggest(user, { partyId, message }, { onDelta, signal }, { toolsUnavailable: true });
    throw error;
  }
  const text = joinText(steps);
  const hasCalls = steps.some((step) => step.calls.length > 0);

  const { rows: saved } = await pool.query(
    `INSERT INTO solo_narrator_turns (party_id, role, content, actions, tool_calls, tokens, cost_usd, cached_tokens, created_at)
     VALUES ($1, 'user', $2, NULL, NULL, NULL, NULL, NULL, now()), ($1, 'assistant', $3, NULL, $4::jsonb, $5, $6, $7, now() + interval '1 millisecond')
     RETURNING id, role`,
    [partyId, said.slice(0, 2000), text.slice(0, 8000), hasCalls ? JSON.stringify({ steps }) : null, outcome.usage.promptTokens + outcome.usage.completionTokens, outcome.usage.costUsd, outcome.usage.cachedTokens],
  );
  const assistantId = saved.find((row) => row.role === 'assistant')?.id;
  if (text) await recordNarration(user, { campaignId: partyId, said, narration: text }).catch(() => null);
  void summariseIfNeeded(user, partyId).catch(() => false);
  const calls = steps.flatMap((step) => step.calls);
  return { id: assistantId, text, actions: [], toolCalls: calls.map(({ id, name, args, label, tier, status, summary, error }) => ({ id, name, args, label, tier, status, summary: summary ?? null, error: error ?? null })), awaiting: countPending(steps), mode: narration.mode, model: outcome.model, usage: outcome.usage };
}

/** Reads a reply that is waiting on the player and the message it answers, for approving, declining and resuming. */
async function loadWaitingTurn(db, partyId, turnId, { lock = false } = {}) {
  if (!UUID.test(String(turnId || ''))) throw new HttpError(400, 'turnId is required', 'INVALID_TURN');
  const { rows } = await db.query(`SELECT * FROM solo_narrator_turns WHERE id = $1 AND party_id = $2 AND role = 'assistant'${lock ? ' FOR UPDATE' : ''}`, [turnId, partyId]);
  if (!rows[0]) throw new HttpError(404, 'That reply was not found', 'TURN_NOT_FOUND');
  return rows[0];
}

/** The player approves or declines one call the narrator is waiting on. An approved call runs now, as the player. */
export async function decideToolCall(user, { partyId, turnId, callId, decision } = {}) {
  await requireNarratorAccess(user, partyId);
  if (!['approve', 'decline'].includes(decision)) throw new HttpError(400, 'Choose approve or decline', 'INVALID_DECISION');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await loadWaitingTurn(client, partyId, turnId, { lock: true });
    const steps = row.tool_calls?.steps ?? [];
    const call = steps.flatMap((step) => step.calls ?? []).find((entry) => entry.id === callId);
    if (!call) throw new HttpError(404, 'That action was not found', 'CALL_NOT_FOUND');
    if (call.status !== 'pending') throw new HttpError(409, 'That action has already been decided', 'ALREADY_DECIDED');
    if (decision === 'decline') {
      call.status = 'declined';
    } else {
      const outcome = await runTool(user, partyId, call.name, call.args, { approved: true });
      Object.assign(call, outcome.ok ? { status: 'done', summary: outcome.summary } : { status: 'failed', error: outcome.error });
    }
    const { rows: updated } = await client.query('UPDATE solo_narrator_turns SET tool_calls = $2::jsonb WHERE id = $1 RETURNING *', [row.id, JSON.stringify({ steps })]);
    await client.query('COMMIT');
    return { turn: turnOut(updated[0]), awaiting: countPending(steps) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Carries on a reply once every call that waited for the player has been decided: the narrator is told what happened
 * (or that the player declined) and writes the rest of the scene, which is added to the same reply.
 */
const resuming = new Set();

export async function resumeSolo(user, { partyId, turnId } = {}, { onDelta, onTool, signal } = {}) {
  await requireNarratorAccess(user, partyId);
  if (resuming.has(turnId)) throw new HttpError(409, 'The narrator is already carrying on', 'ALREADY_RESUMING');
  resuming.add(turnId);
  try {
    return await carryOn(user, { partyId, turnId }, { onDelta, onTool, signal });
  } finally {
    resuming.delete(turnId);
  }
}

async function carryOn(user, { partyId, turnId }, { onDelta, onTool, signal }) {
  const row = await loadWaitingTurn(pool, partyId, turnId);
  const steps = row.tool_calls?.steps ?? [];
  if (steps.length === 0) throw new HttpError(409, 'There is nothing to carry on', 'NOTHING_TO_RESUME');
  if (countPending(steps) > 0) throw new HttpError(409, 'Decide the waiting actions first', 'ACTIONS_WAITING');
  const lastStep = steps[steps.length - 1];
  if ((lastStep.calls ?? []).length === 0) throw new HttpError(409, 'This reply is already finished', 'ALREADY_FINISHED');

  const state = await getSoloState(user, partyId);
  const narration = await campaignLanguage(partyId);
  const { rows: asked } = await pool.query("SELECT content, created_at FROM solo_narrator_turns WHERE party_id = $1 AND role = 'user' AND created_at < $2 ORDER BY created_at DESC LIMIT 1", [partyId, row.created_at]);
  const { latestCheckpoint } = await getSessionHistory(user, partyId, { limit: 1 });
  const [history, { rows: memory }] = await Promise.all([loadHistory(partyId, asked[0]?.created_at ?? row.created_at), pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId])]);
  const messages = [
    ...buildNarratorMessages({ state, checkpoint: latestCheckpoint, summary: memory[0]?.summary ?? '', history, message: asked[0]?.content ?? '', language: normalizeNarrationLanguage(state.solo?.narrationLanguage), glossary: narration.glossary, withTools: true }),
    ...replaySteps(steps),
  ];
  const before = steps.length;
  const outcome = await runToolSteps({ user, partyId, messages, mode: narration.mode, steps, onDelta, onTool, signal });
  const added = steps.slice(before);
  const addedText = joinText(added);
  const { rows: updated } = await pool.query(
    `UPDATE solo_narrator_turns SET
       content = left(CASE WHEN $2 = '' THEN content ELSE content || chr(10) || chr(10) || $2 END, 8000),
       tool_calls = $3::jsonb, tokens = COALESCE(tokens, 0) + $4,
       cost_usd = CASE WHEN $5::numeric IS NULL THEN cost_usd ELSE COALESCE(cost_usd, 0) + $5::numeric END,
       cached_tokens = COALESCE(cached_tokens, 0) + $6
     WHERE id = $1 RETURNING *`,
    [row.id, addedText, JSON.stringify({ steps }), outcome.usage.promptTokens + outcome.usage.completionTokens, outcome.usage.costUsd, outcome.usage.cachedTokens],
  );
  if (addedText) await recordNarration(user, { campaignId: partyId, said: '(the story continues)', narration: addedText }).catch(() => null);
  void summariseIfNeeded(user, partyId).catch(() => false);
  const turn = turnOut(updated[0]);
  return { id: turn.id, text: addedText, fullText: turn.content, actions: [], toolCalls: turn.toolCalls, awaiting: countPending(steps), mode: narration.mode, model: outcome.model, usage: outcome.usage };
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

/** Turns the session recap draft into readable prose with the GM's own model. The GM edits the result before using it. */
export async function polishRecap(user, { partyId, draft } = {}) {
  const text = String(draft ?? '').trim();
  if (!text) throw new HttpError(400, 'There is nothing to polish yet', 'EMPTY_DRAFT');
  if (!UUID.test(String(partyId || ''))) throw new HttpError(400, 'partyId is required', 'INVALID_CAMPAIGN');
  const access = await loadCampaignAccess(pool, user, partyId);
  if (!access?.isGm) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
  const result = await callModel(user, { messages: buildRecapMessages(text, ...Object.values(await campaignLanguage(partyId))), purpose: 'recap', partyId, temperature: 0.5, maxTokens: 500 });
  return { text: result.text, model: result.model, usage: result.usage };
}

/**
 * "Plan a story": proposes the next mission from the player's one-line idea, the story so far and the earlier missions.
 * Nothing is created: the player edits the proposal in the start form first.
 */
export async function proposeMission(user, { partyId, idea } = {}) {
  await requireNarratorAccess(user, partyId);
  const state = await getSoloState(user, partyId);
  if (!state?.solo?.enabled) throw new HttpError(409, 'Solo mode is not switched on for this campaign.', 'SOLO_NOT_ENABLED');
  const [{ rows: memory }, { rows: missions }, { rows: completions }, narration] = await Promise.all([
    pool.query('SELECT summary FROM solo_narrator_memory WHERE party_id = $1', [partyId]),
    pool.query("SELECT id, title, objective, status FROM solo_missions WHERE campaign_id = $1 AND status IN ('success', 'failure', 'abandoned') ORDER BY completed_at DESC NULLS LAST LIMIT 5", [partyId]),
    pool.query("SELECT payload FROM campaign_events WHERE campaign_id = $1 AND type = 'solo.mission_completed' ORDER BY sequence DESC LIMIT 20", [partyId]),
    campaignLanguage(partyId),
  ]);
  const summaryOf = new Map(completions.map((row) => [row.payload?.missionId, String(row.payload?.summary ?? '')]));
  const context = missionContext({
    hero: state.playerCharacter ? { name: state.playerCharacter.name, description: state.playerCharacter.description } : null,
    storySoFar: memory[0]?.summary ?? '',
    pastMissions: missions.map((mission) => ({ title: mission.title, outcome: mission.status, objective: mission.objective, summary: summaryOf.get(mission.id) ?? '' })),
    openThreads: (state.journal?.openThreads ?? []).map((thread) => (typeof thread === 'string' ? thread : JSON.stringify(thread))),
  });
  const result = await callModel(user, {
    messages: buildMissionMessages({ idea, context, language: narration.language, glossary: narration.glossary }),
    purpose: 'solo-mission',
    partyId,
    temperature: 0.9,
    maxTokens: 1000,
  });
  const mission = parseMissionProposal(result.text);
  if (!mission) throw new HttpError(502, 'The narrator did not come back with a usable mission. Try again, or write it yourself.', 'MISSION_UNREADABLE');
  return { mission, model: result.model, usage: result.usage };
}
