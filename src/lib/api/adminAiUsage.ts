import { authenticatedApiFetch } from '../supabase';

export interface AiUsageUser {
  userId: string;
  username: string;
  email: string;
  hasKey: boolean;
  model: string | null;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** The part of the input the provider served from its cache. */
  cachedTokens: number;
  costUsd: number | null;
  lastUsedAt: string | null;
  byPurpose: Record<string, { calls: number; tokens: number }>;
  limits: { monthlyCostCapUsd: number | null; monthlyTokenCap: number | null; reached: boolean };
}

export interface AiUsageOverview {
  month: string;
  isCurrentMonth: boolean;
  months: string[];
  totals: { calls: number; promptTokens: number; completionTokens: number; cachedTokens: number; costUsd: number | null; people: number };
  users: AiUsageUser[];
}

export async function fetchAiUsage(month?: string): Promise<AiUsageOverview> {
  const response = await authenticatedApiFetch(`/admin/ai-usage${month ? `?month=${encodeURIComponent(month)}` : ''}`);
  const payload = await response.json().catch(() => ({})) as AiUsageOverview & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || response.statusText || 'Request failed');
  return payload;
}

const PURPOSE_NAMES: Record<string, string> = { story: 'Story Helper', solo: 'Narrator', 'solo-summary': 'Story summary', recap: 'Recap', 'loot-item': 'Loot item' };
export const purposeName = (purpose: string) => PURPOSE_NAMES[purpose] ?? purpose;
