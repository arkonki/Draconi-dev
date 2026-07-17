import { supabase } from './supabase';

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => payload,
  } as Response;
}

async function flushPromises() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('local realtime transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('initializes at the latest cursor without replaying historical events', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ events: [], lastId: 41 }))
      .mockResolvedValueOnce(jsonResponse({
        events: [{
          id: 42,
          table_name: 'messages',
          event_type: 'INSERT',
          created_at: '2026-07-17T00:00:00.000Z',
          new_record: { id: 'message-42', party_id: 'party-1', content: 'New event' },
          old_record: null,
        }],
        lastId: 42,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const channel = supabase
      .channel('local-realtime-test')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages', filter: 'party_id=eq.party-1',
      }, onEvent)
      .subscribe(onStatus);

    await flushPromises();

    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    expect(onEvent).not.toHaveBeenCalled();
    const initialization = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(initialization.afterId).toBeNull();

    await vi.advanceTimersByTimeAsync(1200);

    const poll = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(poll.afterId).toBe(41);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      table: 'messages',
      eventType: 'INSERT',
      new: { id: 'message-42', content: 'New event' },
    });

    await channel.unsubscribe();
  });

  it('does not overlap slow event polls', async () => {
    let resolvePoll: ((response: Response) => void) | null = null;
    const slowPoll = new Promise<Response>((resolve) => {
      resolvePoll = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ events: [], lastId: 7 }))
      .mockReturnValueOnce(slowPoll)
      .mockResolvedValue(jsonResponse({ events: [], lastId: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    const channel = supabase.channel('local-realtime-overlap-test').subscribe();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2400);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolvePoll?.(jsonResponse({ events: [], lastId: 7 }));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await channel.unsubscribe();
  });
});
