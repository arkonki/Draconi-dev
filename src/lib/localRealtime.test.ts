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
    vi.stubGlobal('WebSocket', undefined);
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

    await vi.advanceTimersByTimeAsync(4000);

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

  it('recovers an isolated transport failure without degrading every channel', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ events: [], lastId: 50 }))
      .mockRejectedValueOnce(new TypeError('HTTP/2 stream failed'))
      .mockResolvedValueOnce(jsonResponse({ events: [], lastId: 50 }));
    vi.stubGlobal('fetch', fetchMock);

    const onStatus = vi.fn();
    const channel = supabase
      .channel('local-realtime-transient-failure-test')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
      }, vi.fn())
      .subscribe(onStatus);

    await flushPromises();
    await vi.advanceTimersByTimeAsync(4000);
    expect(onStatus).not.toHaveBeenCalledWith('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onStatus).not.toHaveBeenCalledWith('CHANNEL_ERROR');

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
    await vi.advanceTimersByTimeAsync(8000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolvePoll?.(jsonResponse({ events: [], lastId: 7 }));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await channel.unsubscribe();
  });

  it('multiplexes multiple channels through one polling request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ events: [], lastId: 20 }))
      .mockResolvedValueOnce(jsonResponse({
        events: [
          {
            id: 21,
            table_name: 'messages',
            event_type: 'INSERT',
            created_at: '2026-07-24T00:00:00.000Z',
            new_record: { id: 'message-21', party_id: 'party-1' },
            old_record: null,
          },
          {
            id: 22,
            table_name: 'encounters',
            event_type: 'UPDATE',
            created_at: '2026-07-24T00:00:01.000Z',
            new_record: { id: 'encounter-22', party_id: 'party-1' },
            old_record: { id: 'encounter-22', party_id: 'party-1' },
          },
        ],
        lastId: 22,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const onMessage = vi.fn();
    const onEncounter = vi.fn();
    const messageChannel = supabase
      .channel('shared-message-channel')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: 'party_id=eq.party-1',
      }, onMessage)
      .subscribe();
    const encounterChannel = supabase
      .channel('shared-encounter-channel')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'encounters', filter: 'party_id=eq.party-1',
      }, onEncounter)
      .subscribe();

    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const poll = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(poll.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'INSERT', table: 'messages', filter: 'party_id=eq.party-1' }),
      expect.objectContaining({ event: '*', table: 'encounters', filter: 'party_id=eq.party-1' }),
    ]));
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onEncounter).toHaveBeenCalledTimes(1);

    await messageChannel.unsubscribe();
    await encounterChannel.unsubscribe();
  });

  it('applies each channel filter when a shared poll returns an event', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ events: [], lastId: 30 }))
      .mockResolvedValueOnce(jsonResponse({
        events: [{
          id: 31,
          table_name: 'messages',
          event_type: 'INSERT',
          created_at: '2026-07-24T00:00:00.000Z',
          new_record: { id: 'message-31', party_id: 'party-1' },
          old_record: null,
        }],
        lastId: 31,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const onAnyMessage = vi.fn();
    const onOtherPartyMessage = vi.fn();
    const globalChannel = supabase
      .channel('global-message-channel')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, onAnyMessage)
      .subscribe();
    const partyChannel = supabase
      .channel('other-party-message-channel')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: 'party_id=eq.party-2',
      }, onOtherPartyMessage)
      .subscribe();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(4000);

    expect(onAnyMessage).toHaveBeenCalledTimes(1);
    expect(onOtherPartyMessage).not.toHaveBeenCalled();

    await globalChannel.unsubscribe();
    await partyChannel.unsubscribe();
  });

  it('uses one authenticated WebSocket and delivers pushed events without polling', async () => {
    class FakeWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 3;
      static instances: FakeWebSocket[] = [];

      readonly sent: string[] = [];
      readyState = FakeWebSocket.CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
      }

      send(message: string) {
        this.sent.push(message);
      }

      close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
      }

      open() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      }

      receive(message: unknown) {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('dragonbane_local_session', JSON.stringify({
      access_token: 'socket-token',
    }));

    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const channel = supabase
      .channel('websocket-realtime-test')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages', filter: 'party_id=eq.party-1',
      }, onEvent)
      .subscribe(onStatus);

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('ws://localhost:3000/api/realtime/socket');

    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'authenticate',
      accessToken: 'socket-token',
    });

    socket.receive({ type: 'authenticated' });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'subscribe',
      afterId: null,
      bindings: [expect.objectContaining({ table: 'messages', filter: 'party_id=eq.party-1' })],
    });

    socket.receive({ type: 'subscribed', events: [], lastId: 70 });
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    expect(fetchMock).not.toHaveBeenCalled();

    socket.receive({
      type: 'events',
      events: [{
        id: 71,
        table_name: 'messages',
        event_type: 'INSERT',
        created_at: '2026-07-24T00:00:00.000Z',
        new_record: { id: 'message-71', party_id: 'party-1' },
        old_record: null,
      }],
      lastId: 71,
    });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      table: 'messages',
      eventType: 'INSERT',
      new: { id: 'message-71' },
    });

    socket.close();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ afterId: 71 });

    await channel.unsubscribe();
  });
});
