import { authenticatedApiFetch } from '../supabase';

export interface AdminConnection {
  kind: 'app' | 'token';
  userId: string;
  username: string;
  email: string;
  /** The app's client id, or the first characters of a personal token's hash. */
  id: string;
  name: string;
  access: 'read' | 'write';
  connectedAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init);
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || response.statusText || 'Request failed');
  return payload;
}

export async function fetchAdminConnections(): Promise<AdminConnection[]> {
  return (await send<{ connections: AdminConnection[] }>('/admin/connections')).connections;
}

export const revokeAdminConnection = (input: { userId: string; kind: 'app' | 'token' | 'all'; id?: string }) =>
  send<{ revoked: boolean; ended: number }>('/admin/connections/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
