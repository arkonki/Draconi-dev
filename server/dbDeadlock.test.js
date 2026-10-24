import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deadlock = () => Object.assign(new Error('deadlock detected'), { code: '40P01', detail: 'Process 1 waits for ShareLock on transaction 2; blocked by process 3.' });

describe('deadlock handling', () => {
  let db;
  let calls;
  let warnings;

  beforeEach(async () => {
    calls = 0;
    warnings = [];
    vi.spyOn(console, 'warn').mockImplementation((line) => warnings.push(JSON.parse(line)));
    vi.resetModules();
    vi.doMock('pg', () => {
      class Pool {
        on() {}
        async connect() { return { query: async (sql) => { if (sql === 'FAIL') throw deadlock(); return { rows: [] }; }, release() {} }; }
        async query() { return { rows: [] }; }
      }
      return { default: { Pool } };
    });
    db = await import('./db.js');
    db.resetDatabaseMetrics();
  });

  afterEach(() => {
    vi.doUnmock('pg');
    vi.restoreAllMocks();
  });

  it('retries a deadlocked transaction, counts it, and logs the retry with its label', async () => {
    const result = await db.withTransaction(async (client) => {
      calls += 1;
      if (calls === 1) await client.query('FAIL');
      return 'done';
    }, { retryDeadlocks: 2, label: 'data:characters:update' });
    expect(result).toBe('done');
    expect(calls).toBe(2);
    expect(warnings.map((w) => w.event)).toEqual(['database_deadlock', 'database_deadlock_retry']);
    expect(warnings[0].detail).toContain('ShareLock');
    expect(warnings[1]).toMatchObject({ label: 'data:characters:update', attempt: 1 });
    expect(db.databaseMetricsSnapshot().queries.deadlocks).toBe(1);
  });

  it('gives up after the allowed retries and reports the error', async () => {
    await expect(db.withTransaction(async (client) => { calls += 1; await client.query('FAIL'); }, { retryDeadlocks: 1 }))
      .rejects.toMatchObject({ code: '40P01' });
    expect(calls).toBe(2);
    expect(db.databaseMetricsSnapshot().queries.deadlocks).toBe(2);
  });
});
