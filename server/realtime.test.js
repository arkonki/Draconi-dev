// @vitest-environment node
import http from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { attachRealtimeServer, REALTIME_SOCKET_PATH } from './realtime.js';

const cleanup = [];

async function nextMessage(socket) {
  const [data] = await once(socket, 'message');
  return JSON.parse(data.toString());
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
    const server = http.createServer();
    const realtime = await attachRealtimeServer(server, {
      authenticate: vi.fn(async (token) => ({ id: `user:${token}` })),
      readEvents,
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
    const delivery = nextMessage(socket);
    notifyChange();
    await expect(delivery).resolves.toMatchObject({
      type: 'events',
      lastId: 11,
      events: [expect.objectContaining({ id: 11, table_name: 'messages' })],
    });
    expect(readEvents).toHaveBeenLastCalledWith(
      { id: 'user:valid-token' },
      10,
      [{ event: '*', schema: 'public', table: 'messages' }],
    );

    socket.close();
    await once(socket, 'close');
  });
});
