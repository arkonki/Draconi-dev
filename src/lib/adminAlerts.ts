import { authenticatedApiFetch } from './supabase';

export interface AlertEventView {
  id: string;
  label: string;
  description: string;
  /** 'immediate' events email at once (with a cooldown); 'digest' events are collected into a summary. */
  mode: 'immediate' | 'digest';
  enabled: boolean;
}

export interface AlertsAdminView {
  enabled: boolean;
  mailEnabled: boolean;
  extraRecipients: string[];
  /** Everyone who would get an alert right now: active administrators plus the extra recipients. */
  recipients: string[];
  digestMinutes: number;
  events: AlertEventView[];
}

export interface AlertsDraft {
  enabled: boolean;
  events: Record<string, boolean>;
  extraRecipients: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || response.statusText || 'The alert settings request failed');
  }
  return response.json() as Promise<T>;
}

export const fetchAlertSettings = () => request<AlertsAdminView>('/admin/alerts');
export const saveAlertSettings = (draft: AlertsDraft) => request<AlertsAdminView>('/admin/alerts', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
});
export const sendTestAlert = () => request<{ ok: boolean; recipients: string[] }>('/admin/alerts/test', { method: 'POST' });
