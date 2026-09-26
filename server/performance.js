import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { authorizationCacheSnapshot } from './data.js';
import { databaseMetricsSnapshot, pool, resetDatabaseMetrics } from './db.js';
import { HttpError } from './http.js';
import { realtimeMetricsSnapshot, resetRealtimeMetrics } from './realtime.js';

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const SLOW_REQUEST_MS = integerSetting('SLOW_REQUEST_MS', 500, 1, 300_000);
const SAMPLE_SIZE = integerSetting('PERFORMANCE_SAMPLE_SIZE', 1_024, 32, 4_096);
const startedAt = new Date();
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();

const requestState = {
  total: 0,
  completed: 0,
  failed: 0,
  slow: 0,
  inFlight: 0,
  milliseconds: [],
  routes: new Map(),
};

function addSample(samples, value) {
  samples.push(value);
  if (samples.length > SAMPLE_SIZE) samples.splice(0, samples.length - SAMPLE_SIZE);
}

function percentile(samples, requestedPercentile) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((requestedPercentile / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(2));
}

function normalizePath(pathname) {
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/oauth/') && pathname !== '/mcp'
    && !pathname.startsWith('/health/')) return 'frontend';
  if (pathname.startsWith('/api/storage/public/')) return '/api/storage/public/:bucket/:path';
  if (pathname.startsWith('/api/storage/')) return '/api/storage/:bucket/:path';
  if (pathname.startsWith('/api/admin/recovery/backups/')) return '/api/admin/recovery/backups/:filename';
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[A-Za-z0-9_-]{25,}(?=\/|$)/g, '/:token')
    .replace(/\/\d+(?=\/|$)/g, '/:number');
}

function routeSnapshot(route) {
  return {
    method: route.method,
    route: route.route,
    count: route.count,
    failed: route.failed,
    slow: route.slow,
    averageMs: route.count ? Number((route.totalMs / route.count).toFixed(2)) : 0,
    p50Ms: percentile(route.milliseconds, 50),
    p95Ms: percentile(route.milliseconds, 95),
    p99Ms: percentile(route.milliseconds, 99),
    maxMs: Number(route.maxMs.toFixed(2)),
  };
}

export function trackHttpRequest(request, response, pathname) {
  const requestStartedAt = performance.now();
  const normalizedPath = normalizePath(pathname);
  const key = `${request.method} ${normalizedPath}`;
  requestState.total += 1;
  requestState.inFlight += 1;
  let recorded = false;

  const record = () => {
    if (recorded) return;
    recorded = true;
    const duration = performance.now() - requestStartedAt;
    const failed = response.statusCode >= 500;
    const slow = duration >= SLOW_REQUEST_MS;
    requestState.completed += 1;
    requestState.inFlight = Math.max(0, requestState.inFlight - 1);
    if (failed) requestState.failed += 1;
    if (slow) requestState.slow += 1;
    addSample(requestState.milliseconds, duration);

    const route = requestState.routes.get(key) || {
      method: request.method,
      route: normalizedPath,
      count: 0,
      failed: 0,
      slow: 0,
      totalMs: 0,
      maxMs: 0,
      milliseconds: [],
    };
    route.count += 1;
    route.totalMs += duration;
    route.maxMs = Math.max(route.maxMs, duration);
    if (failed) route.failed += 1;
    if (slow) route.slow += 1;
    addSample(route.milliseconds, duration);
    requestState.routes.set(key, route);

    if (slow) {
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'slow_http_request',
        requestId: request.requestId,
        method: request.method,
        route: normalizedPath,
        status: response.statusCode,
        durationMs: Number(duration.toFixed(2)),
      }));
    }
  };

  response.once('finish', record);
  response.once('close', record);
}

function finiteMilliseconds(nanoseconds) {
  const milliseconds = nanoseconds / 1_000_000;
  return Number.isFinite(milliseconds) ? Number(milliseconds.toFixed(2)) : 0;
}

async function postgresSnapshot() {
  const { rows } = await pool.query(
    `SELECT
       current_database() AS database_name,
       current_setting('server_version') AS server_version,
       stats.numbackends AS connections,
       stats.xact_commit,
       stats.xact_rollback,
       stats.blks_read,
       stats.blks_hit,
       stats.temp_files,
       stats.temp_bytes,
       stats.deadlocks,
       activity.waiting_connections,
       activity.active_connections,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS pg_stat_statements_available
     FROM pg_stat_database stats
     CROSS JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL)::integer AS waiting_connections,
         COUNT(*) FILTER (WHERE state = 'active')::integer AS active_connections
       FROM pg_stat_activity
       WHERE datname = current_database()
     ) activity
     WHERE stats.datname = current_database()`,
  );
  const row = rows[0] || {};
  const blocksRead = Number(row.blks_read || 0);
  const blocksHit = Number(row.blks_hit || 0);
  return {
    databaseName: row.database_name,
    serverVersion: row.server_version,
    connections: Number(row.connections || 0),
    activeConnections: Number(row.active_connections || 0),
    waitingConnections: Number(row.waiting_connections || 0),
    transactionsCommitted: Number(row.xact_commit || 0),
    transactionsRolledBack: Number(row.xact_rollback || 0),
    cacheHitPercent: blocksHit + blocksRead > 0
      ? Number(((blocksHit / (blocksHit + blocksRead)) * 100).toFixed(2))
      : 100,
    temporaryFiles: Number(row.temp_files || 0),
    temporaryBytes: Number(row.temp_bytes || 0),
    deadlocks: Number(row.deadlocks || 0),
    pgStatStatementsAvailable: Boolean(row.pg_stat_statements_available),
  };
}

export async function performanceStatus(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required');
  const postgres = await postgresSnapshot();
  const memory = process.memoryUsage();
  const requestSamples = requestState.milliseconds;
  return {
    generatedAt: new Date().toISOString(),
    process: {
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      residentMemoryBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      eventLoopDelay: {
        p50Ms: finiteMilliseconds(eventLoopDelay.percentile(50)),
        p95Ms: finiteMilliseconds(eventLoopDelay.percentile(95)),
        p99Ms: finiteMilliseconds(eventLoopDelay.percentile(99)),
        maxMs: finiteMilliseconds(eventLoopDelay.max),
      },
    },
    requests: {
      total: requestState.total,
      completed: requestState.completed,
      failed: requestState.failed,
      slow: requestState.slow,
      inFlight: requestState.inFlight,
      slowThresholdMs: SLOW_REQUEST_MS,
      sampleCount: requestSamples.length,
      p50Ms: percentile(requestSamples, 50),
      p95Ms: percentile(requestSamples, 95),
      p99Ms: percentile(requestSamples, 99),
      maxMs: Number(Math.max(0, ...requestSamples).toFixed(2)),
      routes: [...requestState.routes.values()]
        .map(routeSnapshot)
        .sort((left, right) => right.p95Ms - left.p95Ms),
    },
    database: {
      ...databaseMetricsSnapshot(),
      postgres,
    },
    authorizationCache: authorizationCacheSnapshot(),
    realtime: realtimeMetricsSnapshot(),
  };
}

export function resetPerformanceMetrics(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Administrator access is required');
  requestState.total = 0;
  requestState.completed = 0;
  requestState.failed = 0;
  requestState.slow = 0;
  requestState.milliseconds.length = 0;
  requestState.routes.clear();
  resetDatabaseMetrics();
  resetRealtimeMetrics();
  eventLoopDelay.reset();
  return { resetAt: new Date().toISOString() };
}

export function stopPerformanceMonitoring() {
  eventLoopDelay.disable();
}
