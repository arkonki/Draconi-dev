import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { Database } from '../database.types';
import type { LiveSyncStatus } from '../../contexts/LiveSyncContext';

type ChannelLifecycleStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED';

export interface RealtimeBinding {
  bindingId: string;
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: 'public';
  table: string;
  filter?: string;
}

export interface RealtimeChannelOptions {
  key: string;
  bindings: RealtimeBinding[];
  onEvent: (bindingId: string, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onReconnect?: () => void | Promise<void>;
  onStatus?: (status: LiveSyncStatus) => void;
  fallbackRefetchMs?: number;
  enabled?: boolean;
}

interface Subscriber extends Required<Pick<RealtimeChannelOptions, 'key' | 'bindings' | 'onEvent'>> {
  id: string;
  onReconnect?: RealtimeChannelOptions['onReconnect'];
  onStatus?: RealtimeChannelOptions['onStatus'];
  fallbackRefetchMs?: number;
}

interface ManagedEntry {
  key: string;
  bindings: RealtimeBinding[];
  bindingSignature: string;
  subscribers: Map<string, Subscriber>;
  channel: RealtimeChannel | null;
  status: LiveSyncStatus;
  connectionId: number;
  reconnectAttempt: number;
  reconnectTimer: number | null;
  degradedTimer: number | null;
  fallbackTimers: Map<string, number>;
  hasEverSubscribed: boolean;
}

interface ChannelManagerOptions {
  baseReconnectMs?: number;
  maxReconnectMs?: number;
  degradedAfterMs?: number;
  jitterRatio?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

const DEFAULT_MANAGER_OPTIONS: Required<ChannelManagerOptions> = {
  baseReconnectMs: 1000,
  maxReconnectMs: 15000,
  degradedAfterMs: 6000,
  jitterRatio: 0.25,
  logger: console,
};

function createBindingSignature(bindings: RealtimeBinding[]) {
  return JSON.stringify(bindings.map(({ bindingId, ...binding }) => ({ bindingId, ...binding })));
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class RealtimeChannelManager {
  private readonly client: Pick<SupabaseClient<Database>, 'channel' | 'removeChannel'>;
  private readonly options: Required<ChannelManagerOptions>;
  private readonly entries = new Map<string, ManagedEntry>();

  constructor(
    client: Pick<SupabaseClient<Database>, 'channel' | 'removeChannel'> = supabase,
    options: ChannelManagerOptions = {},
  ) {
    this.client = client;
    this.options = { ...DEFAULT_MANAGER_OPTIONS, ...options };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  subscribe(options: RealtimeChannelOptions) {
    const subscriberId = randomId();
    const entry = this.ensureEntry(options.key, options.bindings);

    entry.subscribers.set(subscriberId, {
      id: subscriberId,
      key: options.key,
      bindings: options.bindings,
      onEvent: options.onEvent,
      onReconnect: options.onReconnect,
      onStatus: options.onStatus,
      fallbackRefetchMs: options.fallbackRefetchMs,
    });

    options.onStatus?.(entry.status);
    this.syncFallbackTimers(entry);

    return {
      unsubscribe: () => {
        this.removeSubscriber(options.key, subscriberId);
      },
    };
  }

  private ensureEntry(key: string, bindings: RealtimeBinding[]) {
    const bindingSignature = createBindingSignature(bindings);
    const existing = this.entries.get(key);

    if (existing) {
      if (existing.bindingSignature !== bindingSignature) {
        this.options.logger.warn(`[realtime] Channel "${key}" was requested with a different binding set. Keeping the first definition.`);
      }

      return existing;
    }

    const entry: ManagedEntry = {
      key,
      bindings,
      bindingSignature,
      subscribers: new Map(),
      channel: null,
      status: 'healthy',
      connectionId: 0,
      reconnectAttempt: 0,
      reconnectTimer: null,
      degradedTimer: null,
      fallbackTimers: new Map(),
      hasEverSubscribed: false,
    };

    this.entries.set(key, entry);
    this.connect(entry);
    return entry;
  }

  private connect(entry: ManagedEntry) {
    this.clearTimer(entry.reconnectTimer);
    entry.reconnectTimer = null;
    this.clearTimer(entry.degradedTimer);
    entry.degradedTimer = null;
    entry.connectionId += 1;

    if (entry.channel) {
      void this.client.removeChannel(entry.channel);
      entry.channel = null;
    }

    if (entry.hasEverSubscribed && (entry.reconnectAttempt > 0 || entry.status !== 'healthy')) {
      this.setStatus(entry, 'reconnecting');
    }
    const currentConnectionId = entry.connectionId;
    const channel = this.client.channel(entry.key);

    entry.bindings.forEach((binding) => {
      channel.on(
        'postgres_changes',
        {
          event: binding.event,
          schema: binding.schema,
          table: binding.table,
          filter: binding.filter,
        },
        (payload) => {
          if (!this.isActiveConnection(entry, currentConnectionId)) {
            return;
          }

          entry.subscribers.forEach((subscriber) => {
            subscriber.onEvent(binding.bindingId, payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
          });
        },
      );
    });

    entry.channel = channel.subscribe((status) => {
      this.handleStatus(entry, currentConnectionId, status as ChannelLifecycleStatus);
    });
  }

  private handleStatus(entry: ManagedEntry, connectionId: number, status: ChannelLifecycleStatus) {
    if (!this.isActiveConnection(entry, connectionId)) {
      return;
    }

    switch (status) {
      case 'SUBSCRIBED': {
        const shouldNotifyReconnect = entry.status !== 'healthy' && entry.reconnectAttempt > 0;
        entry.hasEverSubscribed = true;
        entry.reconnectAttempt = 0;
        this.clearTimer(entry.degradedTimer);
        entry.degradedTimer = null;
        this.setStatus(entry, 'healthy');

        if (shouldNotifyReconnect) {
          entry.subscribers.forEach((subscriber) => {
            void subscriber.onReconnect?.();
          });
        }
        break;
      }
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED': {
        if (entry.subscribers.size === 0) {
          return;
        }

        this.options.logger.warn(`[realtime] Channel "${entry.key}" entered ${status}. Scheduling reconnect.`);
        this.scheduleReconnect(entry);
        break;
      }
      default:
        break;
    }
  }

  private scheduleReconnect(entry: ManagedEntry) {
    if (entry.reconnectTimer !== null) {
      return;
    }

    if (entry.hasEverSubscribed) {
      this.setStatus(entry, 'reconnecting');
    }

    entry.degradedTimer = window.setTimeout(() => {
      if (entry.status !== 'healthy' || !entry.hasEverSubscribed) {
        this.setStatus(entry, 'degraded');
      }
    }, this.options.degradedAfterMs);

    const reconnectDelay = this.nextReconnectDelay(entry.reconnectAttempt);
    entry.reconnectAttempt += 1;
    entry.reconnectTimer = window.setTimeout(() => {
      entry.reconnectTimer = null;
      this.connect(entry);
    }, reconnectDelay);
  }

  private nextReconnectDelay(attempt: number) {
    const expDelay = Math.min(this.options.maxReconnectMs, this.options.baseReconnectMs * (2 ** attempt));
    const jitter = expDelay * this.options.jitterRatio * Math.random();
    return Math.round(expDelay + jitter);
  }

  private setStatus(entry: ManagedEntry, status: LiveSyncStatus) {
    if (entry.status === status) {
      return;
    }

    entry.status = status;
    entry.subscribers.forEach((subscriber) => {
      subscriber.onStatus?.(status);
    });
    this.syncFallbackTimers(entry);
  }

  private syncFallbackTimers(entry: ManagedEntry) {
    entry.subscribers.forEach((subscriber, subscriberId) => {
      const existingTimer = entry.fallbackTimers.get(subscriberId);
      const shouldRunFallback = entry.status !== 'healthy' && typeof subscriber.fallbackRefetchMs === 'number' && subscriber.fallbackRefetchMs > 0;

      if (shouldRunFallback && existingTimer === undefined) {
        const timer = window.setInterval(() => {
          void subscriber.onReconnect?.();
        }, subscriber.fallbackRefetchMs);
        entry.fallbackTimers.set(subscriberId, timer);
      }

      if (!shouldRunFallback && existingTimer !== undefined) {
        window.clearInterval(existingTimer);
        entry.fallbackTimers.delete(subscriberId);
      }
    });
  }

  private removeSubscriber(key: string, subscriberId: string) {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    const fallbackTimer = entry.fallbackTimers.get(subscriberId);
    if (fallbackTimer !== undefined) {
      window.clearInterval(fallbackTimer);
      entry.fallbackTimers.delete(subscriberId);
    }

    entry.subscribers.delete(subscriberId);

    if (entry.subscribers.size > 0) {
      return;
    }

    this.clearTimer(entry.reconnectTimer);
    this.clearTimer(entry.degradedTimer);
    entry.reconnectTimer = null;
    entry.degradedTimer = null;

    entry.fallbackTimers.forEach((timer) => window.clearInterval(timer));
    entry.fallbackTimers.clear();

    if (entry.channel) {
      void this.client.removeChannel(entry.channel);
      entry.channel = null;
    }

    this.entries.delete(key);
  }

  private readonly handleOnline = () => {
    this.entries.forEach((entry) => {
      if (entry.status !== 'healthy') {
        this.connect(entry);
      }
    });
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return;
    }

    this.entries.forEach((entry) => {
      if (entry.status !== 'healthy') {
        this.connect(entry);
      }
    });
  };

  private isActiveConnection(entry: ManagedEntry, connectionId: number) {
    return entry.connectionId === connectionId;
  }

  private clearTimer(timer: number | null) {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

export const realtimeChannelManager = new RealtimeChannelManager();

export async function flushRealtimeAsyncWork() {
  await wait(0);
}
