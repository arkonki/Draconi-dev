import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { realtimeChannelManager, type RealtimeBinding } from '../lib/realtime/channelManager';
import { useLiveSync, type LiveSyncStatus } from '../contexts/LiveSyncContext';

interface UseRealtimeChannelOptions {
  key: string;
  scope?: string;
  bindings: RealtimeBinding[];
  onEvent: (bindingId: string, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onReconnect?: () => void | Promise<void>;
  fallbackRefetchMs?: number;
  enabled?: boolean;
  reportToSync?: boolean;
}

export function useRealtimeChannel({
  key,
  scope,
  bindings,
  onEvent,
  onReconnect,
  fallbackRefetchMs,
  enabled = true,
  reportToSync = true,
}: UseRealtimeChannelOptions) {
  const [status, setStatus] = useState<LiveSyncStatus>('healthy');
  const { setChannelStatus, clearChannelStatus } = useLiveSync();
  const eventRef = useRef(onEvent);
  const reconnectRef = useRef(onReconnect);

  eventRef.current = onEvent;
  reconnectRef.current = onReconnect;

  const bindingSignature = useMemo(() => JSON.stringify(bindings), [bindings]);

  useEffect(() => {
    if (!enabled) {
      if (scope && reportToSync) {
        clearChannelStatus(scope, key);
      }
      setStatus('healthy');
      return;
    }

    const subscription = realtimeChannelManager.subscribe({
      key,
      bindings,
      fallbackRefetchMs,
      onEvent: (bindingId, payload) => {
        eventRef.current(bindingId, payload);
      },
      onReconnect: async () => {
        await reconnectRef.current?.();
      },
      onStatus: (nextStatus) => {
        setStatus(nextStatus);
        if (scope && reportToSync) {
          setChannelStatus(scope, key, nextStatus);
        }
      },
    });

    return () => {
      subscription.unsubscribe();
      if (scope && reportToSync) {
        clearChannelStatus(scope, key);
      }
    };
  }, [bindingSignature, bindings, clearChannelStatus, enabled, fallbackRefetchMs, key, reportToSync, scope, setChannelStatus]);

  return status;
}
