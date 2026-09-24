// @vitest-environment node
import http from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { attachRealtimeServer, parseChangeNotification, REALTIME_SOCKET_PATH } from './realtime.js';

const cleanup = [];

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const handleMessage = (data) => {
      const message = JSON.parse(data.toString());
      if (!predicate(message)) return;
      cleanupListeners();
      resolve(message);
    };
    const handleError = (error) => {
      cleanupListeners();
      reject(error);
    };
    const cleanupListeners = () => {
      socket.off('message', handleMessage);
      socket.off('error', handleError);
    };
    socket.on('message', handleMessage);
    socket.on('error', handleError);
  });
}

async function openSubscribedSocket(server, token, bindings) {
  const address = server.address();
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}${REALTIME_SOCKET_PATH}`);
  await once(socket, 'open');
  const authenticated = nextMessage(socket);
  socket.send(JSON.stringify({ type: 'authenticate', accessToken: token }));
  await authenticated;
  const subscribed = nextMessage(socket, (message) => message.type === 'subscribed');
  const caughtUp = nextMessage(socket, (message) => message.type === 'events');
  socket.send(JSON.stringify({ type: 'subscribe', afterId: null, bindings }));
  await subscribed;
  await caughtUp;
  return socket;
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((callback) => callback()));
});

describe('realtime WebSocket server', () => {
  it('authenticates, subscribes at a cursor, and pushes notified changes', async () => {
    let notifyChange = () => {};
    let events = [];
    const readEvents = vi.fn(async (_user, afterId) => {
      if (afterId === null || afterId === undefined) return { events: [], lastId: 10 };
      const pending = events.filter((event) => event.id > afterId);
      return { events: pending, lastId: pending.at(-1)?.id ?? afterId };
    });
    const readEventBatch = vi.fn(async (afterId, tables, throughId) => {
      const pending = events.filter((event) => event.id > afterId && event.id <= throughId
        && tables.includes(event.table_name));
      return { events: pending, lastId: pending.at(-1)?.id ?? afterId, hasMore: false };
    });
    const authorizeEvents = vi.fn(async (_user, pending) => ({
      events: pending,
      rejectedByAuthorization: 0,
      rejectedByBinding: 0,
    }));
    const server = http.createServer();
    const realtime = await attachRealtimeServer(server, {
      authenticate: vi.fn(async (token) => ({ id: `user:${token}` })),
      readEvents,
      readEventBatch,
      authorizeEvents,
      latestEventId: vi.fn(async () => events.at(-1)?.id ?? 10),
      startChangeListener: vi.fn(async (onChange) => {
        notifyChange = onChange;
        return async () => {};
      }),
      logger: { error: vi.fn(), warn: vi.fn() },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    cleanup.push(async () => {
      await realtime.close();
      await new Promise((resolve) => server.close(resolve));
    });

    const address = server.address();
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}${REALTIME_SOCKET_PATH}`);
    await once(socket, 'open');

    const authenticated = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'authenticate', accessToken: 'valid-token' }));
    await expect(authenticated).resolves.toEqual({ type: 'authenticated' });

    const subscribed = nextMessage(socket);
    socket.send(JSON.stringify({
      type: 'subscribe',
      afterId: null,
      bindings: [{ event: '*', schema: 'public', table: 'messages' }],
    }));
    await expect(subscribed).resolves.toMatchObject({ type: 'subscribed', events: [], lastId: 10 });

    events = [{
      id: 11,
      table_name: 'messages',
      event_type: 'INSERT',
      created_at: '2026-07-24T00:00:00.000Z',
      new_record: { id: 'message-11', party_id: 'party-1' },
      old_record: null,
    }];
    const delivery = nextMessage(
      socket,
      (message) => message.events?.some((event) => event.id === 11),
    );
    notifyChange({ id: 11, table: 'messages' });
    await expect(delivery).resolves.toMatchObject({
      type: 'events',
      lastId: 11,
      events: [expect.objectContaining({ id: 11, table_name: 'messages' })],
    });
    expect(readEventBatch).toHaveBeenCalledTimes(1);
    expect(readEventBatch).toHaveBeenCalledWith(10, ['messages'], 11, 250);
    expect(authorizeEvents).toHaveBeenCalledWith(
      { id: 'user:valid-token' },
      events,
      [{ event: '*', schema: 'public', table: 'messages' }],
    );

    socket.close();
    await once(socket, 'close');
  });

  it('reads a notified event batch once and fans it out to multiple sockets', async () => {
    let notifyChange = () => {};
    let events = [];
    const readEvents = vi.fn(async (_user, afterId) => ({
      events: [],
      lastId: afterId ?? 20,
    }));
    const readEventBatch = vi.fn(async (afterId, tables, throughId) => {
      const pending = events.filter((event) => event.id > afterId && event.id <= throughId
        && tables.includes(event.table_name));
      return { events: pending, lastId: pending.at(-1)?.id ?? afterId, hasMore: false };
    });
    const authorizeEvents = vi.fn(async (_user, pending) => ({
      events: pending,
      rejectedByAuthorization: 0,
      rejectedByBinding: 0,
    }));
    const server = http.createServer();
    const realtime = await attachRealtimeServer(server, {
      authenticate: vi.fn(async (token) => ({ id: `user:${token}` })),
      readEvents,
      readEventBatch,
      authorizeEvents,
      latestEventId: vi.fn(async () => events.at(-1)?.id ?? 20),
      startChangeListener: vi.fn(async (onChange) => {
        notifyChange = onChange;
        return async () => {};
      }),
      logger: { error: vi.fn(), warn: vi.fn() },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    cleanup.push(async () => {
      await realtime.close();
      await new Promise((resolve) => server.close(resolve));
    });

    const bindings = [{ event: '*', schema: 'public', table: 'messages' }];
    const first = await openSubscribedSocket(server, 'first-token', bindings);
    const second = await openSubscribedSocket(server, 'second-token', bindings);
    events = [{
      id: 21,
      table_name: 'messages',
      event_type: 'INSERT',
      created_at: '2026-09-24T00:00:00.000Z',
      new_record: { id: 'message-21', party_id: 'party-1' },
      old_record: null,
    }];

    const firstDelivery = nextMessage(first, (message) => message.events?.[0]?.id === 21);
    const secondDelivery = nextMessage(second, (message) => message.events?.[0]?.id === 21);
    notifyChange({ id: 21, table: 'messages' });
    await Promise.all([firstDelivery, secondDelivery]);

    expect(readEventBatch).toHaveBeenCalledTimes(1);
    expect(authorizeEvents).toHaveBeenCalledTimes(2);

    first.close();
    second.close();
    await Promise.all([once(first, 'close'), once(second, 'close')]);
  });
});

describe('PostgreSQL realtime notification payloads', () => {
  it('accepts metadata JSON and legacy numeric payloads', () => {
    expect(parseChangeNotification('{"id":42,"table":"messages"}'))
      .toEqual({ id: 42, table: 'messages' });
    expect(parseChangeNotification('43')).toEqual({ id: 43, table: null });
    expect(parseChangeNotification('invalid')).toBeNull();
  });
});
