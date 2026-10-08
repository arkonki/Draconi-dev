import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeBinding } from '../lib/realtime/channelManager';
import { LiveSyncProvider, useLiveSync } from '../contexts/LiveSyncContext';
import { useRealtimeChannel } from './useRealtimeChannel';

const { subscribe, unsubscribe } = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));

vi.mock('../lib/realtime/channelManager', () => ({
  realtimeChannelManager: { subscribe },
}));

const wrapper = ({ children }: { children: ReactNode }) => <LiveSyncProvider>{children}</LiveSyncProvider>;

describe('live sync context', () => {
  it('keeps its status setters stable when statuses change', () => {
    const { result } = renderHook(() => useLiveSync(), { wrapper });
    const { setChannelStatus, clearChannelStatus } = result.current;

    act(() => result.current.setChannelStatus('party-1', 'chat', 'reconnecting'));
    expect(result.current.getScopeStatus('party-1')).toBe('reconnecting');
    expect(result.current.setChannelStatus).toBe(setChannelStatus);
    expect(result.current.clearChannelStatus).toBe(clearChannelStatus);

    act(() => result.current.clearChannelStatus('party-1', 'chat'));
    expect(result.current.getScopeStatus('party-1')).toBe('healthy');
  });
});

describe('useRealtimeChannel', () => {
  beforeEach(() => {
    subscribe.mockReset();
    unsubscribe.mockReset();
  });

  it('subscribes once even though every subscription reports a status to the live sync context', async () => {
    // Reporting a status changes the live sync state. That used to recreate the context callbacks,
    // which re-ran the effect, which resubscribed and reported again, forever.
    subscribe.mockImplementation(({ onStatus }: { onStatus: (status: string) => void }) => {
      // Fail fast instead of spinning forever if the loop ever returns.
      if (subscribe.mock.calls.length > 25) throw new Error('Realtime channel is resubscribing in a loop');
      onStatus('reconnecting');
      return { unsubscribe };
    });

    const bindings: RealtimeBinding[] = [{ bindingId: 'pins', schema: 'public', table: 'party_map_pins', event: '*' }];
    function Probe() {
      useRealtimeChannel({ key: 'atlas', scope: 'party-1', bindings, onEvent: () => {} });
      return null;
    }

    render(<Probe />, { wrapper });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
