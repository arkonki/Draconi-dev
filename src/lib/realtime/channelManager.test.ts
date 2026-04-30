import { RealtimeChannelManager, type RealtimeBinding } from './channelManager';

class FakeChannel {
  handlers: Array<{ binding: RealtimeBinding; callback: (payload: unknown) => void }> = [];
  statusCallback: ((status: string) => void) | null = null;

  on(
    _type: 'postgres_changes',
    binding: Omit<RealtimeBinding, 'bindingId'>,
    callback: (payload: unknown) => void,
  ) {
    this.handlers.push({
      binding: {
        bindingId: `binding-${this.handlers.length}`,
        ...binding,
      },
      callback,
    });
    return this;
  }

  subscribe(callback: (status: string) => void) {
    this.statusCallback = callback;
    return this as never;
  }

  emitStatus(status: string) {
    this.statusCallback?.(status);
  }

  emit(index: number, payload: unknown) {
    this.handlers[index]?.callback(payload);
  }
}

class FakeClient {
  channels: FakeChannel[] = [];
  removedChannels: FakeChannel[] = [];

  channel(_key: string) {
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel as never;
  }

  removeChannel(channel: FakeChannel) {
    this.removedChannels.push(channel);
    return Promise.resolve('ok');
  }
}

const TEST_BINDINGS: RealtimeBinding[] = [
  {
    bindingId: 'messages',
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: 'party_id=eq.party-1',
  },
];

describe('RealtimeChannelManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes channel creation for the same key', () => {
    const client = new FakeClient();
    const manager = new RealtimeChannelManager(client as never, {
      baseReconnectMs: 100,
      maxReconnectMs: 100,
      degradedAfterMs: 200,
      jitterRatio: 0,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const subscriptionA = manager.subscribe({
      key: 'party-chat',
      bindings: TEST_BINDINGS,
      onEvent: vi.fn(),
    });
    const subscriptionB = manager.subscribe({
      key: 'party-chat',
      bindings: TEST_BINDINGS,
      onEvent: vi.fn(),
    });

    expect(client.channels).toHaveLength(1);

    subscriptionA.unsubscribe();
    expect(client.removedChannels).toHaveLength(0);

    subscriptionB.unsubscribe();
    expect(client.removedChannels).toHaveLength(1);
  });

  it('transitions to degraded and reconnects after a timeout', async () => {
    const client = new FakeClient();
    const onReconnect = vi.fn();
    const onStatus = vi.fn();
    const manager = new RealtimeChannelManager(client as never, {
      baseReconnectMs: 300,
      maxReconnectMs: 300,
      degradedAfterMs: 200,
      jitterRatio: 0,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    manager.subscribe({
      key: 'party-chat',
      bindings: TEST_BINDINGS,
      onEvent: vi.fn(),
      onReconnect,
      onStatus,
    });

    client.channels[0].emitStatus('SUBSCRIBED');
    client.channels[0].emitStatus('TIMED_OUT');

    vi.advanceTimersByTime(200);
    expect(onStatus).toHaveBeenCalledWith('degraded');

    vi.advanceTimersByTime(100);
    expect(client.channels).toHaveLength(2);

    client.channels[1].emitStatus('SUBSCRIBED');
    await Promise.resolve();

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('healthy');
  });

  it('dispatches realtime events to every subscriber on a shared channel', () => {
    const client = new FakeClient();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const manager = new RealtimeChannelManager(client as never, {
      baseReconnectMs: 100,
      maxReconnectMs: 100,
      degradedAfterMs: 200,
      jitterRatio: 0,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    manager.subscribe({
      key: 'party-chat',
      bindings: TEST_BINDINGS,
      onEvent: firstHandler,
    });
    manager.subscribe({
      key: 'party-chat',
      bindings: TEST_BINDINGS,
      onEvent: secondHandler,
    });

    const payload = { new: { id: 'msg-1' } };
    client.channels[0].emit(0, payload);

    expect(firstHandler).toHaveBeenCalledWith('messages', payload);
    expect(secondHandler).toHaveBeenCalledWith('messages', payload);
  });
});
