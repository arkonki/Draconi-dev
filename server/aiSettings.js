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
const MAX_CALLS_PER_MINUTE = 20;
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
  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to save', 'NOTHING_TO_SAVE');
  return update;
}

export const keyHint = (apiKey) => `…${apiKey.slice(-4)}`;

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
  const usage = payload?.usage ?? {};
  return {
    text: text.trim(),
    usage: {
      promptTokens: Math.max(0, Math.round(Number(usage.prompt_tokens) || 0)),
      completionTokens: Math.max(0, Math.round(Number(usage.completion_tokens) || 0)),
      costUsd: Number.isFinite(Number(usage.cost)) && usage.cost !== null && usage.cost !== undefined ? Number(usage.cost) : null,
    },
  };
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

export async function getAiSettings(user) {
  const [{ rows: settings }, { rows: usage }] = await Promise.all([
    pool.query('SELECT api_key_encrypted IS NOT NULL AS has_key, key_hint, model FROM user_ai_settings WHERE user_id = $1', [user.id]),
    pool.query(
      `SELECT count(*)::int AS calls, COALESCE(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
              COALESCE(sum(completion_tokens), 0)::bigint AS completion_tokens, sum(cost_usd) AS cost_usd
       FROM ai_usage WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [user.id],
    ),
  ]);
  const row = settings[0];
  const month = usage[0];
  return {
    storageAvailable: aiKeyStorageAvailable(),
    hasKey: Boolean(row?.has_key),
    keyHint: row?.has_key ? row.key_hint : null,
    model: row?.model ?? DEFAULT_AI_MODEL,
    defaultModel: DEFAULT_AI_MODEL,
    suggestedModels: SUGGESTED_MODELS,
    usageThisMonth: {
      calls: month.calls,
      promptTokens: Number(month.prompt_tokens),
      completionTokens: Number(month.completion_tokens),
      costUsd: month.cost_usd === null ? null : Number(month.cost_usd),
    },
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
  await pool.query(
    `INSERT INTO user_ai_settings (user_id, api_key_encrypted, key_hint, model)
     VALUES ($1, $2, $3, COALESCE($4, $5))
     ON CONFLICT (user_id) DO UPDATE SET
       api_key_encrypted = COALESCE($2, user_ai_settings.api_key_encrypted),
       key_hint = COALESCE($3, user_ai_settings.key_hint),
       model = COALESCE($4, user_ai_settings.model),
       updated_at = now()`,
    [user.id, update.apiKey ? encryptSecret(update.apiKey, encryptionSecret()) : null, update.apiKey ? keyHint(update.apiKey) : null, update.model ?? null, DEFAULT_AI_MODEL],
  );
  return getAiSettings(user);
}

export async function removeAiKey(user) {
  await pool.query('UPDATE user_ai_settings SET api_key_encrypted = NULL, key_hint = NULL, updated_at = now() WHERE user_id = $1', [user.id]);
  return getAiSettings(user);
}

/**
 * Sends a conversation to the person's model and records what it cost. `purpose` says what it was for ('story',
 * 'solo'), `partyId` which campaign.
 */
export async function callModel(user, { messages, purpose, partyId = null, temperature = 0.7, maxTokens = 1200 }, { fetchImpl = fetch } = {}) {
  const { rows } = await pool.query('SELECT api_key_encrypted, model FROM user_ai_settings WHERE user_id = $1', [user.id]);
  const row = rows[0];
  if (!row?.api_key_encrypted) {
    throw new HttpError(409, 'Add your OpenRouter API key in Settings → AI Assistants first.', 'AI_KEY_MISSING');
  }
  const apiKey = decryptSecret(row.api_key_encrypted, encryptionSecret());
  if (!apiKey) {
    throw new HttpError(409, 'Your stored API key can no longer be read. Enter it again in Settings → AI Assistants.', 'AI_KEY_UNREADABLE');
  }
  if (!allowCall(user.id)) throw new HttpError(429, 'Too many AI requests in a minute. Wait a moment.', 'AI_TOO_MANY_REQUESTS');

  let response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'http-referer': process.env.PUBLIC_BASE_URL || 'http://localhost',
        'x-title': 'Dragonbane Manager',
      },
      body: JSON.stringify({ model: row.model, messages, temperature, max_tokens: maxTokens, usage: { include: true } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(504, 'The AI service did not answer in time.', 'AI_TIMEOUT');
  }
  const payload = await response.json().catch(() => ({}));
  const result = interpretModelResponse(response.status, payload);
  await pool.query(
    'INSERT INTO ai_usage (user_id, party_id, purpose, model, prompt_tokens, completion_tokens, cost_usd) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [user.id, partyId, purpose, row.model, result.usage.promptTokens, result.usage.completionTokens, result.usage.costUsd],
  );
  return { text: result.text, model: row.model, usage: result.usage };
}
