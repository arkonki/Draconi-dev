import { authenticatedApiFetch } from './supabase';

export interface HousekeepingResult {
  reason: string;
  skipped?: string;
  deletedSessions?: number;
  deletedChangeEvents?: number;
  sessionBatches?: number;
  changeEventBatches?: number;
  backlogRemaining?: boolean;
}

export interface HousekeepingStatus {
  enabled: boolean;
  running: boolean;
  config: {
    intervalMinutes: number;
    expiredSessionRetentionHours: number;
    changeEventRetentionDays: number;
    batchSize: number;
    maxBatches: number;
  };
  nextRunAt: string | null;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastReason: string | null;
  lastResult: HousekeepingResult | null;
  lastError: string | null;
  pending: {
    expiredSessions: number;
    changeEvents: number;
  };
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return new Error(payload.error?.message || response.statusText || 'Maintenance request failed');
}

export async function getHousekeepingStatus() {
  const response = await authenticatedApiFetch('/admin/housekeeping');
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<HousekeepingStatus>;
}

export async function runHousekeeping() {
  const response = await authenticatedApiFetch('/admin/housekeeping/run', { method: 'POST' });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<HousekeepingResult>;
}
