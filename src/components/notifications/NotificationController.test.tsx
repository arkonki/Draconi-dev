import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimePostgresChangesPayload } from '../../lib/localBackend.types';
import type { Message } from '../../lib/api/chat';
import { NotificationController } from './NotificationController';

const mocks = vi.hoisted(() => ({
  realtimeOptions: null as null | {
    onEvent: (
      bindingId: string,
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => void | Promise<void>;
    onReconnect?: () => void | Promise<void>;
  },
  playSound: vi.fn(),
  sendDesktopNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../contexts/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner-1' } }),
}));

vi.mock('../../contexts/useNotifications', () => ({
  useNotifications: () => ({
    playSound: mocks.playSound,
    sendDesktopNotification: mocks.sendDesktopNotification,
  }),
}));

vi.mock('../../hooks/useRealtimeChannel', () => ({
  useRealtimeChannel: (options: typeof mocks.realtimeOptions) => {
    mocks.realtimeOptions = options;
    return 'healthy';
  },
}));

function realtimePayload(
  eventType: 'INSERT' | 'DELETE',
  message: Message,
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  return {
    schema: 'public',
    table: 'messages',
    commit_timestamp: message.created_at,
    eventType,
    new: eventType === 'INSERT' ? message : {},
    old: eventType === 'DELETE' ? message : {},
    errors: null,
  } as RealtimePostgresChangesPayload<Record<string, unknown>>;
}

function renderController() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationController />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('NotificationController chat cache synchronization', () => {
  beforeEach(() => {
    mocks.realtimeOptions = null;
    mocks.playSound.mockClear();
    mocks.sendDesktopNotification.mockClear();
    sessionStorage.clear();
  });

  it('caches a background chat insert exactly once before notification filtering', async () => {
    const queryClient = renderController();
    const message: Message = {
      id: 'message-1',
      party_id: 'party-1',
      user_id: 'owner-1',
      content: 'Sent from another open view',
      created_at: '2026-09-20T10:00:00.000Z',
    };

    await act(async () => {
      await mocks.realtimeOptions?.onEvent('message-insert', realtimePayload('INSERT', message));
      await mocks.realtimeOptions?.onEvent('message-insert', realtimePayload('INSERT', message));
    });

    expect(queryClient.getQueryData(['messages', 'party-1'])).toEqual([message]);
    expect(mocks.playSound).not.toHaveBeenCalled();
  });

  it('removes a deleted message from a previously cached chat', async () => {
    const queryClient = renderController();
    const message: Message = {
      id: 'message-1',
      party_id: 'party-1',
      user_id: 'player-1',
      content: 'Remove me',
      created_at: '2026-09-20T10:00:00.000Z',
    };
    queryClient.setQueryData(['messages', 'party-1'], [message]);

    await act(async () => {
      await mocks.realtimeOptions?.onEvent('message-delete', realtimePayload('DELETE', message));
    });

    expect(queryClient.getQueryData(['messages', 'party-1'])).toEqual([]);
  });

  it('invalidates all chat caches after realtime reconnects', async () => {
    const queryClient = renderController();
    queryClient.setQueryData(['messages', 'party-1'], []);
    queryClient.setQueryData(['messages', 'party-2'], []);

    await act(async () => {
      await mocks.realtimeOptions?.onReconnect?.();
    });

    expect(queryClient.getQueryState(['messages', 'party-1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['messages', 'party-2'])?.isInvalidated).toBe(true);
  });
});
