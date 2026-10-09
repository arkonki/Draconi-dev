// Pure rules that turn raw measurements into plain-language findings. No I/O, so they are unit tested
// without a database. Used by adminOverview.js.
const BACKUP_WARN_DAYS = Number(process.env.BACKUP_WARN_DAYS || 7);
const BACKUP_CRITICAL_DAYS = Number(process.env.BACKUP_CRITICAL_DAYS || 30);
const DAY_MS = 86_400_000;
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export { BACKUP_WARN_DAYS, BACKUP_CRITICAL_DAYS };

export function assessBackup({ newestAt, now = Date.now(), warnDays = BACKUP_WARN_DAYS, criticalDays = BACKUP_CRITICAL_DAYS }) {
  if (!newestAt) {
    return { exists: false, level: 'critical', ageDays: null, message: 'No backup has been made yet.' };
  }
  const ageDays = Math.max(0, (now - new Date(newestAt).getTime()) / DAY_MS);
  if (ageDays > criticalDays) {
    return { exists: true, level: 'critical', ageDays, message: `The newest backup is ${Math.floor(ageDays)} days old.` };
  }
  if (ageDays > warnDays) {
    return { exists: true, level: 'warning', ageDays, message: `The newest backup is ${Math.floor(ageDays)} days old.` };
  }
  return { exists: true, level: 'ok', ageDays, message: 'Backups are up to date.' };
}

// Percentages alone misjudge very large disks (5% of 14 TB is 700 GB), so each percentage rule also needs the
// absolute free space to be small.
export function assessDisk(disk) {
  if (!disk || !disk.totalBytes) return null;
  const freePercent = (disk.freeBytes / disk.totalBytes) * 100;
  const gib = disk.freeBytes / 1024 ** 3;
  if (gib < 1 || (freePercent < 5 && gib < 20)) return { level: 'critical', freePercent, message: `Only ${gib.toFixed(1)} GiB of disk space is free.` };
  if (gib < 3 || (freePercent < 10 && gib < 50)) return { level: 'warning', freePercent, message: `Disk space is getting low (${gib.toFixed(1)} GiB free).` };
  return { level: 'ok', freePercent, message: 'Plenty of disk space.' };
}

// Plain-language findings from the live performance counters. They reset when the API restarts, so very
// short-lived processes are not judged.
export function assessPerformance(snapshot) {
  const findings = [];
  if (!snapshot || snapshot.process.uptimeSeconds < 60) return findings;
  const { requests, database, process: runtime, realtime } = snapshot;

  if (requests.completed >= 50 && requests.failed / requests.completed > 0.05) {
    findings.push({ severity: 'warning', code: 'failed-requests', title: 'Many requests are failing', detail: `${requests.failed} of ${requests.completed} requests failed since the last restart.` });
  }
  if (requests.sampleCount >= 50 && requests.p95Ms > requests.slowThresholdMs) {
    findings.push({ severity: 'warning', code: 'slow-api', title: 'The API is slow', detail: `95% of requests finish within ${Math.round(requests.p95Ms)} ms, above the ${requests.slowThresholdMs} ms target.` });
  } else if (requests.slow > 0) {
    findings.push({ severity: 'info', code: 'slow-requests', title: 'Some slow requests', detail: `${requests.slow} request${requests.slow === 1 ? '' : 's'} took longer than ${requests.slowThresholdMs} ms.` });
  }
  if (database.pool.waitingRequests > 0) {
    findings.push({ severity: 'warning', code: 'pool-waiting', title: 'Requests are waiting for a database connection', detail: `${database.pool.waitingRequests} waiting; the pool allows ${database.pool.configuredMaximum} connections.` });
  }
  if (database.postgres.deadlocks > 0) {
    findings.push({ severity: 'warning', code: 'deadlocks', title: 'Database deadlocks detected', detail: `${database.postgres.deadlocks} deadlock${database.postgres.deadlocks === 1 ? '' : 's'} recorded.` });
  }
  if (database.postgres.cacheHitPercent < 90 && database.postgres.transactionsCommitted > 1000) {
    findings.push({ severity: 'info', code: 'cache-hit', title: 'Database cache is missing often', detail: `Only ${database.postgres.cacheHitPercent}% of reads came from memory.` });
  }
  if (database.queries.slow > 0) {
    findings.push({ severity: 'info', code: 'slow-queries', title: 'Some slow database queries', detail: `${database.queries.slow} quer${database.queries.slow === 1 ? 'y' : 'ies'} took longer than ${database.queries.slowThresholdMs} ms.` });
  }
  if (runtime.eventLoopDelay.p99Ms > 250) {
    findings.push({ severity: 'warning', code: 'event-loop', title: 'The server is struggling to keep up', detail: `The busiest moments delay work by ${Math.round(runtime.eventLoopDelay.p99Ms)} ms.` });
  }
  if (realtime.deliveryErrors > 0) {
    findings.push({ severity: 'warning', code: 'realtime-errors', title: 'Live updates failed to reach some players', detail: `${realtime.deliveryErrors} delivery error${realtime.deliveryErrors === 1 ? '' : 's'}.` });
  }
  if (realtime.listenerRestarts > 0) {
    findings.push({ severity: 'info', code: 'realtime-restarts', title: 'The live-update listener restarted', detail: `${realtime.listenerRestarts} restart${realtime.listenerRestarts === 1 ? '' : 's'}.` });
  }
  return findings;
}

export function buildAttention({ backup, disk, users, housekeeping, adminCount, performanceFindings }) {
  const items = [];
  if (backup.level !== 'ok') {
    items.push({
      severity: backup.level,
      code: 'backup',
      title: backup.exists ? 'Backups are out of date' : 'No backups yet',
      detail: `${backup.message} Create one in Backup & Restore.`,
      section: 'backups',
    });
  }
  const diskState = assessDisk(disk);
  if (diskState && diskState.level !== 'ok') {
    items.push({ severity: diskState.level, code: 'disk', title: 'Low disk space', detail: diskState.message, section: 'system' });
  }
  if (adminCount === 1) {
    items.push({ severity: 'info', code: 'single-admin', title: 'Only one administrator', detail: 'If that account is lost nobody can manage the site. Consider promoting a second administrator.', section: 'users' });
  }
  if (users.needsAttention > 0) {
    items.push({
      severity: 'info',
      code: 'users-attention',
      title: `${users.needsAttention} account${users.needsAttention === 1 ? '' : 's'} need attention`,
      detail: 'These active accounts have never signed in or have no password set.',
      section: 'users',
    });
  }
  if (housekeeping?.lastError) {
    items.push({ severity: 'warning', code: 'housekeeping-error', title: 'Automatic cleanup failed', detail: housekeeping.lastError, section: 'maintenance' });
  }
  if (housekeeping?.lastResult?.backlogRemaining) {
    items.push({ severity: 'info', code: 'housekeeping-backlog', title: 'Cleanup has more to do', detail: 'The batch limit was reached. Run cleanup again to continue.', section: 'maintenance' });
  }
  for (const finding of performanceFindings) items.push({ ...finding, section: 'system' });
  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function overallStatus(attention) {
  if (attention.some((item) => item.severity === 'critical')) return 'critical';
  if (attention.some((item) => item.severity === 'warning')) return 'attention';
  return 'healthy';
}
