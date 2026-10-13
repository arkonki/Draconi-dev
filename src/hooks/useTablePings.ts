import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { TablePing } from '../types/virtualTable';

const PING_LIFETIME_MS = 4_500;
/** Pings older than this when they arrive (after a reconnect, say) are stale and ignored. */
const STALE_MS = 8_000;

export interface LivePing extends TablePing { expiresAt: number }

/** Pings dropped on the map by anyone at the table. Each stays on screen for a few seconds, then disappears. */
export function useTablePings(partyId: string, onFocusPing?: (ping: TablePing) => void) {
  const [pings, setPings] = useState<LivePing[]>([]);
  const timers = useRef(new Map<string, number>());
  const focusRef = useRef(onFocusPing);
  focusRef.current = onFocusPing;

  const bindings = useMemo(() => [
    { bindingId: 'table-pings', event: 'INSERT' as const, schema: 'public' as const, table: 'table_pings', filter: `party_id=eq.${partyId}` },
  ], [partyId]);

  const receive = useCallback((raw: Partial<TablePing> | null) => {
    if (!raw?.id || typeof raw.map_id !== 'string') return;
    const ping: TablePing = {
      id: raw.id, party_id: raw.party_id ?? partyId, map_id: raw.map_id, user_id: raw.user_id ?? '',
      x: Number(raw.x), y: Number(raw.y), color: raw.color ?? '#facc15', label: raw.label ?? '', focus: Boolean(raw.focus),
      created_at: raw.created_at ?? new Date().toISOString(),
    };
    if (!Number.isFinite(ping.x) || !Number.isFinite(ping.y)) return;
    if (Date.now() - Date.parse(ping.created_at) > STALE_MS) return;
    setPings((current) => [...current.filter((entry) => entry.user_id !== ping.user_id), { ...ping, expiresAt: Date.now() + PING_LIFETIME_MS }]);
    const existing = timers.current.get(ping.id);
    if (existing) window.clearTimeout(existing);
    timers.current.set(ping.id, window.setTimeout(() => {
      timers.current.delete(ping.id);
      setPings((current) => current.filter((entry) => entry.id !== ping.id));
    }, PING_LIFETIME_MS));
    if (ping.focus) focusRef.current?.(ping);
  }, [partyId]);

  useRealtimeChannel({
    key: `table_pings:${partyId}`,
    scope: `party:${partyId}`,
    bindings,
    enabled: true,
    onEvent: (_bindingId, payload) => receive((payload.new ?? null) as Partial<TablePing> | null),
  });

  useEffect(() => {
    const active = timers.current;
    return () => { for (const timer of active.values()) window.clearTimeout(timer); active.clear(); };
  }, []);

  return { pings };
}
