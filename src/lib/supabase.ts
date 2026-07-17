import type { RealtimeChannel, RealtimePostgresChangesPayload, Session, User } from './localBackend.types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const SESSION_KEY = 'dragonbane_local_session';

export interface LocalApiError {
  message: string;
  code?: string;
  status?: number;
}

type LocalUser = User;
type LocalSession = Session;

type QueryRow = Record<string, unknown>;
type QueryResult<T> = { data: T | null; error: LocalApiError | null; count: number | null; status: number; statusText: string };
type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
type AuthListener = (event: AuthEvent, session: LocalSession | null) => void;

function storedSession(): LocalSession | null {
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as LocalSession : null;
  } catch {
    return null;
  }
}

function storeSession(session: LocalSession | null) {
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

function authHeaders(extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  const token = storedSession()?.access_token;
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

export function authenticatedApiFetch(path: string, init: RequestInit = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${API_BASE}${normalizedPath}`, { ...init, headers: authHeaders(init.headers) });
}

export function clearLocalSession() {
  storeSession(null);
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<{ data: T | null; error: LocalApiError | null; status: number }> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers: authHeaders(init.headers) });
    const payload = await response.json().catch(() => ({})) as { data?: T; error?: LocalApiError | string } & Record<string, unknown>;
    if (!response.ok) {
      const error = typeof payload.error === 'string' ? { message: payload.error } : payload.error;
      return { data: null, error: { message: error?.message || response.statusText, code: error?.code, status: response.status }, status: response.status };
    }
    return { data: (payload.data ?? payload) as T, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Network request failed', code: 'NETWORK_ERROR' },
      status: 0,
    };
  }
}

interface QueryFilter {
  operator: string;
  column?: string;
  value?: unknown;
  notOperator?: string;
}

interface QueryOrder {
  column: string;
  ascending?: boolean;
  nullsLast?: boolean;
}

class LocalQueryBuilder<T = QueryRow[]> implements PromiseLike<QueryResult<T>> {
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selection = '*';
  private filters: QueryFilter[] = [];
  private orders: QueryOrder[] = [];
  private maximum: number | undefined;
  private payload: unknown;
  private conflictTarget: string | undefined;

  constructor(private readonly table: string) {}

  select(columns = '*') {
    this.selection = columns;
    return this;
  }

  insert(values: unknown) {
    this.action = 'insert';
    this.payload = values;
    return this;
  }

  update(values: unknown) {
    this.action = 'update';
    this.payload = values;
    return this;
  }

  upsert(values: unknown, options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.payload = values;
    this.conflictTarget = options?.onConflict;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ operator: 'eq', column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ operator: 'gt', column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ operator: 'is', column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ operator: 'in', column, value: values });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ operator: 'ilike', column, value: pattern });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({ operator: 'not', notOperator: operator, column, value });
    return this;
  }

  or(expression: string) {
    this.filters.push({ operator: 'or', value: expression });
    return this;
  }

  match(values: Record<string, unknown>) {
    this.filters.push({ operator: 'match', value: values });
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending, nullsLast: options.nullsFirst === undefined ? true : !options.nullsFirst });
    return this;
  }

  limit(value: number) {
    this.maximum = value;
    return this;
  }

  returns<TResult>() {
    return this as unknown as LocalQueryBuilder<TResult>;
  }

  async single<TResult = QueryRow>(): Promise<QueryResult<TResult>> {
    const result = await this.execute<QueryRow[]>();
    if (result.error) return { ...result, data: null } as QueryResult<TResult>;
    if (!result.data || result.data.length !== 1) {
      return {
        data: null,
        error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', status: 406 },
        count: result.data?.length ?? 0,
        status: 406,
        statusText: 'Not Acceptable',
      };
    }
    return { ...result, data: result.data[0] as TResult };
  }

  async maybeSingle<TResult = QueryRow>(): Promise<QueryResult<TResult>> {
    const result = await this.execute<QueryRow[]>();
    if (result.error) return { ...result, data: null } as QueryResult<TResult>;
    if (!result.data || result.data.length === 0) return { ...result, data: null } as QueryResult<TResult>;
    if (result.data.length > 1) {
      return {
        data: null,
        error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116', status: 406 },
        count: result.data.length,
        status: 406,
        statusText: 'Not Acceptable',
      };
    }
    return { ...result, data: result.data[0] as TResult };
  }

  private async execute<TResult = T>(): Promise<QueryResult<TResult>> {
    const result = await apiRequest<QueryRow[]>('/data/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        table: this.table,
        action: this.action,
        selection: this.selection,
        filters: this.filters,
        orders: this.orders,
        limit: this.maximum,
        payload: this.payload,
        onConflict: this.conflictTarget,
      }),
    });
    return {
      data: result.data as TResult | null,
      error: result.error,
      count: Array.isArray(result.data) ? result.data.length : null,
      status: result.status,
      statusText: result.error ? 'Error' : 'OK',
    };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute<T>().then(onfulfilled, onrejected);
  }
}

class LocalRealtimeChannel {
  private bindings: Array<{
    event: string;
    table: string;
    filter?: string;
    callback: (payload: RealtimePostgresChangesPayload<QueryRow>) => void;
  }> = [];
  private timer: number | null = null;
  private afterId = 0;

  on(
    _type: 'postgres_changes',
    binding: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: RealtimePostgresChangesPayload<QueryRow>) => void,
  ) {
    this.bindings.push({ event: binding.event, table: binding.table, filter: binding.filter, callback });
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    window.setTimeout(() => callback?.('SUBSCRIBED'), 0);
    this.timer = window.setInterval(() => void this.poll(callback), 1200);
    return this as unknown as RealtimeChannel;
  }

  unsubscribe() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    return Promise.resolve('ok');
  }

  private async poll(statusCallback?: (status: string) => void) {
    const result = await apiRequest<{ events: Array<Record<string, unknown>>; lastId: number }>('/realtime/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        afterId: this.afterId,
        bindings: this.bindings.map(({ event, table, filter }) => ({ event, table, filter })),
      }),
    });
    if (result.error || !result.data) {
      statusCallback?.('CHANNEL_ERROR');
      return;
    }
    this.afterId = result.data.lastId;
    result.data.events.forEach((event) => {
      const binding = this.bindings.find((candidate) =>
        candidate.table === event.table_name && (candidate.event === '*' || candidate.event === event.event_type));
      if (!binding) return;
      binding.callback({
        schema: 'public',
        table: String(event.table_name),
        commit_timestamp: String(event.created_at),
        eventType: String(event.event_type),
        new: (event.new_record || {}) as QueryRow,
        old: (event.old_record || {}) as QueryRow,
        errors: null,
      } as RealtimePostgresChangesPayload<QueryRow>);
    });
  }
}

const authListeners = new Set<AuthListener>();
function notifyAuth(event: AuthEvent, session: LocalSession | null) {
  authListeners.forEach((listener) => listener(event, session));
}

const localAuth = {
  async getSession() {
    const session = storedSession();
    if (!session) return { data: { session: null }, error: null };
    const result = await apiRequest<{ session: LocalSession | null }>('/auth/session');
    const fresh = result.data?.session ?? null;
    storeSession(fresh);
    return { data: { session: fresh }, error: result.error };
  },
  async getUser() {
    const result = await apiRequest<{ user: LocalUser }>('/auth/user');
    return { data: { user: result.data?.user ?? null }, error: result.error };
  },
  async signInWithPassword(credentials: { email: string; password: string }) {
    const result = await apiRequest<{ user: LocalUser; session: LocalSession }>('/auth/sign-in', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
    });
    const session = result.data?.session ?? null;
    if (session) {
      storeSession(session);
      notifyAuth('SIGNED_IN', session);
    }
    return { data: { user: result.data?.user ?? null, session }, error: result.error };
  },
  async signUp(credentials: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const result = await apiRequest<{ user: LocalUser; session: LocalSession | null }>('/auth/sign-up', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
    });
    const session = result.data?.session ?? null;
    if (session) {
      storeSession(session);
      notifyAuth('SIGNED_IN', session);
    }
    return { data: { user: result.data?.user ?? null, session }, error: result.error };
  },
  async signOut() {
    const result = await apiRequest<Record<string, never>>('/auth/sign-out', { method: 'POST' });
    storeSession(null);
    notifyAuth('SIGNED_OUT', null);
    return { error: result.error };
  },
  async refreshSession() {
    const result = await localAuth.getSession();
    if (result.data.session) notifyAuth('TOKEN_REFRESHED', result.data.session);
    return result;
  },
  async updateUser(attributes: { password?: string; email?: string }) {
    const result = await apiRequest<{ user: LocalUser }>('/auth/user', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(attributes),
    });
    if (result.data?.user) {
      const session = storedSession();
      if (session) {
        const updatedSession = { ...session, user: result.data.user };
        storeSession(updatedSession);
        notifyAuth('USER_UPDATED', updatedSession);
      }
    }
    return { data: { user: result.data?.user ?? null }, error: result.error };
  },
  onAuthStateChange(listener: AuthListener) {
    authListeners.add(listener);
    window.setTimeout(() => listener('INITIAL_SESSION', storedSession()), 0);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
  },
  startAutoRefresh() {},
  stopAutoRefresh() {},
};

class LocalStorageBucket {
  constructor(private readonly bucket: string) {}

  async upload(objectPath: string, file: Blob, options: { upsert?: boolean } = {}) {
    const result = await apiRequest<{ path: string; fullPath: string }>(`/storage/${this.bucket}/${encodeObjectPath(objectPath)}`, {
      method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': String(Boolean(options.upsert)) }, body: file,
    });
    return { data: result.data, error: result.error };
  }

  async list(folder = '', options: { limit?: number } = {}) {
    const suffix = folder ? `/${encodeObjectPath(folder)}` : '';
    const result = await apiRequest<QueryRow[]>(`/storage/${this.bucket}${suffix}?limit=${options.limit || 100}`);
    return { data: result.data, error: result.error };
  }

  async remove(paths: string[]) {
    const result = await apiRequest<QueryRow[]>(`/storage/${this.bucket}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths }),
    });
    return { data: result.data, error: result.error };
  }

  getPublicUrl(objectPath: string) {
    return { data: { publicUrl: `${window.location.origin}${API_BASE}/storage/public/${this.bucket}/${encodeObjectPath(objectPath)}` } };
  }
}

function encodeObjectPath(value: string) {
  return value.split('/').map(encodeURIComponent).join('/');
}

export const supabase = {
  auth: localAuth,
  from(table: string) {
    return new LocalQueryBuilder(table);
  },
  rpc<TResult = unknown>(name: string, args: Record<string, unknown> = {}) {
    return apiRequest<TResult>(`/rpc/${encodeURIComponent(name)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
    });
  },
  functions: {
    async invoke<TResult = unknown>(name: string, options: { body?: unknown } = {}) {
      const result = await apiRequest<TResult>(`/functions/${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(options.body || {}),
      });
      return { data: result.data, error: result.error };
    },
  },
  storage: {
    from(bucket: string) {
      return new LocalStorageBucket(bucket);
    },
  },
  channel() {
    return new LocalRealtimeChannel() as unknown as RealtimeChannel;
  },
  async removeChannel(channel: RealtimeChannel) {
    await channel.unsubscribe();
    return 'ok' as const;
  },
};

export async function checkBackendConnection() {
  const result = await apiRequest<{ status: string }>('/health');
  return !result.error && result.data?.status === 'ok';
}
