import { authenticatedApiFetch } from '../supabase';

export type TrustedRollOutcome = 'dragon' | 'demon' | 'success' | 'failure' | null;

export interface TrustedRecordedRoll {
  id: string;
  source: 'server' | 'manual' | 'mixed';
  expression: string;
  dice: number[];
  keptIndices: number[];
  keptValues: number[];
  previousRollId: string | null;
  result: {
    total?: number | null;
    outcome?: TrustedRollOutcome;
    modifier?: 'normal' | 'boon' | 'bane';
    targetValue?: number | null;
    pushCondition?: string | null;
  } & Record<string, unknown>;
  createdAt: string;
}

export interface TrustedRollRequest {
  id: string;
  campaignId: string;
  sessionId: string | null;
  encounterId: string | null;
  actorId: string | null;
  assignedUserId: string | null;
  purpose: string;
  expression: string;
  rollKind: 'generic' | 'check' | 'damage' | 'recovery' | 'advancement';
  targetValue: number | null;
  modifier: 'normal' | 'boon' | 'bane';
  mode: 'player' | 'server' | 'mixed';
  visibility: 'gm' | 'players' | 'assigned';
  pushedFromRequestId: string | null;
  pushCondition: string | null;
  status: 'pending' | 'resolved' | 'expired';
  createdAt: string;
  result: {
    source: 'server' | 'manual';
    submittedBy: string | null;
    createdAt: string;
    roll: TrustedRecordedRoll;
  } | null;
}

export interface TrustedRollHistory {
  campaignRevision: number;
  requests: TrustedRollRequest[];
}

export async function fetchTrustedRollHistory(
  campaignId: string,
  options: { encounterId?: string | null; limit?: number } = {},
): Promise<TrustedRollHistory> {
  const query = new URLSearchParams();
  if (options.encounterId) query.set('encounterId', options.encounterId);
  query.set('limit', String(options.limit || 30));
  const response = await authenticatedApiFetch(
    `/v1/campaigns/${encodeURIComponent(campaignId)}/roll-requests?${query}`,
  );
  const payload = await response.json().catch(() => ({})) as {
    data?: TrustedRollHistory;
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message || 'Failed to load trusted roll history.');
  }
  return payload.data;
}
