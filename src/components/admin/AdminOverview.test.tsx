import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminOverview } from './AdminOverview';
import { BackupStatus } from './BackupStatus';
import { SystemHealth } from './SystemHealth';
import {
  fetchAdminOverview,
  fetchPerformance,
  resetPerformanceCounters,
  type AdminOverview as OverviewData,
  type PerformanceStatus,
} from '../../lib/api/adminOverview';

vi.mock('../../lib/api/adminOverview', () => ({
  fetchAdminOverview: vi.fn(),
  fetchPerformance: vi.fn(),
  resetPerformanceCounters: vi.fn(),
}));

const backups = (overrides: Partial<OverviewData['backups']> = {}): OverviewData['backups'] => ({
  warnDays: 7, criticalDays: 30, exists: true, level: 'ok', ageDays: 2, message: 'Backups are up to date.',
  newestAt: '2026-10-07T10:00:00Z',
  recoverySets: { count: 2, bytes: 5_000_000, newest: null },
  deployDumps: { count: 3, bytes: 3_000_000, newest: null },
  safetyCopies: { count: 0, bytes: 0, newest: null },
  ...overrides,
});

const overview = (overrides: Partial<OverviewData> = {}): OverviewData => ({
  generatedAt: '2026-10-09T10:00:00Z', status: 'healthy',
  app: { version: '1.6.2', nodeVersion: 'v22.0.0', startedAt: null, uptimeSeconds: 7200 },
  database: { sizeBytes: 23_000_000, serverVersion: '17.1', migrations: { applied: 45, latest: '0045' } },
  storage: { files: 117, bytes: 160_000_000, disk: { totalBytes: 500e9, freeBytes: 450e9, freePercent: 90 } },
  backups: backups(),
  users: { total: 12, active: 11, admins: 2, needsAttention: 0 },
  content: { characters: 25, campaigns: 5 },
  housekeeping: null,
  attention: [],
  ...overrides,
});

const performance = (overrides: Partial<PerformanceStatus> = {}): PerformanceStatus => ({
  generatedAt: '2026-10-09T10:00:00Z',
  process: { startedAt: '2026-10-09T08:00:00Z', uptimeSeconds: 7200, residentMemoryBytes: 120_000_000, heapUsedBytes: 30_000_000, eventLoopDelay: { p50Ms: 20, p95Ms: 25, p99Ms: 30, maxMs: 80 } },
  requests: {
    total: 500, completed: 499, failed: 5, slow: 1, inFlight: 1, slowThresholdMs: 500, p50Ms: 3, p95Ms: 40, p99Ms: 90, maxMs: 200,
    routes: [
      { method: 'POST', route: '/api/data/query', count: 400, failed: 0, slow: 0, averageMs: 10, p50Ms: 5, p95Ms: 620, p99Ms: 700 },
      { method: 'GET', route: '/api/auth/session', count: 2, failed: 0, slow: 0, averageMs: 5, p50Ms: 5, p95Ms: 9, p99Ms: 9 },
    ],
  },
  database: {
    pool: { configuredMaximum: 10, totalConnections: 4, idleConnections: 3, waitingRequests: 0 },
    queries: { count: 1200, errors: 0, slow: 0, slowThresholdMs: 500, p50Ms: 0.3, p95Ms: 3, p99Ms: 9 },
    postgres: { serverVersion: '17.1', connections: 4, activeConnections: 1, cacheHitPercent: 99.5, transactionsCommitted: 50_000, transactionsRolledBack: 3, deadlocks: 0, temporaryFiles: 0 },
  },
  realtime: { currentConnections: 3, authenticatedConnections: 3, subscribedConnections: 2, eventsDelivered: 800, deliveryErrors: 0, listenerRestarts: 0, deliveryLatency: { p50Ms: 10, p95Ms: 20, p99Ms: 30 } },
  ...overrides,
});

describe('backup status', () => {
  it('reassures when backups are current and offers no button', () => {
    render(<BackupStatus backups={backups()} onCreate={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Backup status' });
    expect(region).toHaveAttribute('data-level', 'ok');
    expect(within(region).getByText('Last backup 2 days ago')).toBeInTheDocument();
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
  });

  it('warns about an old backup and offers to create one', () => {
    const onCreate = vi.fn();
    render(<BackupStatus backups={backups({ level: 'warning', ageDays: 12 })} onCreate={onCreate} />);
    expect(screen.getByRole('region', { name: 'Backup status' })).toHaveAttribute('data-level', 'warning');
    expect(screen.getByText('Last backup was 12 days ago')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create a backup now/ }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('lists automatic pre-restore copies separately and says they are not counted', () => {
    render(<BackupStatus backups={backups({ safetyCopies: { count: 1, bytes: 70_000, newest: null } })} />);
    expect(screen.getByText(/before a restore \(not counted\)/)).toBeInTheDocument();
  });

  it('says plainly when there is no backup at all', () => {
    render(<BackupStatus backups={backups({ exists: false, level: 'critical', ageDays: null, newestAt: null })} />);
    expect(screen.getByText('No backup has been made yet')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Backup status' })).toHaveAttribute('data-level', 'critical');
  });

  it('explains when the status could not be loaded', () => {
    render(<BackupStatus backups={null} error="boom" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not check backup status: boom');
  });
});

describe('admin overview', () => {
  beforeEach(() => { vi.mocked(fetchAdminOverview).mockReset(); });

  it('shows what needs attention and routes each item to the right place', async () => {
    vi.mocked(fetchAdminOverview).mockResolvedValue(overview({
      status: 'critical',
      backups: backups({ exists: false, level: 'critical', ageDays: null, newestAt: null }),
      attention: [
        { severity: 'critical', code: 'backup', title: 'No backups yet', detail: 'No backup has been made yet. Create one in Backup & Restore.', section: 'backups' },
        { severity: 'info', code: 'users-attention', title: '2 accounts need attention', detail: 'never signed in', section: 'users' },
      ],
    }));
    const onOpenTab = vi.fn();
    const onOpenBackups = vi.fn();
    render(<AdminOverview onOpenTab={onOpenTab} onOpenBackups={onOpenBackups} />);

    expect(await screen.findByText('Action needed')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-severity', 'critical');
    expect(items[1]).toHaveAttribute('data-severity', 'info');

    fireEvent.click(screen.getByRole('button', { name: 'Open Backup & Restore' }));
    expect(onOpenBackups).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open Users' }));
    expect(onOpenTab).toHaveBeenCalledWith('users');
  });

  it('says so when nothing needs attention, and shows the key numbers', async () => {
    vi.mocked(fetchAdminOverview).mockResolvedValue(overview());
    render(<AdminOverview onOpenTab={vi.fn()} onOpenBackups={vi.fn()} />);
    expect(await screen.findByText(/Nothing needs attention/)).toBeInTheDocument();
    expect(screen.getByText('Everything looks good')).toBeInTheDocument();
    expect(screen.getByText('11 of 12')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText(/Version 1.6.2/)).toBeInTheDocument();
  });

  it('shows an error instead of an empty page when loading fails', async () => {
    vi.mocked(fetchAdminOverview).mockRejectedValue(new Error('server down'));
    render(<AdminOverview onOpenTab={vi.fn()} onOpenBackups={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('server down');
  });
});

describe('system health', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminOverview).mockReset();
    vi.mocked(fetchPerformance).mockReset();
    vi.mocked(resetPerformanceCounters).mockReset();
  });

  it('presents the numbers in plain language and flags slow requests', async () => {
    vi.mocked(fetchAdminOverview).mockResolvedValue(overview());
    vi.mocked(fetchPerformance).mockResolvedValue(performance());
    render(<SystemHealth />);
    expect(await screen.findByText('No problems detected.')).toBeInTheDocument();
    expect(screen.getByText('95% finish within')).toBeInTheDocument();
    expect(screen.getByText('499')).toBeInTheDocument(); // requests served
    expect(screen.getByText('POST /api/data/query')).toBeInTheDocument();
    expect(screen.queryByText('GET /api/auth/session')).not.toBeInTheDocument(); // too few samples to rank
    expect(screen.getByText('620 ms')).toHaveClass('text-red-700'); // over the 500 ms target
  });

  it('lists findings from the server and warns about pool waits', async () => {
    vi.mocked(fetchAdminOverview).mockResolvedValue(overview({
      attention: [{ severity: 'warning', code: 'pool-waiting', title: 'Requests are waiting for a database connection', detail: '3 waiting', section: 'system' }],
    }));
    vi.mocked(fetchPerformance).mockResolvedValue(performance({
      database: { ...performance().database, pool: { configuredMaximum: 10, totalConnections: 10, idleConnections: 0, waitingRequests: 3 } },
    }));
    render(<SystemHealth />);
    expect(await screen.findByText(/Requests are waiting for a database connection\./)).toBeInTheDocument();
    expect(screen.getByText('Requests waiting for a connection').nextElementSibling).toHaveClass('text-red-700');
  });

  it('asks before resetting the counters', async () => {
    vi.mocked(fetchAdminOverview).mockResolvedValue(overview());
    vi.mocked(fetchPerformance).mockResolvedValue(performance());
    vi.mocked(resetPerformanceCounters).mockResolvedValue({ resetAt: 'now' });
    render(<SystemHealth />);
    fireEvent.click(await screen.findByRole('button', { name: /Reset counters/ }));
    const dialog = await screen.findByRole('dialog');
    expect(resetPerformanceCounters).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset counters' }));
    await waitFor(() => expect(resetPerformanceCounters).toHaveBeenCalledTimes(1));
  });
});
