import { authenticatedApiFetch } from '../supabase';

export type UserRole = 'player' | 'dm' | 'admin';

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  last_seen_at: string | null;
  has_password: boolean;
  character_count: number;
  owned_campaigns: number;
  campaign_count: number;
  active_sessions: number;
}

export interface UserImpact {
  user: { id: string; email: string; username: string | null; role: UserRole; is_active: boolean };
  characters: number;
  notes: number;
  messages: number;
  campaign_memberships: number;
  owned_campaigns: { id: string; name: string; other_members: number }[];
  restricted_content: Record<string, number>;
  keepable_content: Record<string, number>;
  needs_transfer: boolean;
}

export interface AuditEntry {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  details: Record<string, unknown>;
}

export class AdminApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await authenticatedApiFetch(`/admin${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: string } };
  if (!response.ok) {
    throw new AdminApiError(payload.error?.message || response.statusText || 'Request failed', payload.error?.code, response.status);
  }
  return payload;
}

export const fetchAdminUsers = () => request<{ users: AdminUser[] }>('GET', '/users').then((result) => result.users);

export const fetchUserImpact = (id: string) => request<UserImpact>('GET', `/users/${id}/impact`);

export type AdminUserChanges = Partial<{
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
}>;

export const updateAdminUser = (id: string, changes: AdminUserChanges) =>
  request<{ user: AdminUser }>('PATCH', `/users/${id}`, changes);

export const resetUserPassword = (id: string, password?: string) =>
  request<{ password: string; generated: boolean; sessionsRevoked: number }>('POST', `/users/${id}/reset-password`, password ? { password } : {});

export const revokeUserSessions = (id: string) =>
  request<{ sessionsRevoked: number }>('POST', `/users/${id}/revoke-sessions`);

export const deleteAdminUser = (id: string, options: { confirmEmail: string; transferTo?: string | null }) =>
  request<{ deleted: { id: string; email: string; username: string | null }; transferred: Record<string, number> }>(
    'DELETE', `/users/${id}`, options,
  );

export const fetchAuditLog = (options: { limit?: number; userId?: string } = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.userId) params.set('user', options.userId);
  const query = params.toString();
  return request<{ entries: AuditEntry[] }>('GET', `/audit${query ? `?${query}` : ''}`).then((result) => result.entries);
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.update': 'Edited account',
  'user.deactivate': 'Deactivated account',
  'user.reactivate': 'Reactivated account',
  'user.reset_password': 'Reset password',
  'user.revoke_sessions': 'Signed out everywhere',
  'user.delete': 'Deleted account',
  'backups.prune': 'Removed old database dumps',
};

export function displayName(user: Pick<AdminUser, 'username' | 'first_name' | 'last_name' | 'email'>): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return user.username || full || user.email.split('@')[0];
}
