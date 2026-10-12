import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomaticBackups } from './AutomaticBackups';
import type { AutomaticBackupStatus } from '../../lib/api/adminOverview';

const run = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api/adminOverview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/adminOverview')>()),
  runAutomaticBackup: run,
}));

const status = (overrides: Partial<AutomaticBackupStatus> = {}): AutomaticBackupStatus => ({
  enabled: true, hourUtc: 2, keep: 7, running: false, nextRunAt: '2026-10-10T02:00:00.000Z', lastStartedAt: null,
  lastCompletedAt: null, lastReason: null, lastError: null, lastResult: null,
  sets: { count: 3, bytes: 480_000_000, newest: { filename: 'x', size: 160_000_000, createdAt: '2026-10-09T02:00:30.000Z' } },
  ...overrides,
});

describe('AutomaticBackups', () => {
  beforeEach(() => run.mockReset());

  it('describes the schedule and retention', () => {
    render(<AutomaticBackups status={status()} />);
    expect(screen.getByText(/every day at 02:00 UTC, and the newest 7 are kept/i)).toBeInTheDocument();
    expect(screen.getByText(/3 · /)).toBeInTheDocument();
  });

  it('says so when the schedule is off', () => {
    render(<AutomaticBackups status={status({ enabled: false })} />);
    expect(screen.getByText(/Switched off/)).toBeInTheDocument();
    expect(screen.queryByText('Next backup')).not.toBeInTheDocument();
  });

  it('shows the last failure', () => {
    render(<AutomaticBackups status={status({ lastError: 'Not enough free disk space' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not enough free disk space');
  });

  it('makes a backup on request and reports the result', async () => {
    run.mockResolvedValue({ filename: 'f', size: 160_000_000, durationMs: 4200, prunedCount: 0 });
    const onChanged = vi.fn();
    render(<AutomaticBackups status={status()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /back up now/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Backup made/));
    expect(onChanged).toHaveBeenCalled();
  });
});
