import { authenticatedApiFetch } from '../supabase';

export type CampaignTimeUnit = 'round' | 'stretch' | 'shift';
export type CampaignTimeAdvanceUnit = CampaignTimeUnit | 'day';

export interface CampaignGameTime {
  schemaVersion: 'game-time-v1';
  elapsedSeconds: number;
  rounds: number;
  stretches: number;
  shifts: number;
}

export interface CampaignSessionSummary {
  id: string;
  title: string;
  status: 'active' | 'completed';
  gmNotes?: string | null;
  startedAt?: string | null;
}

export interface CampaignTimeReminder {
  id: string;
  label: string;
  diceExpression: string;
  intervalUnit: CampaignTimeUnit;
  intervalCount: number;
  nextDueCount: number;
  notes?: string | null;
  active: boolean;
}

export interface CampaignTimeNotification {
  id: string;
  label: string;
  diceExpression: string;
  notes?: string | null;
  dueUnit: CampaignTimeUnit;
  dueCount: number;
  createdAt: string;
}

export interface CampaignTimeState {
  campaignRevision: number;
  gameTime: CampaignGameTime;
  activeSession: CampaignSessionSummary | null;
  tracker: { currentDay: number; currentShift: number } | null;
  reminders: CampaignTimeReminder[];
  pendingNotifications: CampaignTimeNotification[];
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string; code?: string; details?: unknown };
}

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) {
    const error = new Error(payload.error?.message || fallback) as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function writeHeaders(revision: number) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'if-match': `"${revision}"`,
    'idempotency-key': crypto.randomUUID(),
  };
}

export async function fetchCampaignTimeState(partyId: string): Promise<CampaignTimeState> {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/time`, {
    headers: { accept: 'application/json' },
  });
  return parseResponse(response, 'Could not load campaign time.');
}

export async function advanceCampaignTime(
  partyId: string, revision: number, unit: CampaignTimeAdvanceUnit, amount: number,
) {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/time/advance`, {
    method: 'POST', headers: writeHeaders(revision),
    body: JSON.stringify({ unit, amount, reason: `The GM advanced campaign time by ${amount} ${unit}(s).` }),
  });
  return parseResponse(response, 'Could not advance campaign time.');
}

export async function startCampaignSession(
  partyId: string, revision: number, input: { title: string; gmNotes?: string },
) {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/sessions/start`, {
    method: 'POST', headers: writeHeaders(revision),
    body: JSON.stringify({ title: input.title, gm_notes: input.gmNotes || undefined, reason: 'The GM started the game session.' }),
  });
  return parseResponse(response, 'Could not start the session.');
}

export async function endCampaignSession(
  partyId: string, sessionId: string, revision: number,
  input: { summary: string; unresolvedThreads: string[] },
) {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/sessions/${sessionId}/complete`, {
    method: 'POST', headers: writeHeaders(revision),
    body: JSON.stringify({ summary: input.summary, unresolved_threads: input.unresolvedThreads, reason: 'The GM ended the game session.' }),
  });
  return parseResponse(response, 'Could not end the session.');
}

export async function createCampaignTimeReminder(
  partyId: string, revision: number,
  input: { label: string; diceExpression: string; intervalUnit: CampaignTimeUnit; intervalCount: number; notes?: string },
) {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/time/reminders`, {
    method: 'POST', headers: writeHeaders(revision),
    body: JSON.stringify({
      label: input.label, dice_expression: input.diceExpression, interval_unit: input.intervalUnit,
      interval_count: input.intervalCount, notes: input.notes || undefined,
      reason: 'The GM created a campaign-time roll reminder.',
    }),
  });
  return parseResponse(response, 'Could not create the roll reminder.');
}

export async function setCampaignTimeReminderActive(
  partyId: string, reminderId: string, revision: number, active: boolean,
) {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/time/reminders/${reminderId}`, {
    method: 'PATCH', headers: writeHeaders(revision),
    body: JSON.stringify({ active, reason: `The GM ${active ? 'enabled' : 'paused'} the roll reminder.` }),
  });
  return parseResponse(response, 'Could not update the roll reminder.');
}

export async function resolveCampaignTimeNotification(
  partyId: string, notificationId: string, revision: number,
) {
  const response = await authenticatedApiFetch(`/v1/campaigns/${partyId}/time/notifications/${notificationId}/resolve`, {
    method: 'POST', headers: writeHeaders(revision),
    body: JSON.stringify({ reason: 'The GM handled the due roll.' }),
  });
  return parseResponse(response, 'Could not mark the roll as handled.');
}
