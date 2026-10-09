import { describe, expect, it } from 'vitest';
import { assessBackup, assessDisk, assessPerformance, buildAttention, overallStatus } from './adminAssessment.js';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 86_400_000).toISOString();

describe('backup age', () => {
  it('is critical when there is no backup at all', () => {
    expect(assessBackup({ newestAt: null, now: NOW })).toMatchObject({ exists: false, level: 'critical' });
  });

  it('is ok when recent, a warning after a week, critical after a month', () => {
    expect(assessBackup({ newestAt: daysAgo(2), now: NOW })).toMatchObject({ exists: true, level: 'ok' });
    expect(assessBackup({ newestAt: daysAgo(10), now: NOW })).toMatchObject({ level: 'warning', message: expect.stringContaining('10 days') });
    expect(assessBackup({ newestAt: daysAgo(45), now: NOW })).toMatchObject({ level: 'critical' });
  });

  it('honours custom thresholds', () => {
    expect(assessBackup({ newestAt: daysAgo(2), now: NOW, warnDays: 1, criticalDays: 3 }).level).toBe('warning');
    expect(assessBackup({ newestAt: daysAgo(4), now: NOW, warnDays: 1, criticalDays: 3 }).level).toBe('critical');
  });
});

describe('disk space', () => {
  const gib = 1024 ** 3;
  it('grades free space', () => {
    expect(assessDisk({ totalBytes: 100 * gib, freeBytes: 50 * gib }).level).toBe('ok');
    expect(assessDisk({ totalBytes: 100 * gib, freeBytes: 8 * gib }).level).toBe('warning');
    expect(assessDisk({ totalBytes: 100 * gib, freeBytes: 4 * gib }).level).toBe('critical');
    expect(assessDisk({ totalBytes: 1000 * gib, freeBytes: 2.5 * gib }).level).toBe('critical');
    expect(assessDisk({ totalBytes: 1000 * gib, freeBytes: 0.5 * gib }).level).toBe('critical');
    expect(assessDisk({ totalBytes: 10 * gib, freeBytes: 2.5 * gib }).level).toBe('warning'); // 25% free, but under 3 GiB
    expect(assessDisk({ totalBytes: 200 * gib, freeBytes: 2.5 * gib }).level).toBe('critical');
    expect(assessDisk({ totalBytes: 1000 * gib, freeBytes: 2.9 * gib }).level).toBe('critical');
  });

  it('does not alarm on a huge disk that still has plenty of absolute space', () => {
    expect(assessDisk({ totalBytes: 14_000 * gib, freeBytes: 12_000 * gib }).level).toBe('ok');
    expect(assessDisk({ totalBytes: 14_000 * gib, freeBytes: 600 * gib }).level).toBe('ok'); // 4.3%, but 600 GiB
    expect(assessDisk({ totalBytes: 14_000 * gib, freeBytes: 40 * gib }).level).toBe('warning');
  });

  it('says nothing when the size is unknown', () => {
    expect(assessDisk(null)).toBeNull();
    expect(assessDisk({ totalBytes: 0, freeBytes: 0 })).toBeNull();
  });
});

const healthy = () => ({
  process: { uptimeSeconds: 3600, eventLoopDelay: { p99Ms: 20 } },
  requests: { completed: 1000, failed: 0, slow: 0, sampleCount: 1000, p95Ms: 30, slowThresholdMs: 500 },
  database: {
    pool: { waitingRequests: 0, configuredMaximum: 10 },
    queries: { slow: 0, slowThresholdMs: 500 },
    postgres: { deadlocks: 0, cacheHitPercent: 99, transactionsCommitted: 50_000 },
  },
  realtime: { deliveryErrors: 0, listenerRestarts: 0 },
});

describe('performance findings', () => {
  it('finds nothing wrong with a healthy snapshot, or a freshly restarted process', () => {
    expect(assessPerformance(healthy())).toEqual([]);
    const fresh = healthy(); fresh.process.uptimeSeconds = 10; fresh.requests.failed = 900;
    expect(assessPerformance(fresh)).toEqual([]);
    expect(assessPerformance(null)).toEqual([]);
  });

  it('explains problems in plain language', () => {
    const bad = healthy();
    bad.requests.failed = 120;
    bad.requests.p95Ms = 900;
    bad.database.pool.waitingRequests = 3;
    bad.database.postgres.deadlocks = 1;
    bad.process.eventLoopDelay.p99Ms = 400;
    bad.realtime.deliveryErrors = 2;
    const codes = assessPerformance(bad).map((finding) => finding.code);
    expect(codes).toEqual(expect.arrayContaining(['failed-requests', 'slow-api', 'pool-waiting', 'deadlocks', 'event-loop', 'realtime-errors']));
  });

  it('treats a few slow requests as information, not a warning', () => {
    const snapshot = healthy(); snapshot.requests.slow = 2;
    expect(assessPerformance(snapshot)).toEqual([expect.objectContaining({ code: 'slow-requests', severity: 'info' })]);
  });
});

describe('attention list', () => {
  const base = {
    backup: { exists: true, level: 'ok', message: 'ok' },
    disk: null,
    users: { needsAttention: 0 },
    housekeeping: null,
    adminCount: 2,
    performanceFindings: [],
  };

  it('is empty and healthy when nothing needs doing', () => {
    expect(buildAttention(base)).toEqual([]);
    expect(overallStatus([])).toBe('healthy');
  });

  it('orders by severity and sets the overall status', () => {
    const items = buildAttention({
      ...base,
      backup: { exists: false, level: 'critical', message: 'No backup has been made yet.' },
      users: { needsAttention: 2 },
      adminCount: 1,
      housekeeping: { lastError: 'boom' },
      performanceFindings: [{ severity: 'warning', code: 'slow-api', title: 'The API is slow', detail: 'x' }],
    });
    expect(items.map((item) => item.severity)).toEqual(['critical', 'warning', 'warning', 'info', 'info']);
    expect(items[0]).toMatchObject({ code: 'backup', section: 'backups' });
    expect(items.find((item) => item.code === 'users-attention').title).toBe('2 accounts need attention');
    expect(overallStatus(items)).toBe('critical');
    expect(overallStatus(items.filter((item) => item.severity !== 'critical'))).toBe('attention');
    expect(overallStatus(items.filter((item) => item.severity === 'info'))).toBe('healthy');
  });
});
