import { useState } from 'react';
import { CalendarClock, DatabaseBackup } from 'lucide-react';
import { Button } from '../shared/Button';
import { formatBytes } from '../../lib/adminFormat';
import { runAutomaticBackup, type AutomaticBackupStatus } from '../../lib/api/adminOverview';
import { notifyAdminOverviewChanged } from '../../hooks/useAdminOverview';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');
const hourLabel = (hourUtc: number) => `${String(hourUtc).padStart(2, '0')}:00 UTC`;

/** Shows when the server makes its own backups, how they are going, and lets an administrator make one now. */
export function AutomaticBackups({ status, onChanged }: { status: AutomaticBackupStatus; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runAutomaticBackup();
      setNotice(`Backup made: ${formatBytes(result.size)} in ${Math.max(1, Math.round(result.durationMs / 1000))} s.`);
      notifyAdminOverviewChanged();
      onChanged?.();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Could not make the backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Automatic backups" className="rounded-xl border border-gray-200 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900"><CalendarClock className="h-4 w-4 text-indigo-600" /> Automatic backups</h3>
          {status.enabled ? (
            <p className="mt-1 text-sm text-gray-600">
              A full recovery set is made every day at {hourLabel(status.hourUtc)}, and the newest {status.keep} are kept. The site is unavailable for a few seconds while it runs, so it happens at a quiet hour.
            </p>
          ) : (
            <p className="mt-1 text-sm text-amber-800">Switched off. Set <code>AUTO_BACKUP_ENABLED=true</code> on the server to turn them on.</p>
          )}
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt>Last backup</dt><dd className="font-medium text-gray-900">{when(status.sets.newest?.createdAt ?? null)}</dd></div>
            {status.enabled && <div className="flex justify-between gap-3"><dt>Next backup</dt><dd className="font-medium text-gray-900">{status.running ? 'running now' : when(status.nextRunAt)}</dd></div>}
            <div className="flex justify-between gap-3"><dt>Automatic sets kept</dt><dd className="font-medium text-gray-900">{status.sets.count} · {formatBytes(status.sets.bytes)}</dd></div>
          </dl>
          {status.lastError && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">The last attempt failed: {status.lastError}</p>}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
          <p className="mt-3 text-xs text-gray-500">These copies live on the same server. Download one now and then and keep it somewhere else.</p>
        </div>
        <Button type="button" variant="outline" className="flex-none whitespace-nowrap" icon={DatabaseBackup} loading={busy || status.running} onClick={() => void runNow()}>
          Back up now
        </Button>
      </div>
    </section>
  );
}
