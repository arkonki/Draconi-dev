import { pool } from './db.js';
import { HttpError } from './http.js';
import { decryptSecret, encryptSecret, secretIsUsable } from './aiCrypto.js';

// Each person's own OpenRouter key and model for the built-in AI (the Story Helper and the Solo narrator). The key is
// stored encrypted, is never sent back to the browser, and is only used by the server to call the model for that
// same person. Every call is counted so the person can see what they use.

export const DEFAULT_AI_MODEL = 'google/gemini-2.0-flash-001';
// Only suggestions: any model id that OpenRouter offers can be typed in.
export const SUGGESTED_MODELS = Object.freeze([
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
]);
// The address can be overridden to reach OpenRouter through a proxy, or to point a test at a stand-in server.
export const OPENROUTER_BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{3,100}$/;
const MAX_CALLS_PER_MINUTE = Number(process.env.AI_CALLS_PER_MINUTE) > 0 ? Number(process.env.AI_CALLS_PER_MINUTE) : 20;
const REQUEST_TIMEOUT_MS = 60_000;

const encryptionSecret = () => process.env.AI_KEY_ENCRYPTION_SECRET;
export const aiKeyStorageAvailable = () => secretIsUsable(encryptionSecret());

/** Checks what the person sent when saving. Pure, so it is tested without a database. */
export function parseSettingsUpdate(body) {
  const update = {};
  if (body?.apiKey !== undefined) {
    const apiKey = String(body.apiKey ?? '').trim();
    // eslint-disable-next-line no-control-regex
    if (apiKey.length < 8 || apiKey.length > 300 || /[\s\u0000-\u001f]/.test(apiKey)) {
      throw new HttpError(400, 'That does not look like an API key', 'INVALID_AI_KEY');
    }
    update.apiKey = apiKey;
  }
  if (body?.model !== undefined) {
    const model = String(body.model ?? '').trim();
    if (!MODEL_PATTERN.test(model)) throw new HttpError(400, 'Enter a model id such as google/gemini-2.0-flash-001', 'INVALID_AI_MODEL');
    update.model = model;
  }
  // A limit is a positive number; an empty value or null removes it.
  if (body?.monthlyCostCapUsd !== undefined) {
    const raw = body.monthlyCostCapUsd;
    if (raw === null || raw === '') update.monthlyCostCapUsd = null;
    else {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0 || value > 100_000) throw new HttpError(400, 'The money limit must be a positive amount in US dollars', 'INVALID_AI_LIMIT');
      update.monthlyCostCapUsd = Math.round(value * 100) / 100;
    }
  }
  if (body?.monthlyTokenCap !== undefined) {
    const raw = body.monthlyTokenCap;
    if (raw === null || raw === '') update.monthlyTokenCap = null;
    else {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1000 || value > 2_000_000_000) throw new HttpError(400, 'The token limit must be a whole number of at least 1000', 'INVALID_AI_LIMIT');
      update.monthlyTokenCap = value;
    }
  }
  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to save', 'NOTHING_TO_SAVE');
  return update;
}

export const keyHint = (apiKey) => `…${apiKey.slice(-4)}`;

/**
 * Whether this month's use has reached a limit the person set. `used` holds the month's tokens and cost. A cost limit
 * can only count what the provider reports a cost for; the token limit counts everything. Returns the message, or null.
 */
export function capReached({ costCapUsd, tokenCap }, used) {
  if (tokenCap !== null && tokenCap !== undefined && used.tokens >= tokenCap) {
    return `You have used your monthly limit of ${Number(tokenCap).toLocaleString('en-US')} tokens. Raise it in Settings → AI Assistants to continue.`;
  }
  if (costCapUsd !== null && costCapUsd !== undefined && used.costUsd >= Number(costCapUsd)) {
    return `You have reached your monthly limit of $${Number(costCapUsd).toFixed(2)}. Raise it in Settings → AI Assistants to continue.`;
  }
  return null;
}

const monthlyUse = async (userId) => {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS calls, COALESCE(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(sum(completion_tokens), 0)::bigint AS completion_tokens, COALESCE(sum(cost_usd), 0) AS cost_usd, COALESCE(sum(cached_tokens), 0)::bigint AS cached_tokens,
            count(cost_usd)::int AS priced_calls
     FROM ai_usage WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  const row = rows[0];
  return { calls: row.calls, promptTokens: Number(row.prompt_tokens), completionTokens: Number(row.completion_tokens), cachedTokens: Number(row.cached_tokens), tokens: Number(row.prompt_tokens) + Number(row.completion_tokens), costUsd: Number(row.cost_usd), pricedCalls: row.priced_calls };
};

/** Reads the provider's usage block. `cachedTokens` is the part of the input served from the provider's prompt cache. */
export function readUsage(usage) {
  const block = usage ?? {};
  return {
    promptTokens: Math.max(0, Math.round(Number(block.prompt_tokens) || 0)),
    completionTokens: Math.max(0, Math.round(Number(block.completion_tokens) || 0)),
    cachedTokens: Math.max(0, Math.round(Number(block.prompt_tokens_details?.cached_tokens) || 0)),
    costUsd: block.cost !== null && block.cost !== undefined && Number.isFinite(Number(block.cost)) ? Number(block.cost) : null,
  };
}

/**
 * Providers that cache prompts only when asked (Anthropic's models do) need the fixed start of the conversation marked.
 * Others cache a repeated start by themselves, so nothing is changed for them.
 */
export function withCacheControl(model, messages) {
  if (!String(model).startsWith('anthropic/') || messages[0]?.role !== 'system' || typeof messages[0].content !== 'string') return messages;
  return [{ role: 'system', content: [{ type: 'text', text: messages[0].content, cache_control: { type: 'ephemeral' } }] }, ...messages.slice(1)];
}

/** Turns the provider's answer into text and usage, or a clear error. Pure. */
export function interpretModelResponse(status, payload) {
  if (status === 401 || status === 403) {
    throw new HttpError(502, 'OpenRouter did not accept your API key. Check it in Settings → AI Assistants.', 'AI_KEY_REJECTED');
  }
  if (status === 402) throw new HttpError(402, 'Your OpenRouter account is out of credits.', 'AI_OUT_OF_CREDITS');
  if (status === 429) throw new HttpError(429, 'OpenRouter is rate limiting this key. Try again in a moment.', 'AI_RATE_LIMITED');
  if (status < 200 || status >= 300) {
    const detail = String(payload?.error?.message ?? '').slice(0, 200);
    throw new HttpError(502, `The AI service returned an error${detail ? `: ${detail}` : ` (${status})`}.`, 'AI_PROVIDER_ERROR');
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'The AI service returned an empty answer.', 'AI_EMPTY_ANSWER');
  return { text: text.trim(), usage: readUsage(payload?.usage) };
}

const recentCalls = new Map();
/** At most MAX_CALLS_PER_MINUTE model calls per person, so a stuck page cannot run up a bill. */
export function allowCall(userId, now = Date.now()) {
  const recent = (recentCalls.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= MAX_CALLS_PER_MINUTE) {
    recentCalls.set(userId, recent);
    return false;
  }
  recent.push(now);
  recentCalls.set(userId, recent);
  return true;
}

/**
 * Reads the provider's server-sent events. Feed it text as it arrives; it calls `onEvent` with each parsed JSON
 * event and `onDone` at the end marker. Lines that are comments or not JSON are ignored. Pure.
 */
export function createSseParser({ onEvent, onDone }) {
  let buffer = '';
  const handleLine = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { onDone?.(); return; }
    try { onEvent(JSON.parse(data)); } catch { /* a partial or foreign line is skipped */ }
  };
  return {
    feed(chunk) {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        handleLine(buffer.slice(0, index).replace(/\r$/, ''));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
    },
    end() {
      if (buffer) handleLine(buffer.replace(/\r$/, ''));
      buffer = '';
    },
  };
}

/** A rough token count (about four characters each) for when the provider reports none. */
export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4);

export async function getAiSettings(user) {
  const [{ rows: settings }, usage] = await Promise.all([
    pool.query('SELECT api_key_encrypted IS NOT NULL AS has_key, key_hint, model, monthly_cost_cap_usd, monthly_token_cap FROM user_ai_settings WHERE user_id = $1', [user.id]),
    monthlyUse(user.id),
  ]);
  const row = settings[0];
  const costCapUsd = row?.monthly_cost_cap_usd === null || row?.monthly_cost_cap_usd === undefined ? null : Number(row.monthly_cost_cap_usd);
  const tokenCap = row?.monthly_token_cap ?? null;
  return {
    storageAvailable: aiKeyStorageAvailable(),
    hasKey: Boolean(row?.has_key),
    keyHint: row?.has_key ? row.key_hint : null,
    model: row?.model ?? DEFAULT_AI_MODEL,
    defaultModel: DEFAULT_AI_MODEL,
    suggestedModels: SUGGESTED_MODELS,
    usageThisMonth: {
      calls: usage.calls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      costUsd: usage.pricedCalls > 0 ? usage.costUsd : null,
    },
    limits: { monthlyCostCapUsd: costCapUsd, monthlyTokenCap: tokenCap, reached: capReached({ costCapUsd, tokenCap }, usage) !== null },
  };
}

/** Asks OpenRouter whether it accepts the key. Only a clear rejection blocks saving; a network problem does not. */
async function keyIsRejected(apiKey, fetchImpl) {
  try {
    const response = await fetchImpl(`${OPENROUTER_BASE}/auth/key`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    return response.status === 401 || response.status === 403;
  } catch {
    return false;
  }
}

export async function saveAiSettings(user, body, { fetchImpl = fetch } = {}) {
  const update = parseSettingsUpdate(body);
  if (update.apiKey) {
    if (!aiKeyStorageAvailable()) {
      throw new HttpError(503, 'This server is not set up to store API keys yet. The administrator needs to set AI_KEY_ENCRYPTION_SECRET.', 'AI_STORAGE_UNAVAILABLE');
    }
    if (await keyIsRejected(update.apiKey, fetchImpl)) {
      throw new HttpError(400, 'OpenRouter did not accept this key. Copy it again from openrouter.ai/keys.', 'AI_KEY_REJECTED');
    }
  }
  const has = (name) => Object.prototype.hasOwnProperty.call(update, name);
  await pool.query(
    `INSERT INTO user_ai_settings (user_id, api_key_encrypted, key_hint, model, monthly_cost_cap_usd, monthly_token_cap)
     VALUES ($1, $2, $3, COALESCE($4, $5), $7::numeric, $9::integer)
     ON CONFLICT (user_id) DO UPDATE SET
       api_key_encrypted = COALESCE($2, user_ai_settings.api_key_encrypted),
       key_hint = COALESCE($3, user_ai_settings.key_hint),
       model = COALESCE($4, user_ai_settings.model),
       monthly_cost_cap_usd = CASE WHEN $6::boolean THEN $7::numeric ELSE user_ai_settings.monthly_cost_cap_usd END,
       monthly_token_cap = CASE WHEN $8::boolean THEN $9::integer ELSE user_ai_settings.monthly_token_cap END,
       updated_at = now()`,
    [
      user.id,
      update.apiKey ? encryptSecret(update.apiKey, encryptionSecret()) : null,
      update.apiKey ? keyHint(update.apiKey) : null,
      update.model ?? null,
      DEFAULT_AI_MODEL,
      has('monthlyCostCapUsd'),
      update.monthlyCostCapUsd ?? null,
      has('monthlyTokenCap'),
      update.monthlyTokenCap ?? null,
    ],
  );
  return getAiSettings(user);
}

export async function removeAiKey(user) {
  await pool.query('UPDATE user_ai_settings SET api_key_encrypted = NULL, key_hint = NULL, updated_at = now() WHERE user_id = $1', [user.id]);
  return getAiSettings(user);
}

/** The person's stored key and model, with the checks every model call needs. */
async function prepareCall(user) {
  const { rows } = await pool.query('SELECT api_key_encrypted, model, monthly_cost_cap_usd, monthly_token_cap FROM user_ai_settings WHERE user_id = $1', [user.id]);
  const row = rows[0];
  if (!row?.api_key_encrypted) {
    throw new HttpError(409, 'Add your OpenRouter API key in Settings → AI Assistants first.', 'AI_KEY_MISSING');
  }
  const apiKey = decryptSecret(row.api_key_encrypted, encryptionSecret());
  if (!apiKey) {
    throw new HttpError(409, 'Your stored API key can no longer be read. Enter it again in Settings → AI Assistants.', 'AI_KEY_UNREADABLE');
  }
  if (row.monthly_cost_cap_usd !== null || row.monthly_token_cap !== null) {
    const message = capReached({ costCapUsd: row.monthly_cost_cap_usd, tokenCap: row.monthly_token_cap }, await monthlyUse(user.id));
    if (message) throw new HttpError(402, message, 'AI_LIMIT_REACHED');
  }
  if (!allowCall(user.id)) throw new HttpError(429, 'Too many AI requests in a minute. Wait a moment.', 'AI_TOO_MANY_REQUESTS');
  return { apiKey, model: row.model };
}

const requestHeaders = (apiKey) => ({
  authorization: `Bearer ${apiKey}`,
  'content-type': 'application/json',
  'http-referer': process.env.PUBLIC_BASE_URL || 'http://localhost',
  'x-title': 'Dragonbane Manager',
});

async function recordUsage(user, { partyId, purpose, model, usage }) {
  await pool.query(
    'INSERT INTO ai_usage (user_id, party_id, purpose, model, prompt_tokens, completion_tokens, cached_tokens, cost_usd) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [user.id, partyId, purpose, model, usage.promptTokens, usage.completionTokens, usage.cachedTokens ?? 0, usage.costUsd],
  );
}

/**
 * Sends a conversation to the person's model and records what it cost. `purpose` says what it was for ('story',
 * 'solo'), `partyId` which campaign.
 */
export async function callModel(user, { messages, purpose, partyId = null, temperature = 0.7, maxTokens = 1200 }, { fetchImpl = fetch } = {}) {
  const { apiKey, model } = await prepareCall(user);
  let response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({ model, messages: withCacheControl(model, messages), temperature, max_tokens: maxTokens, usage: { include: true } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(504, 'The AI service did not answer in time.', 'AI_TIMEOUT');
  }
  const payload = await response.json().catch(() => ({}));
  const result = interpretModelResponse(response.status, payload);
  await recordUsage(user, { partyId, purpose, model, usage: result.usage });
  return { text: result.text, model, usage: result.usage };
}

/**
 * Like callModel, but hands the answer over piece by piece through `onDelta` as it is written. `signal` stops the
 * request, for example when the reader goes away. Returns the full text and usage at the end.
 */
export async function callModelStream(user, { messages, purpose, partyId = null, temperature = 0.7, maxTokens = 1200 }, { onDelta, signal, fetchImpl = fetch } = {}) {
  const { apiKey, model } = await prepareCall(user);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2);
  let response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({ model, messages: withCacheControl(model, messages), temperature, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, usage: { include: true } }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new HttpError(504, 'The AI service did not answer in time.', 'AI_TIMEOUT');
  }
  if (!response.ok) {
    interpretModelResponse(response.status, await response.json().catch(() => ({})));
  }

  let text = '';
  let reported = null;
  const parser = createSseParser({
    onEvent: (event) => {
      const piece = event?.choices?.[0]?.delta?.content;
      if (typeof piece === 'string' && piece) { text += piece; onDelta?.(piece); }
      if (event?.usage) reported = event.usage;
    },
  });
  try {
    const decoder = new TextDecoder();
    for await (const chunk of response.body) parser.feed(decoder.decode(chunk, { stream: true }));
    parser.end();
  } catch {
    throw new HttpError(504, 'The AI service stopped answering.', 'AI_STREAM_INTERRUPTED');
  }
  if (!text.trim()) throw new HttpError(502, 'The AI service returned an empty answer.', 'AI_EMPTY_ANSWER');
  const usage = reported
    ? readUsage(reported)
    : { promptTokens: estimateTokens(JSON.stringify(messages)), completionTokens: estimateTokens(text), cachedTokens: 0, costUsd: null };
  await recordUsage(user, { partyId, purpose, model, usage });
  return { text: text.trim(), model, usage };
}

/**
 * One step of a conversation in which the model may call tools. The answer is streamed through `onDelta`; any tool
 * calls it makes are collected and returned for the caller to run. The caller sends the results back in a further call.
 * Returns the text, the calls ({ id, name, arguments } with the arguments still as the model wrote them) and the usage.
 * A model that cannot use tools is reported as AI_TOOLS_UNSUPPORTED, so the caller can fall back to plain narration.
 */
export async function callModelWithTools(user, { messages, tools, purpose, partyId = null, temperature = 0.7, maxTokens = 1200 }, { onDelta, signal, fetchImpl = fetch } = {}) {
  const { apiKey, model } = await prepareCall(user);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2);
  let response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({ model, messages: withCacheControl(model, messages), ...(tools?.length ? { tools, tool_choice: 'auto' } : {}), temperature, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true }, usage: { include: true } }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new HttpError(504, 'The AI service did not answer in time.', 'AI_TIMEOUT');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if ((response.status === 404 || response.status === 400) && /tool/i.test(String(payload?.error?.message ?? ''))) {
      throw new HttpError(502, 'This model cannot use tools. Choose another model in Settings → AI Assistants, or let the narrator only make suggestions.', 'AI_TOOLS_UNSUPPORTED');
    }
    interpretModelResponse(response.status, payload);
  }

  let text = '';
  let reported = null;
  const calls = [];
  const parser = createSseParser({
    onEvent: (event) => {
      const delta = event?.choices?.[0]?.delta;
      if (typeof delta?.content === 'string' && delta.content) { text += delta.content; onDelta?.(delta.content); }
      for (const piece of Array.isArray(delta?.tool_calls) ? delta.tool_calls : []) {
        const index = Number.isInteger(piece.index) ? piece.index : calls.length;
        const call = calls[index] ?? (calls[index] = { id: '', name: '', arguments: '' });
        if (piece.id) call.id = piece.id;
        if (piece.function?.name) call.name += piece.function.name;
        if (typeof piece.function?.arguments === 'string') call.arguments += piece.function.arguments;
      }
      if (event?.usage) reported = event.usage;
    },
  });
  try {
    const decoder = new TextDecoder();
    for await (const chunk of response.body) parser.feed(decoder.decode(chunk, { stream: true }));
    parser.end();
  } catch {
    throw new HttpError(504, 'The AI service stopped answering.', 'AI_STREAM_INTERRUPTED');
  }
  const toolCalls = calls.filter((call) => call?.name).map((call, index) => ({ id: call.id || `call_${index}`, name: call.name, arguments: call.arguments }));
  if (!text.trim() && toolCalls.length === 0) throw new HttpError(502, 'The AI service returned an empty answer.', 'AI_EMPTY_ANSWER');
  const usage = reported
    ? readUsage(reported)
    : { promptTokens: estimateTokens(JSON.stringify(messages)), completionTokens: estimateTokens(text + JSON.stringify(toolCalls)), cachedTokens: 0, costUsd: null };
  await recordUsage(user, { partyId, purpose, model, usage });
  return { text: text.trim(), toolCalls, model, usage };
}
