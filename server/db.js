import { performance } from 'node:perf_hooks';
import pg from 'pg';

const { Pool } = pg;

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const config = Object.freeze({
  poolSize: integerSetting('DB_POOL_SIZE', 10, 1, 100),
  connectionTimeoutMillis: integerSetting('DB_CONNECTION_TIMEOUT_MS', 5_000, 250, 120_000),
  queryTimeoutMillis: integerSetting('DB_QUERY_TIMEOUT_MS', 15_000, 250, 300_000),
  statementTimeoutMillis: integerSetting('DB_STATEMENT_TIMEOUT_MS', 15_000, 250, 300_000),
  slowQueryMillis: integerSetting('DB_SLOW_QUERY_MS', 500, 1, 300_000),
  sampleSize: integerSetting('PERFORMANCE_SAMPLE_SIZE', 1_024, 32, 4_096),
});

const metrics = {
  acquisitionCount: 0,
  acquisitionErrors: 0,
  acquisitionWaitMilliseconds: [],
  queryCount: 0,
  queryErrors: 0,
  slowQueryCount: 0,
  queryMilliseconds: [],
};

function addSample(samples, value) {
  samples.push(value);
  if (samples.length > config.sampleSize) samples.splice(0, samples.length - config.sampleSize);
}

function percentile(samples, requestedPercentile) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((requestedPercentile / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(2));
}

function queryCommand(args) {
  const first = args[0];
  const text = typeof first === 'string' ? first : first?.text;
  return String(text || 'unknown').trim().split(/\s+/, 1)[0].toUpperCase() || 'UNKNOWN';
}

function recordQuery(startedAt, command, error = null) {
  const duration = performance.now() - startedAt;
  metrics.queryCount += 1;
  if (error) metrics.queryErrors += 1;
  addSample(metrics.queryMilliseconds, duration);
  if (duration >= config.slowQueryMillis) {
    metrics.slowQueryCount += 1;
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'slow_database_query',
      command,
      durationMs: Number(duration.toFixed(2)),
      failed: Boolean(error),
    }));
  }
}

const INSTRUMENTED_CLIENT = Symbol('draconiInstrumentedClient');

function instrumentClient(client) {
  if (!client || client[INSTRUMENTED_CLIENT]) return client;
  const originalQuery = client.query.bind(client);
  Object.defineProperty(client, INSTRUMENTED_CLIENT, { value: true });

  client.query = (...args) => {
    const startedAt = performance.now();
    const command = queryCommand(args);
    const callbackIndex = typeof args.at(-1) === 'function' ? args.length - 1 : -1;

    if (callbackIndex >= 0) {
      const callback = args[callbackIndex];
      args[callbackIndex] = (error, ...callbackArgs) => {
        recordQuery(startedAt, command, error);
        callback(error, ...callbackArgs);
      };
      try {
        return originalQuery(...args);
      } catch (error) {
        recordQuery(startedAt, command, error);
        throw error;
      }
    }

    try {
      const result = originalQuery(...args);
      if (!result || typeof result.then !== 'function') {
        recordQuery(startedAt, command);
        return result;
      }
      return result.then(
        (value) => {
          recordQuery(startedAt, command);
          return value;
        },
        (error) => {
          recordQuery(startedAt, command, error);
          throw error;
        },
      );
    } catch (error) {
      recordQuery(startedAt, command, error);
      throw error;
    }
  };
  return client;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: config.poolSize,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: config.connectionTimeoutMillis,
  query_timeout: config.queryTimeoutMillis,
  statement_timeout: config.statementTimeoutMillis,
  application_name: 'draconi-api',
});

const originalConnect = pool.connect.bind(pool);
pool.connect = (callback) => {
  const startedAt = performance.now();
  if (typeof callback === 'function') {
    return originalConnect((error, client, release) => {
      metrics.acquisitionCount += 1;
      if (error) metrics.acquisitionErrors += 1;
      addSample(metrics.acquisitionWaitMilliseconds, performance.now() - startedAt);
      callback(error, instrumentClient(client), release);
    });
  }
  return originalConnect().then(
    (client) => {
      metrics.acquisitionCount += 1;
      addSample(metrics.acquisitionWaitMilliseconds, performance.now() - startedAt);
      return instrumentClient(client);
    },
    (error) => {
      metrics.acquisitionCount += 1;
      metrics.acquisitionErrors += 1;
      addSample(metrics.acquisitionWaitMilliseconds, performance.now() - startedAt);
      throw error;
    },
  );
};

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export function databaseMetricsSnapshot() {
  const querySamples = metrics.queryMilliseconds;
  const acquisitionSamples = metrics.acquisitionWaitMilliseconds;
  return {
    pool: {
      configuredMaximum: config.poolSize,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
      connectionTimeoutMs: config.connectionTimeoutMillis,
      queryTimeoutMs: config.queryTimeoutMillis,
      statementTimeoutMs: config.statementTimeoutMillis,
    },
    acquisitions: {
      count: metrics.acquisitionCount,
      errors: metrics.acquisitionErrors,
      sampleCount: acquisitionSamples.length,
      p50Ms: percentile(acquisitionSamples, 50),
      p95Ms: percentile(acquisitionSamples, 95),
      p99Ms: percentile(acquisitionSamples, 99),
      maxMs: Number(Math.max(0, ...acquisitionSamples).toFixed(2)),
    },
    queries: {
      count: metrics.queryCount,
      errors: metrics.queryErrors,
      slow: metrics.slowQueryCount,
      slowThresholdMs: config.slowQueryMillis,
      sampleCount: querySamples.length,
      p50Ms: percentile(querySamples, 50),
      p95Ms: percentile(querySamples, 95),
      p99Ms: percentile(querySamples, 99),
      maxMs: Number(Math.max(0, ...querySamples).toFixed(2)),
    },
  };
}

export function resetDatabaseMetrics() {
  metrics.acquisitionCount = 0;
  metrics.acquisitionErrors = 0;
  metrics.acquisitionWaitMilliseconds.length = 0;
  metrics.queryCount = 0;
  metrics.queryErrors = 0;
  metrics.slowQueryCount = 0;
  metrics.queryMilliseconds.length = 0;
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withReadSnapshot(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 500, 3000)));
    }
  }
  throw lastError;
}
