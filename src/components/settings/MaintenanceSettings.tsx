import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  getHousekeepingStatus,
  runHousekeeping,
  type HousekeepingStatus,
} from '../../lib/adminMaintenance';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The housekeeping operation failed.';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not yet';
}

export function MaintenanceSettings() {
  const [status, setStatus] = useState<HousekeepingStatus | null>(null);
  const [busy, setBusy] = useState<'load' | 'run' | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy((current) => current || 'load');
    try {
      setStatus(await getHousekeepingStatus());
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy((current) => current === 'load' ? null : current);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRun = async () => {
    setBusy('run');
    setError(null);
    setNotice(null);
    try {
      const result = await runHousekeeping();
      setNotice(`Cleanup removed ${result.deletedSessions || 0} expired sessions and ${result.deletedChangeEvents || 0} old change events.`);
      await refresh();
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Housekeeping bounds the growth of expired login sessions and the collaboration change log. Cleanup uses small database batches and never removes active sessions or recent events.
      </p>

      {error && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 flex-none" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 flex-none" />
          <span>{notice}</span>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Retention cleanup</h3>
            <p className="mt-1 text-sm text-gray-500">
              {status?.enabled
                ? `Scheduled every ${status.config.intervalMinutes} minutes. Next run: ${formatDate(status.nextRunAt)}.`
                : 'Automatic housekeeping is disabled; manual cleanup remains available.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Refresh housekeeping status"
              onClick={() => void refresh()}
              disabled={busy !== null}
              className="rounded-lg border border-gray-200 p-2.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={busy !== null || status?.running}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Run cleanup now
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600"><Clock3 className="h-4 w-4" /> Eligible now</div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Expired sessions</dt><dd className="font-semibold text-gray-900">{status?.pending.expiredSessions ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Old change events</dt><dd className="font-semibold text-gray-900">{status?.pending.changeEvents ?? '—'}</dd></div>
          </dl>
        </section>

        <section className="rounded-xl border border-gray-200 p-5">
          <div className="text-sm font-medium text-gray-600">Retention policy</div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Expired sessions</dt><dd className="font-semibold text-gray-900">{status ? `${status.config.expiredSessionRetentionHours} hours` : '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Change events</dt><dd className="font-semibold text-gray-900">{status ? `${status.config.changeEventRetentionDays} days` : '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Maximum per run</dt><dd className="font-semibold text-gray-900">{status ? (status.config.batchSize * status.config.maxBatches).toLocaleString() : '—'} each</dd></div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 p-5 text-sm">
        <h3 className="font-semibold text-gray-900">Last cleanup</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-gray-500">Completed</dt><dd className="font-medium text-gray-900">{formatDate(status?.lastCompletedAt || null)}</dd></div>
          <div><dt className="text-gray-500">Started by</dt><dd className="font-medium capitalize text-gray-900">{status?.lastReason || '—'}</dd></div>
          <div><dt className="text-gray-500">Sessions removed</dt><dd className="font-medium text-gray-900">{status?.lastResult?.deletedSessions ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Events removed</dt><dd className="font-medium text-gray-900">{status?.lastResult?.deletedChangeEvents ?? '—'}</dd></div>
        </dl>
        {status?.lastError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{status.lastError}</p>}
        {status?.lastResult?.backlogRemaining && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-800">The configured batch limit was reached. Run cleanup again to continue draining the backlog.</p>}
      </section>
    </div>
  );
}
