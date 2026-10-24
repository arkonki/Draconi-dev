import { authenticatedApiFetch } from './supabase';

export interface SmtpFormSettings {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  from: string;
}

export interface SmtpAdminView {
  /** Where the active setup comes from: saved in the app, the server's environment file, or nowhere. */
  source: 'database' | 'environment' | 'none';
  enabled: boolean;
  settings: SmtpFormSettings;
  passwordSet: boolean;
  passwordUnreadable: boolean;
  passwordStorageAvailable: boolean;
}

/** `password`: leave out to keep the current one, `null` to remove it, text to replace it. */
export interface SmtpDraft extends SmtpFormSettings {
  password?: string | null;
}

async function failure(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return new Error(payload.error?.message || response.statusText || 'The email settings request failed');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init);
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

export const fetchSmtpSettings = () => request<SmtpAdminView>('/admin/smtp');
export const saveSmtpSettings = (draft: SmtpDraft) => request<SmtpAdminView>('/admin/smtp', json('PUT', draft));
export const removeSmtpSettings = () => request<SmtpAdminView>('/admin/smtp', { method: 'DELETE' });
export const sendSmtpTestEmail = (draft?: SmtpDraft) =>
  request<{ ok: boolean; to: string; response: string }>('/admin/smtp/test', json('POST', draft ? { settings: draft } : {}));
