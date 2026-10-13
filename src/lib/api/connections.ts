import { authenticatedApiFetch } from '../supabase';

export interface ConnectedApp {
  clientId: string;
  name: string;
  scopes: string[];
  connectedAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface PersonalToken {
  id: string;
  name: string;
  access: 'read' | 'write';
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface ConnectionsOverview {
  mcpUrl: string;
  authorizationServer: string;
  scopes: Array<{ id: string; label: string }>;
  maxTokens: number;
  tokenLifetimes: number[];
  apps: ConnectedApp[];
  tokens: PersonalToken[];
}

export interface CreatedToken {
  /** The secret. Shown once; only a hash is stored. */
  token: string;
  id: string;
  name: string;
  access: 'read' | 'write';
  expiresAt: string | null;
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedApiFetch(path, init);
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || response.statusText || 'Request failed');
  return payload;
}

export const fetchConnections = () => send<ConnectionsOverview>('/account/connections');

export const createToken = (input: { name: string; access: 'read' | 'write'; days: number }) => send<CreatedToken>('/account/connections/tokens', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(input),
});

export const revokeToken = (id: string) => send<{ revoked: boolean }>(`/account/connections/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const disconnectApp = (clientId: string) => send<{ revoked: boolean }>(`/account/connections/apps/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
