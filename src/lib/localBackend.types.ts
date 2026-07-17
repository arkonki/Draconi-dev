export interface User {
  id: string;
  email?: string;
  role?: string;
  aud?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: User;
}

export interface RealtimePostgresChangesPayload<T extends Record<string, unknown>> {
  schema: string;
  table: string;
  commit_timestamp: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
  errors: string[] | null;
}

export interface RealtimeChannel {
  on(
    type: 'postgres_changes',
    binding: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  ): RealtimeChannel;
  subscribe(callback?: (status: string) => void): RealtimeChannel;
  unsubscribe(): PromiseLike<unknown> | unknown;
}

export interface RealtimeClient {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): PromiseLike<unknown> | unknown;
}
