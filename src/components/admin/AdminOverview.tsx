import { AlertTriangle, CheckCircle2, Info, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { BackupStatus } from './BackupStatus';
import { useAdminOverview } from '../../hooks/useAdminOverview';
import { formatBytes, formatDuration } from '../../lib/adminFormat';
import type { AdminSection, AttentionItem, Severity } from '../../lib/api/adminOverview';

interface AdminOverviewProps {
  /** Switches to another tab of the Admin Panel. */
  onOpenTab: (tab: 'users' | 'maintenance' | 'system') => void;
  /** Opens a top-level Settings page (Backup & Restore). */
  onOpenBackups: () => void;
}

const SEVERITY = {
  critical: { Icon: ShieldAlert, box: 'border-red-300 bg-red-50', icon: 'text-red-600', label: 'Critical' },
  warning: { Icon: AlertTriangle, box: 'border-amber-300 bg-amber-50', icon: 'text-amber-600', label: 'Warning' },
  info: { Icon: Info, box: 'border-blue-200 bg-blue-50', icon: 'text-blue-600', label: 'For your information' },
} satisfies Record<Severity, { Icon: typeof Info; box: string; icon: string; label: string }>;

const ACTION_LABEL: Record<AdminSection, string> = {
  backups: 'Open Backup & Restore',
  users: 'Open Users',
  maintenance: 'Open Maintenance',
  system: 'Open System health',
};

const STATUS_PILL = {
  healthy: { text: 'Everything looks good', className: 'bg-green-100 text-green-800' },
  attention: { text: 'Needs attention', className: 'bg-amber-100 text-amber-900' },
  critical: { text: 'Action needed', className: 'bg-red-100 text-red-800' },
} as const;

export function AdminOverview({ onOpenTab, onOpenBackups }: AdminOverviewProps) {
  const { overview, loading, error, refresh } = useAdminOverview(60_000);

  const open = (item: AttentionItem) => {
    if (item.section === 'backups') onOpenBackups();
    else onOpenTab(item.section);
  };

  if (!overview) {
    return error
      ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load the overview: {error}</div>
      : <div className="flex justify-center py-12"><LoadingSpinner text="Loading overview…" /></div>;
  }

  const pill = STATUS_PILL[overview.status];
  const disk = overview.storage.disk;
  const tiles: [string, string, string?][] = [
    ['Active users', `${overview.users.active} of ${overview.users.total}`, `${overview.users.admins} administrator${overview.users.admins === 1 ? '' : 's'}`],
    ['Characters', String(overview.content.characters)],
    ['Campaigns', String(overview.content.campaigns)],
    ['Database', formatBytes(overview.database.sizeBytes), `schema ${overview.database.migrations.latest ?? '—'}`],
    ['Uploaded images', formatBytes(overview.storage.bytes), `${overview.storage.files} files`],
    ['Free disk space', disk ? formatBytes(disk.freeBytes) : '—', disk ? `${Math.round(disk.freePercent)}% free` : undefined],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Overview</h3>
          <p className="text-sm text-gray-500">What needs attention, and how the site is doing right now.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pill.className}`}>{pill.text}</span>
          <Button type="button" variant="outline" icon={RefreshCw} onClick={() => void refresh()} loading={loading}>Refresh</Button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Could not refresh: {error}. Showing the last known state.</div>}

      <section aria-labelledby="attention-heading" className="space-y-3">
        <h4 id="attention-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-500">Needs your attention</h4>
        {overview.attention.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <CheckCircle2 className="h-5 w-5 text-green-600" /> Nothing needs attention. Backups are current and the server is healthy.
          </p>
        ) : (
          <ul className="space-y-3">
            {overview.attention.map((item) => {
              const tone = SEVERITY[item.severity];
              return (
                <li key={item.code} data-severity={item.severity} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${tone.box}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <tone.Icon aria-label={tone.label} className={`mt-0.5 h-5 w-5 flex-none ${tone.icon}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="text-sm text-gray-700">{item.detail}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => open(item)} className="flex-none">{ACTION_LABEL[item.section]}</Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BackupStatus backups={overview.backups} onCreate={onOpenBackups} />

      <section aria-labelledby="numbers-heading">
        <h4 id="numbers-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">At a glance</h4>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {tiles.map(([label, value, note]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd>
              {note && <dd className="text-xs text-gray-500">{note}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-gray-500">
        Version {overview.app.version} · Node {overview.app.nodeVersion} · PostgreSQL {overview.database.serverVersion} · running for {formatDuration(overview.app.uptimeSeconds)}
      </p>
    </div>
  );
}
