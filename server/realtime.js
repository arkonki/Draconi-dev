import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { authenticateAccessToken } from './auth.js';
import { authorizedChangeEvents } from './data.js';
import { HttpError } from './http.js';

const { Client } = pg;

export const REALTIME_SOCKET_PATH = '/api/realtime/socket';

const AUTHENTICATION_TIMEOUT_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const LISTENER_RECONNECT_MS = 1000;
const MAX_MESSAGE_BYTES = 64 * 1024;

function sendMessage(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function closeWithError(socket, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'REALTIME_ERROR';
  sendMessage(socket, {
    type: 'error',
    error: {
      message: error instanceof Error ? error.message : 'Realtime request failed',
      code,
      status,
    },
  });
  socket.close(status === 401 || status === 403 ? 1008 : 1011);
}

function parseMessage(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
  if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) {
    throw new HttpError(413, 'Realtime message is too large', 'REALTIME_MESSAGE_TOO_LARGE');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Realtime message must be valid JSON', 'INVALID_REALTIME_MESSAGE');
  }
}

async function startPostgresChangeListener(onChange, onUnavailable, logger = console) {
  let stopped = false;
  let client = null;
  let reconnectTimer = null;
  let connectionGeneration = 0;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect(false);
    }, LISTENER_RECONNECT_MS);
    reconnectTimer.unref?.();
  };

  const connect = async (required) => {
    const generation = ++connectionGeneration;
    const nextClient = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await nextClient.connect();
      await nextClient.query('LISTEN app_change_events');

      if (stopped || generation !== connectionGeneration) {
        await nextClient.end();
        return;
      }

      client = nextClient;
      let failed = false;
      const handleFailure = (error) => {
        if (failed || stopped || client !== nextClient) return;
        failed = true;
        client = null;
        logger.error('PostgreSQL realtime listener disconnected:', error);
        onUnavailable();
        void nextClient.end().catch(() => {});
        scheduleReconnect();
      };

      nextClient.on('notification', (notification) => {
        if (notification.channel === 'app_change_events') onChange();
      });
      nextClient.on('error', handleFailure);
      nextClient.on('end', () => handleFailure(new Error('PostgreSQL realtime listener ended')));
      onChange();
    } catch (error) {
      await nextClient.end().catch(() => {});
      if (required) throw error;
      logger.error('Unable to reconnect PostgreSQL realtime listener:', error);
      scheduleReconnect();
    }
  };

  await connect(true);

  return async () => {
    stopped = true;
    connectionGeneration += 1;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const activeClient = client;
    client = null;
    if (activeClient) {
      activeClient.removeAllListeners();
      await activeClient.query('UNLISTEN app_change_events').catch(() => {});
      await activeClient.end().catch(() => {});
    }
  };
}

export async function attachRealtimeServer(server, options = {}) {
  const authenticate = options.authenticate || authenticateAccessToken;
  const readEvents = options.readEvents || authorizedChangeEvents;
  const startChangeListener = options.startChangeListener || startPostgresChangeListener;
  const logger = options.logger || console;
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  const clients = new Set();
  let listenerReady = false;
  let flushScheduled = false;

  const flushClient = async (state) => {
    if (!state.user || !state.bindings || state.socket.readyState !== WebSocket.OPEN) return;
    if (state.flushing) {
      state.flushAgain = true;
      return;
    }

    state.flushing = true;
    try {
      do {
        state.flushAgain = false;
        const result = await readEvents(state.user, state.afterId, state.bindings);
        state.afterId = result.lastId;
        sendMessage(state.socket, {
          type: 'events',
          events: result.events,
          lastId: result.lastId,
        });
      } while (state.flushAgain && state.socket.readyState === WebSocket.OPEN);
    } catch (error) {
      logger.error('Unable to deliver realtime events:', error);
      closeWithError(state.socket, error);
    } finally {
      state.flushing = false;
    }
  };

  const flushAll = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(() => {
      flushScheduled = false;
      clients.forEach((state) => void flushClient(state));
    }, 10);
  };

  const closeClientsForListenerRestart = () => {
    listenerReady = false;
    clients.forEach((state) => state.socket.close(1012, 'Realtime listener restarting'));
  };

  const stopChangeListener = await startChangeListener(() => {
    listenerReady = true;
    flushAll();
  }, closeClientsForListenerRestart, logger);
  listenerReady = true;

  const upgradeHandler = (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== REALTIME_SOCKET_PATH) {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  };
  server.on('upgrade', upgradeHandler);

  webSocketServer.on('connection', (socket) => {
    const state = {
      socket,
      user: null,
      bindings: null,
      afterId: null,
      flushing: false,
      flushAgain: false,
      alive: true,
    };
    clients.add(state);

    const authenticationTimer = setTimeout(() => {
      if (!state.user) socket.close(1008, 'Authentication timeout');
    }, AUTHENTICATION_TIMEOUT_MS);
    authenticationTimer.unref?.();

    socket.on('pong', () => {
      state.alive = true;
    });

    socket.on('message', (rawMessage) => {
      void (async () => {
        const message = parseMessage(rawMessage);
        if (!state.user) {
          if (message.type !== 'authenticate') {
            throw new HttpError(401, 'Authenticate before subscribing', 'AUTH_REQUIRED');
          }
          state.user = await authenticate(message.accessToken);
          clearTimeout(authenticationTimer);
          sendMessage(socket, { type: 'authenticated' });
          return;
        }

        if (message.type !== 'subscribe') {
          throw new HttpError(400, 'Unsupported realtime message', 'INVALID_REALTIME_MESSAGE');
        }
        if (!listenerReady) {
          throw new HttpError(503, 'Realtime listener is reconnecting', 'REALTIME_UNAVAILABLE');
        }

        const bindings = Array.isArray(message.bindings) ? message.bindings : [];
        const result = await readEvents(state.user, message.afterId, bindings);
        state.bindings = bindings;
        state.afterId = result.lastId;
        sendMessage(socket, {
          type: 'subscribed',
          events: message.afterId === null || message.afterId === undefined ? [] : result.events,
          lastId: result.lastId,
        });
        void flushClient(state);
      })().catch((error) => closeWithError(socket, error));
    });

    socket.on('close', () => {
      clearTimeout(authenticationTimer);
      clients.delete(state);
    });
    socket.on('error', (error) => {
      logger.warn('Realtime WebSocket error:', error);
    });
  });

  const heartbeatTimer = setInterval(() => {
    clients.forEach((state) => {
      if (!state.alive) {
        state.socket.terminate();
        return;
      }
      state.alive = false;
      state.socket.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  return {
    close: async () => {
      clearInterval(heartbeatTimer);
      server.off('upgrade', upgradeHandler);
      clients.forEach((state) => state.socket.terminate());
      clients.clear();
      await stopChangeListener();
      await new Promise((resolve) => webSocketServer.close(resolve));
    },
  };
}
