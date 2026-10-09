import { AlertTriangle, CheckCircle2, DatabaseBackup, ShieldAlert } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../shared/Button';
import { formatAge, formatBytes } from '../../lib/adminFormat';
import type { AdminOverview } from '../../lib/api/adminOverview';

interface BackupStatusProps {
  backups: AdminOverview['backups'] | null;
  loading?: boolean;
  error?: string | null;
  /** Shown as a call to action when the backups are old or missing. */
  onCreate?: () => void;
  creating?: boolean;
}

const TONE = {
  ok: { box: 'border-green-200 bg-green-50', icon: 'text-green-600', title: 'text-green-900', Icon: CheckCircle2 },
  warning: { box: 'border-amber-300 bg-amber-50', icon: 'text-amber-600', title: 'text-amber-900', Icon: AlertTriangle },
  critical: { box: 'border-red-300 bg-red-50', icon: 'text-red-600', title: 'text-red-900', Icon: ShieldAlert },
} as const;

export function BackupStatus({ backups, loading, error, onCreate, creating }: BackupStatusProps) {
  if (error) {
    return <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Could not check backup status: {error}</div>;
  }
  if (!backups) {
    return <div className="rounded-xl border border-gray-200 p-4">{loading ? <LoadingSpinner size="sm" text="Checking backups…" /> : null}</div>;
  }

  const tone = TONE[backups.level];
  const headline = !backups.exists
    ? 'No backup has been made yet'
    : backups.level === 'ok'
      ? `Last backup ${formatAge(backups.ageDays)}`
      : `Last backup was ${formatAge(backups.ageDays)}`;
  const { recoverySets, deployDumps, safetyCopies } = backups;

  return (
    <section
      aria-label="Backup status"
      data-level={backups.level}
      className={`rounded-xl border p-4 ${tone.box}`}
    >
      <div className="flex items-start gap-3">
        <tone.Icon className={`mt-0.5 h-5 w-5 flex-none ${tone.icon}`} />
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold ${tone.title}`}>{headline}</h3>
          <p className="mt-1 text-sm text-gray-700">
            {backups.level === 'ok'
              ? `The newest backup is within the ${backups.warnDays}-day target.`
              : backups.exists
                ? `Backups should be refreshed at least every ${backups.warnDays} days.`
                : 'Without a backup, a failed disk or a mistaken deletion cannot be undone.'}
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt>Recovery sets (data and uploads)</dt>
              <dd className="whitespace-nowrap font-medium text-gray-900">{recoverySets.count} · {formatBytes(recoverySets.bytes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Database dumps made by deployments</dt>
              <dd className="whitespace-nowrap font-medium text-gray-900">{deployDumps.count} · {formatBytes(deployDumps.bytes)}</dd>
            </div>
            {safetyCopies.count > 0 && (
              <div className="flex justify-between gap-3 sm:col-span-2">
                <dt>Automatic copies made before a restore (not counted)</dt>
                <dd className="whitespace-nowrap font-medium text-gray-900">{safetyCopies.count} · {formatBytes(safetyCopies.bytes)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 sm:col-span-2">
              <dt>Newest</dt>
              <dd className="font-medium text-gray-900">
                {backups.newestAt ? new Date(backups.newestAt).toLocaleString() : 'none'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            Backups kept on this server do not survive losing the server itself. Download a recovery set now and then and keep it somewhere else.
            Deployment dumps contain the database only, not uploaded images.
          </p>
          {onCreate && backups.level !== 'ok' && (
            <Button type="button" className="mt-3" icon={DatabaseBackup} loading={creating} onClick={onCreate}>
              Create a backup now
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
