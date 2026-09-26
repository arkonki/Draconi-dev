import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { authenticateAccessToken } from './auth.js';
import {
  authorizeChangeEventBatch,
  authorizedChangeEvents,
  changeInvalidatesAccessContext,
  invalidateAccessContextCache,
  latestChangeEventId,
  readChangeEventBatch,
} from './data.js';
import { HttpError } from './http.js';

const { Client } = pg;

export const REALTIME_SOCKET_PATH = '/api/realtime/socket';

const AUTHENTICATION_TIMEOUT_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const LISTENER_RECONNECT_MS = 1000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const EVENT_BATCH_LIMIT = 250;
const EVENT_BATCH_DELAY_MS = 10;
const METRIC_SAMPLE_SIZE = (() => {
  const parsed = Number(process.env.PERFORMANCE_SAMPLE_SIZE || 1_024);
  return Number.isInteger(parsed) && parsed >= 32 && parsed <= 4_096 ? parsed : 1_024;
})();

const realtimeMetrics = {
  connectionsOpened: 0,
  currentConnections: 0,
  authenticatedConnections: 0,
  subscribedConnections: 0,
  listenerSignals: 0,
  notificationsReceived: 0,
  notificationBatches: 0,
  coalescedSignals: 0,
  sharedEventQueries: 0,
  catchUpQueries: 0,
  eventsFetched: 0,
  clientBatchesConsidered: 0,
  clientsSkippedByTable: 0,
  eventsRejectedByAuthorization: 0,
  eventsRejectedByBinding: 0,
  deliveryMessages: 0,
  eventsDelivered: 0,
  deliveryErrors: 0,
  listenerRestarts: 0,
  deliveryLatencyMilliseconds: [],
};

export function realtimeMetricsSnapshot() {
  const { deliveryLatencyMilliseconds: samples, ...counters } = realtimeMetrics;
  return {
    ...counters,
    deliveryLatency: {
      sampleCount: samples.length,
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      p99Ms: percentile(samples, 99),
      maxMs: Number(Math.max(0, ...samples).toFixed(2)),
    },
  };
}

export function resetRealtimeMetrics() {
  const gauges = {
    currentConnections: realtimeMetrics.currentConnections,
    authenticatedConnections: realtimeMetrics.authenticatedConnections,
    subscribedConnections: realtimeMetrics.subscribedConnections,
  };
  Object.keys(realtimeMetrics).forEach((key) => {
    if (Array.isArray(realtimeMetrics[key])) realtimeMetrics[key].length = 0;
    else realtimeMetrics[key] = 0;
  });
  Object.assign(realtimeMetrics, gauges);
}

function percentile(samples, requestedPercentile) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((requestedPercentile / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(2));
}

function recordDeliveryLatency(events) {
  const now = Date.now();
  for (const event of events || []) {
    const createdAt = event.created_at instanceof Date
      ? event.created_at.getTime()
      : Date.parse(event.created_at);
    if (!Number.isFinite(createdAt)) continue;
    realtimeMetrics.deliveryLatencyMilliseconds.push(Math.max(0, now - createdAt));
  }
  if (realtimeMetrics.deliveryLatencyMilliseconds.length > METRIC_SAMPLE_SIZE) {
    realtimeMetrics.deliveryLatencyMilliseconds.splice(
      0,
      realtimeMetrics.deliveryLatencyMilliseconds.length - METRIC_SAMPLE_SIZE,
    );
  }
}

export function parseChangeNotification(payload) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    const id = Number(parsed?.id);
    if (Number.isSafeInteger(id) && id >= 0) {
      return { id, table: typeof parsed.table === 'string' ? parsed.table : null };
    }
  } catch {
    // Legacy notifications contain only the numeric change-event ID.
  }
  const id = Number(payload);
  return Number.isSafeInteger(id) && id >= 0 ? { id, table: null } : null;
}

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
        if (notification.channel === 'app_change_events') {
          onChange(parseChangeNotification(notification.payload));
        }
      });
      nextClient.on('error', handleFailure);
      nextClient.on('end', () => handleFailure(new Error('PostgreSQL realtime listener ended')));
      onChange(null);
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
  const readEventBatch = options.readEventBatch || readChangeEventBatch;
  const authorizeEvents = options.authorizeEvents || authorizeChangeEventBatch;
  const getLatestEventId = options.latestEventId || latestChangeEventId;
  const startChangeListener = options.startChangeListener || startPostgresChangeListener;
  const logger = options.logger || console;
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  const clients = new Set();
  let listenerReady = false;
  let closing = false;
  let batchTimer = null;
  let sharedFlushPromise = null;
  let pendingSignal = false;
  let pendingUnknownTable = false;
  let pendingMaximumId = null;
  const pendingTables = new Set();

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
        realtimeMetrics.catchUpQueries += 1;
        const result = await readEvents(state.user, state.afterId, state.bindings);
        state.afterId = result.lastId;
        sendMessage(state.socket, {
          type: 'events',
          events: result.events,
          lastId: result.lastId,
        });
        realtimeMetrics.deliveryMessages += 1;
        realtimeMetrics.eventsDelivered += result.events.length;
        recordDeliveryLatency(result.events);
      } while (state.flushAgain && state.socket.readyState === WebSocket.OPEN);
    } catch (error) {
      realtimeMetrics.deliveryErrors += 1;
      logger.error('Unable to deliver realtime events:', error);
      closeWithError(state.socket, error);
    } finally {
      state.flushing = false;
    }
  };

  const deliverSharedPage = async (state, events, pageLastId) => {
    if (!state.user || !state.bindings || state.socket.readyState !== WebSocket.OPEN) return;
    if (Number(state.afterId) >= pageLastId) return;
    if (state.flushing) {
      state.flushAgain = true;
      return;
    }

    const candidateEvents = events.filter((event) => Number(event.id) > Number(state.afterId || 0)
      && state.bindings.some((binding) => binding.table === event.table_name
        && (!binding.event || binding.event === '*' || binding.event === event.event_type)));
    if (candidateEvents.length === 0) {
      state.afterId = pageLastId;
      realtimeMetrics.clientsSkippedByTable += 1;
      return;
    }

    state.flushing = true;
    realtimeMetrics.clientBatchesConsidered += 1;
    try {
      const filtered = await authorizeEvents(state.user, candidateEvents, state.bindings);
      state.afterId = pageLastId;
      realtimeMetrics.eventsRejectedByAuthorization += filtered.rejectedByAuthorization || 0;
      realtimeMetrics.eventsRejectedByBinding += filtered.rejectedByBinding || 0;
      sendMessage(state.socket, {
        type: 'events',
        events: filtered.events,
        lastId: pageLastId,
      });
      realtimeMetrics.deliveryMessages += 1;
      realtimeMetrics.eventsDelivered += filtered.events.length;
      recordDeliveryLatency(filtered.events);
    } catch (error) {
      realtimeMetrics.deliveryErrors += 1;
      logger.error('Unable to authorize realtime event batch:', error);
      closeWithError(state.socket, error);
    } finally {
      state.flushing = false;
      if (state.flushAgain && state.socket.readyState === WebSocket.OPEN) void flushClient(state);
    }
  };

  const flushSharedEvents = async () => {
    if (sharedFlushPromise || closing) return;
    sharedFlushPromise = (async () => {
      while (pendingSignal && !closing) {
        pendingSignal = false;
        const unknownTable = pendingUnknownTable;
        pendingUnknownTable = false;
        const signaledMaximum = pendingMaximumId;
        pendingMaximumId = null;
        const signaledTables = new Set(pendingTables);
        pendingTables.clear();

        const states = [...clients].filter((state) => state.user && state.bindings
          && state.socket.readyState === WebSocket.OPEN);
        if (states.length === 0) continue;

        const targetId = signaledMaximum ?? await getLatestEventId();
        const minimumCursor = Math.min(...states.map((state) => Number(state.afterId || 0)));
        if (!Number.isSafeInteger(targetId) || targetId <= minimumCursor) continue;

        const subscribedTables = new Set(states.flatMap((state) => state.bindings.map((binding) => binding.table)));
        const tables = unknownTable
          ? [...subscribedTables]
          : [...signaledTables].filter((table) => subscribedTables.has(table));
        realtimeMetrics.notificationBatches += 1;

        if (tables.length === 0) {
          states.forEach((state) => {
            state.afterId = Math.max(Number(state.afterId || 0), targetId);
          });
          realtimeMetrics.clientsSkippedByTable += states.length;
          continue;
        }

        let cursor = minimumCursor;
        while (cursor < targetId && !closing) {
          realtimeMetrics.sharedEventQueries += 1;
          const batch = await readEventBatch(cursor, tables, targetId, EVENT_BATCH_LIMIT);
          realtimeMetrics.eventsFetched += batch.events.length;
          const pageLastId = batch.events.length === EVENT_BATCH_LIMIT
            ? batch.lastId
            : targetId;
          await Promise.all(states.map((state) => deliverSharedPage(state, batch.events, pageLastId)));
          if (pageLastId <= cursor) break;
          cursor = pageLastId;
        }
      }
    })().catch((error) => {
      realtimeMetrics.deliveryErrors += 1;
      logger.error('Unable to flush shared realtime events:', error);
      clients.forEach((state) => state.socket.close(1011, 'Realtime delivery failed'));
    }).finally(() => {
      sharedFlushPromise = null;
      if (pendingSignal && !closing) scheduleSharedFlush(null);
    });
    await sharedFlushPromise;
  };

  const scheduleSharedFlush = (change) => {
    if (closing) return;
    realtimeMetrics.listenerSignals += 1;
    pendingSignal = true;
    if (change?.id !== undefined) {
      realtimeMetrics.notificationsReceived += 1;
      pendingMaximumId = Math.max(pendingMaximumId ?? 0, change.id);
    } else {
      pendingUnknownTable = true;
    }
    if (change?.table) pendingTables.add(change.table);
    else pendingUnknownTable = true;
    if (!change?.table || changeInvalidatesAccessContext(change.table)) {
      invalidateAccessContextCache();
    }
    if (batchTimer !== null || sharedFlushPromise) {
      realtimeMetrics.coalescedSignals += 1;
      return;
    }
    batchTimer = setTimeout(() => {
      batchTimer = null;
      void flushSharedEvents();
    }, EVENT_BATCH_DELAY_MS);
    batchTimer.unref?.();
  };

  const closeClientsForListenerRestart = () => {
    listenerReady = false;
    realtimeMetrics.listenerRestarts += 1;
    clients.forEach((state) => state.socket.close(1012, 'Realtime listener restarting'));
  };

  const stopChangeListener = await startChangeListener((change) => {
    listenerReady = true;
    scheduleSharedFlush(change);
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
      subscribed: false,
      closed: false,
    };
    clients.add(state);
    realtimeMetrics.connectionsOpened += 1;
    realtimeMetrics.currentConnections += 1;

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
          realtimeMetrics.authenticatedConnections += 1;
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
        realtimeMetrics.catchUpQueries += 1;
        const result = await readEvents(state.user, message.afterId, bindings);
        state.bindings = bindings;
        state.afterId = result.lastId;
        if (!state.subscribed) {
          state.subscribed = true;
          realtimeMetrics.subscribedConnections += 1;
        }
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
      if (!state.closed) {
        state.closed = true;
        realtimeMetrics.currentConnections = Math.max(0, realtimeMetrics.currentConnections - 1);
        if (state.user) {
          realtimeMetrics.authenticatedConnections = Math.max(0, realtimeMetrics.authenticatedConnections - 1);
        }
        if (state.subscribed) {
          realtimeMetrics.subscribedConnections = Math.max(0, realtimeMetrics.subscribedConnections - 1);
        }
      }
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
      closing = true;
      if (batchTimer !== null) {
        clearTimeout(batchTimer);
        batchTimer = null;
      }
      await sharedFlushPromise;
      clearInterval(heartbeatTimer);
      server.off('upgrade', upgradeHandler);
      clients.forEach((state) => state.socket.terminate());
      clients.clear();
      await stopChangeListener();
      await new Promise((resolve) => webSocketServer.close(resolve));
    },
  };
}
