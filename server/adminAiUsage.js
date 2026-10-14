import { pool } from './db.js';
import { HttpError } from './http.js';
import { requireAdmin } from './adminUsers.js';
import { capReached } from './aiSettings.js';

// An administrator's view of who uses the built-in AI and how much, month by month. Keys are never shown, only whether
// someone has one. The money figures are what OpenRouter reported; requests with no reported cost count as none.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "2026-10" to the first moment of that month and of the next, in UTC. Pure. */
export function monthRange(month, now = new Date()) {
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const value = month ?? current;
  const match = MONTH.exec(String(value));
  if (!match) throw new HttpError(400, 'month must look like 2026-10', 'INVALID_MONTH');
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return { month: value, start: new Date(Date.UTC(year, index, 1)), end: new Date(Date.UTC(year, index + 1, 1)), isCurrent: value === current };
}

/** The last `count` months, newest first, as "YYYY-MM". Pure. */
export function recentMonths(count = 6, now = new Date()) {
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export async function aiUsageOverview(actor, { month } = {}) {
  requireAdmin(actor);
  const range = monthRange(month);
  const [{ rows: usage }, { rows: purposes }, { rows: people }] = await Promise.all([
    pool.query(
      `SELECT user_id, count(*)::int AS calls, COALESCE(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
              COALESCE(sum(completion_tokens), 0)::bigint AS completion_tokens, COALESCE(sum(cached_tokens), 0)::bigint AS cached_tokens,
              COALESCE(sum(cost_usd), 0) AS cost_usd, count(cost_usd)::int AS priced_calls, max(created_at) AS last_used_at
       FROM ai_usage WHERE created_at >= $1 AND created_at < $2 GROUP BY user_id`,
      [range.start, range.end],
    ),
    pool.query(
      `SELECT user_id, purpose, count(*)::int AS calls, (COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0))::bigint AS tokens
       FROM ai_usage WHERE created_at >= $1 AND created_at < $2 GROUP BY user_id, purpose`,
      [range.start, range.end],
    ),
    // Everyone who used it this month, and everyone who has a key even if they have not used it.
    pool.query(
      `SELECT u.id, u.username, u.email, s.api_key_encrypted IS NOT NULL AS has_key, s.model, s.monthly_cost_cap_usd, s.monthly_token_cap
       FROM users u LEFT JOIN user_ai_settings s ON s.user_id = u.id
       WHERE s.api_key_encrypted IS NOT NULL OR u.id IN (SELECT user_id FROM ai_usage WHERE created_at >= $1 AND created_at < $2)`,
      [range.start, range.end],
    ),
  ]);
  const usageByUser = new Map(usage.map((row) => [row.user_id, row]));
  const purposesByUser = new Map();
  for (const row of purposes) {
    const map = purposesByUser.get(row.user_id) ?? {};
    map[row.purpose] = { calls: row.calls, tokens: Number(row.tokens) };
    purposesByUser.set(row.user_id, map);
  }

  const users = people.map((person) => {
    const row = usageByUser.get(person.id);
    const promptTokens = Number(row?.prompt_tokens ?? 0);
    const completionTokens = Number(row?.completion_tokens ?? 0);
    const costUsd = row && row.priced_calls > 0 ? Number(row.cost_usd) : null;
    const costCapUsd = person.monthly_cost_cap_usd === null ? null : Number(person.monthly_cost_cap_usd);
    const tokenCap = person.monthly_token_cap ?? null;
    return {
      userId: person.id,
      username: person.username,
      email: person.email,
      hasKey: person.has_key,
      model: person.model ?? null,
      calls: row?.calls ?? 0,
      promptTokens,
      completionTokens,
      cachedTokens: Number(row?.cached_tokens ?? 0),
      costUsd,
      lastUsedAt: row?.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      byPurpose: purposesByUser.get(person.id) ?? {},
      limits: { monthlyCostCapUsd: costCapUsd, monthlyTokenCap: tokenCap, reached: capReached({ costCapUsd, tokenCap }, { tokens: promptTokens + completionTokens, costUsd: costUsd ?? 0 }) !== null },
    };
  }).sort((left, right) => (right.promptTokens + right.completionTokens) - (left.promptTokens + left.completionTokens) || left.username.localeCompare(right.username));

  const sum = (pick) => users.reduce((total, user) => total + pick(user), 0);
  return {
    month: range.month,
    isCurrentMonth: range.isCurrent,
    months: recentMonths(),
    totals: {
      calls: sum((user) => user.calls),
      promptTokens: sum((user) => user.promptTokens),
      completionTokens: sum((user) => user.completionTokens),
      cachedTokens: sum((user) => user.cachedTokens),
      costUsd: users.some((user) => user.costUsd !== null) ? sum((user) => user.costUsd ?? 0) : null,
      people: users.filter((user) => user.calls > 0).length,
    },
    users,
  };
}
