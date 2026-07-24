import type { RealtimeChannel, RealtimePostgresChangesPayload, Session, User } from './localBackend.types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || `${import.meta.env.BASE_URL}api`).replace(/\/$/, '');
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

interface LocalRealtimeEvent {
  id: number;
  table_name: string;
  event_type: 'INSERT' | 'UPDATE' | 'DELETE';
  created_at: string;
  new_record?: QueryRow | null;
  old_record?: QueryRow | null;
}

interface LocalRealtimeBinding {
  event: string;
  table: string;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload<QueryRow>) => void;
}

const REALTIME_POLL_MS = 4000;
const REALTIME_RETRY_BASE_MS = 500;
const REALTIME_MAX_RETRY_MS = 5_000;
const REALTIME_FAILURES_BEFORE_DEGRADED = 3;
const REALTIME_SOCKET_RECONNECT_BASE_MS = 1000;
const REALTIME_SOCKET_MAX_RECONNECT_MS = 30_000;
const REALTIME_SOCKET_CONNECT_TIMEOUT_MS = 8000;

type LocalRealtimeServerMessage =
  | { type: 'authenticated' }
  | { type: 'subscribed'; events: LocalRealtimeEvent[]; lastId: number }
  | { type: 'events'; events: LocalRealtimeEvent[]; lastId: number }
  | { type: 'error'; error?: LocalApiError };

function realtimeSocketUrl() {
  const apiUrl = new URL(API_BASE, window.location.origin);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/realtime/socket`;
  apiUrl.search = '';
  apiUrl.hash = '';
  return apiUrl.toString();
}

function bindingMatchesEvent(binding: LocalRealtimeBinding, event: LocalRealtimeEvent) {
  if (binding.table !== event.table_name || (binding.event !== '*' && binding.event !== event.event_type)) {
    return false;
  }

  if (!binding.filter) {
    return true;
  }

  const separator = '=eq.';
  const separatorIndex = binding.filter.indexOf(separator);
  if (separatorIndex === -1) {
    return true;
  }

  const column = binding.filter.slice(0, separatorIndex);
  const expected = binding.filter.slice(separatorIndex + separator.length);
  const row = event.new_record || event.old_record;
  return Boolean(row && String(row[column]) === expected);
}

class LocalRealtimeTransport {
  private channels = new Set<LocalRealtimeChannel>();
  private timer: number | null = null;
  private afterId: number | null = null;
  private inFlight = false;
  private state: 'idle' | 'connecting' | 'subscribed' | 'error' = 'idle';
  private requestGeneration = 0;
  private requestController: AbortController | null = null;
  private consecutiveFailures = 0;
  private pollingActive = false;
  private socket: WebSocket | null = null;
  private socketGeneration = 0;
  private socketAuthenticated = false;
  private socketSubscribed = false;
  private socketFailures = 0;
  private socketReconnectTimer: number | null = null;
  private socketConnectTimer: number | null = null;

  register(channel: LocalRealtimeChannel) {
    this.channels.add(channel);

    if (this.state === 'subscribed') {
      channel.notifyStatus('SUBSCRIBED');
    }

    if (this.channels.size === 1 && !this.socket && !this.inFlight && !this.pollingActive) {
      this.start();
    } else if (this.socketAuthenticated) {
      this.sendSocketSubscription();
    }
  }

  unregister(channel: LocalRealtimeChannel) {
    this.channels.delete(channel);
    if (this.channels.size === 0) {
      this.stop();
    } else if (this.socketAuthenticated) {
      this.sendSocketSubscription();
    }
  }

  private start() {
    if (typeof WebSocket === 'undefined' || !storedSession()?.access_token) {
      this.startPolling();
      return;
    }
    this.connectSocket();
  }

  private connectSocket() {
    if (this.channels.size === 0 || this.socket) {
      return;
    }
    if (this.socketReconnectTimer !== null) {
      window.clearTimeout(this.socketReconnectTimer);
      this.socketReconnectTimer = null;
    }

    const token = storedSession()?.access_token;
    if (!token || typeof WebSocket === 'undefined') {
      this.startPolling();
      return;
    }

    const generation = ++this.socketGeneration;
    this.socketAuthenticated = false;
    this.socketSubscribed = false;
    if (this.state !== 'subscribed') this.state = 'connecting';

    let socket: WebSocket;
    try {
      socket = new WebSocket(realtimeSocketUrl());
    } catch {
      this.handleSocketClose(generation);
      return;
    }
    this.socket = socket;

    this.socketConnectTimer = window.setTimeout(() => {
      if (this.socket === socket && !this.socketSubscribed) {
        this.closeSocketWhenReady(socket, 1000, 'Realtime connection timeout');
      }
    }, REALTIME_SOCKET_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (this.socket !== socket || generation !== this.socketGeneration) return;
      socket.send(JSON.stringify({ type: 'authenticate', accessToken: token }));
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || generation !== this.socketGeneration) return;
      try {
        this.handleSocketMessage(JSON.parse(String(event.data)) as LocalRealtimeServerMessage);
      } catch {
        socket.close(1002, 'Invalid realtime message');
      }
    };
    socket.onerror = () => {
      // The close event owns fallback and reconnect scheduling.
    };
    socket.onclose = () => {
      if (this.socket !== socket || generation !== this.socketGeneration) return;
      this.socket = null;
      this.handleSocketClose(generation);
    };
  }

  private handleSocketMessage(message: LocalRealtimeServerMessage) {
    if (message.type === 'authenticated') {
      this.socketAuthenticated = true;
      this.sendSocketSubscription();
      return;
    }

    if (message.type === 'error') {
      this.socket?.close(1011, message.error?.message || 'Realtime server error');
      return;
    }

    if (message.type === 'subscribed') {
      const recovered = this.state !== 'subscribed';
      this.applyEvents(message.events, message.lastId, this.afterId !== null);
      this.socketSubscribed = true;
      this.socketFailures = 0;
      this.clearSocketConnectTimer();
      this.stopPolling();
      this.state = 'subscribed';
      if (recovered) this.notifyAll('SUBSCRIBED');
      return;
    }

    if (message.type === 'events') {
      this.applyEvents(message.events, message.lastId, true);
    }
  }

  private sendSocketSubscription() {
    if (!this.socketAuthenticated || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({
      type: 'subscribe',
      afterId: this.afterId,
      bindings: this.activeBindings(),
    }));
  }

  private handleSocketClose(generation: number) {
    if (generation !== this.socketGeneration) return;
    this.clearSocketConnectTimer();
    this.socketAuthenticated = false;
    this.socketSubscribed = false;
    if (this.channels.size === 0) return;

    this.socketFailures += 1;
    this.startPolling();
    const reconnectDelay = Math.min(
      REALTIME_SOCKET_MAX_RECONNECT_MS,
      REALTIME_SOCKET_RECONNECT_BASE_MS * (2 ** Math.min(this.socketFailures - 1, 5)),
    );
    this.socketReconnectTimer = window.setTimeout(() => {
      this.socketReconnectTimer = null;
      this.connectSocket();
    }, reconnectDelay);
  }

  private clearSocketConnectTimer() {
    if (this.socketConnectTimer !== null) {
      window.clearTimeout(this.socketConnectTimer);
      this.socketConnectTimer = null;
    }
  }

  private closeSocketWhenReady(socket: WebSocket, code: number, reason: string) {
    if (socket.readyState === WebSocket.CONNECTING) {
      // Calling close() while CONNECTING makes Chromium report a failed
      // WebSocket even when component cleanup intentionally cancelled it.
      socket.onopen = () => socket.close(code, reason);
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(code, reason);
    }
  }

  private startPolling() {
    if (this.pollingActive || this.channels.size === 0) return;
    this.pollingActive = true;
    if (!this.inFlight) {
      void this.requestEvents(this.afterId === null);
    }
  }

  private stopPolling() {
    if (!this.pollingActive && !this.inFlight && this.timer === null) return;
    this.pollingActive = false;
    this.requestGeneration += 1;
    this.requestController?.abort();
    this.requestController = null;
    this.inFlight = false;
    this.consecutiveFailures = 0;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    if (!this.pollingActive || this.inFlight || this.channels.size === 0 || this.state === 'idle') {
      return;
    }

    await this.requestEvents(false);
  }

  private async requestEvents(isConnection: boolean) {
    const generation = this.requestGeneration;
    const requestedAfterId = this.afterId;
    const controller = new AbortController();
    this.requestController = controller;
    this.inFlight = true;

    const result = await apiRequest<{ events: LocalRealtimeEvent[]; lastId: number }>('/realtime/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        afterId: requestedAfterId,
        bindings: this.activeBindings(),
      }),
      signal: controller.signal,
    });

    if (generation !== this.requestGeneration) {
      return;
    }

    this.requestController = null;
    this.inFlight = false;

    if (this.channels.size === 0) {
      this.stop();
      return;
    }

    if (result.error || !result.data) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= REALTIME_FAILURES_BEFORE_DEGRADED && this.state !== 'error') {
        this.state = 'error';
        this.notifyAll('CHANNEL_ERROR');
      }
      const retryDelay = Math.min(
        REALTIME_MAX_RETRY_MS,
        REALTIME_RETRY_BASE_MS * (2 ** (this.consecutiveFailures - 1)),
      );
      this.schedulePoll(retryDelay);
      return;
    }

    this.consecutiveFailures = 0;
    this.applyEvents(result.data.events, result.data.lastId, requestedAfterId !== null);

    const recovered = this.state !== 'subscribed';
    this.state = 'subscribed';
    if (isConnection || recovered) {
      this.notifyAll('SUBSCRIBED');
    }
    this.schedulePoll();
  }

  private applyEvents(events: LocalRealtimeEvent[], lastId: number, shouldDispatch: boolean) {
    const previousCursor = this.afterId;
    if (shouldDispatch) {
      events.forEach((event) => {
        if (previousCursor === null || event.id > previousCursor) {
          this.dispatch(event);
        }
      });
    }
    this.afterId = previousCursor === null ? lastId : Math.max(previousCursor, lastId);
  }

  private activeBindings() {
    const bindings = new Map<string, Omit<LocalRealtimeBinding, 'callback'>>();

    this.channels.forEach((channel) => {
      channel.getBindings().forEach(({ event, table, filter }) => {
        const binding = { event, table, filter };
        const key = JSON.stringify(binding);
        if (!bindings.has(key)) {
          bindings.set(key, binding);
        }
      });
    });

    return [...bindings.values()];
  }

  private dispatch(event: LocalRealtimeEvent) {
    [...this.channels].forEach((channel) => channel.dispatch(event));
  }

  private notifyAll(status: string) {
    [...this.channels].forEach((channel) => channel.notifyStatus(status));
  }

  private schedulePoll(delay = REALTIME_POLL_MS) {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }

    if (!this.pollingActive || this.channels.size === 0 || this.state === 'idle') {
      this.timer = null;
      return;
    }

    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delay);
  }

  private stop() {
    this.socketGeneration += 1;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      this.closeSocketWhenReady(socket, 1000, 'No realtime subscribers');
    }
    this.socketAuthenticated = false;
    this.socketSubscribed = false;
    this.socketFailures = 0;
    this.clearSocketConnectTimer();
    if (this.socketReconnectTimer !== null) {
      window.clearTimeout(this.socketReconnectTimer);
      this.socketReconnectTimer = null;
    }
    this.stopPolling();
    this.state = 'idle';
    this.afterId = null;
  }
}

const localRealtimeTransport = new LocalRealtimeTransport();

class LocalRealtimeChannel {
  private bindings: LocalRealtimeBinding[] = [];
  private statusCallback?: (status: string) => void;
  private subscribed = false;

  on(
    _type: 'postgres_changes',
    binding: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: RealtimePostgresChangesPayload<QueryRow>) => void,
  ) {
    this.bindings.push({ event: binding.event, table: binding.table, filter: binding.filter, callback });
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    this.statusCallback = callback;
    if (!this.subscribed) {
      this.subscribed = true;
      localRealtimeTransport.register(this);
    }
    return this as unknown as RealtimeChannel;
  }

  unsubscribe() {
    if (this.subscribed) {
      this.subscribed = false;
      localRealtimeTransport.unregister(this);
    }
    this.statusCallback = undefined;
    return Promise.resolve('ok');
  }

  getBindings() {
    return this.bindings;
  }

  notifyStatus(status: string) {
    if (this.subscribed) {
      this.statusCallback?.(status);
    }
  }

  dispatch(event: LocalRealtimeEvent) {
    if (!this.subscribed) {
      return;
    }

    const binding = this.bindings.find((candidate) => bindingMatchesEvent(candidate, event));
    if (!binding) {
      return;
    }

    try {
      binding.callback({
        schema: 'public',
        table: String(event.table_name),
        commit_timestamp: String(event.created_at),
        eventType: String(event.event_type),
        new: (event.new_record || {}) as QueryRow,
        old: (event.old_record || {}) as QueryRow,
        errors: null,
      } as RealtimePostgresChangesPayload<QueryRow>);
    } catch (error) {
      console.error('Realtime event callback failed:', error);
    }
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
