import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { AUDIT_ACTION_LABELS, fetchAuditLog, type AuditEntry } from '../../lib/api/adminUsers';

function describe(entry: AuditEntry): string {
  const details = entry.details as Record<string, unknown>;
  const after = details.after as Record<string, unknown> | undefined;
  switch (entry.action) {
    case 'user.update':
    case 'user.deactivate':
    case 'user.reactivate': {
      const fields = after ? Object.keys(after).map((key) => key.replace('_', ' ')) : [];
      const revoked = Number(details.sessionsRevoked ?? 0);
      return [fields.length ? `Changed ${fields.join(', ')}` : '', revoked ? `${revoked} session${revoked === 1 ? '' : 's'} ended` : ''].filter(Boolean).join('. ');
    }
    case 'user.reset_password':
      return `${details.generated ? 'Generated' : 'Chosen'} password${details.hadCredentials === false ? ' (account had none)' : ''}`;
    case 'user.revoke_sessions':
      return `${Number(details.sessionsRevoked ?? 0)} session(s) ended`;
    case 'user.delete': {
      const removed = (details.removed ?? {}) as Record<string, number>;
      const characters = removed.characters ?? 0;
      const parts = [`Removed ${characters} character${characters === 1 ? '' : 's'}`];
      if (details.transferredTo) parts.push(`content handed to ${String(details.transferredTo)}`);
      return parts.join('; ');
    }
    case 'backups.prune':
      return `${Number(details.removed ?? 0)} dump(s) removed, ${Number(details.kept ?? 0)} kept`;
    default:
      return '';
  }
}

export function AdminActivityLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchAuditLog({ limit: 200 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the activity log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => entries.filter((entry) => action === 'all' || entry.action === action), [entries, action]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Administrator activity</h3>
          <p className="text-sm text-gray-500">A permanent record of account changes. Passwords are never stored here, and entries survive the deletion of the account they describe.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All actions</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Button type="button" variant="outline" icon={RefreshCw} onClick={() => void load()} loading={loading && entries.length > 0}>Refresh</Button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-12"><LoadingSpinner text="Loading activity…" /></div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-12 text-center text-gray-500">
          <History className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          {entries.length === 0 ? 'Nothing has been recorded yet.' : 'No entries for this action.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">Administrator activity</caption>
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3">When</th>
                <th scope="col" className="px-4 py-3">Administrator</th>
                <th scope="col" className="px-4 py-3">Action</th>
                <th scope="col" className="px-4 py-3">Account</th>
                <th scope="col" className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-800">{entry.actor_email ?? 'Removed administrator'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td className="px-4 py-3 text-gray-800">{entry.target_email ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{describe(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
