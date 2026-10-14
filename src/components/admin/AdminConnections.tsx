import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, KeyRound, RefreshCw, ShieldOff } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useConfirm } from '../../hooks/useConfirm';
import { fetchAdminConnections, revokeAdminConnection, type AdminConnection } from '../../lib/api/adminConnections';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

interface UserGroup {
  userId: string;
  username: string;
  email: string;
  connections: AdminConnection[];
}

/** Every assistant that can act as someone on this server, with a way to cut one off. */
export function AdminConnections() {
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConnections(await fetchAdminConnections());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const byUser = new Map<string, UserGroup>();
    for (const connection of connections) {
      const group = byUser.get(connection.userId) ?? { userId: connection.userId, username: connection.username, email: connection.email, connections: [] };
      group.connections.push(connection);
      byUser.set(connection.userId, group);
    }
    return [...byUser.values()].sort((left, right) => left.username.localeCompare(right.username));
  }, [connections]);

  const writeCount = connections.filter((connection) => connection.access === 'write').length;

  const revoke = async (group: UserGroup, connection: AdminConnection | null) => {
    const confirmed = await confirm({
      title: connection ? `Disconnect “${connection.name}”?` : `Disconnect everything for ${group.username}?`,
      description: connection
        ? `${group.username} will have to connect it again. They stay signed in to the website.`
        : `All ${group.connections.length} connection${group.connections.length === 1 ? '' : 's'} for ${group.username} end. They stay signed in to the website.`,
      confirmText: 'Disconnect',
    });
    if (!confirmed) return;
    const key = connection ? `${connection.kind}:${group.userId}:${connection.id}` : `all:${group.userId}`;
    setBusyKey(key);
    setError(null);
    try {
      await revokeAdminConnection(connection ? { userId: group.userId, kind: connection.kind, id: connection.id } : { userId: group.userId, kind: 'all' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect it.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">AI connections</h3>
          <p className="text-sm text-gray-500">
            Assistants and personal tokens that can act as a user. {connections.length} active
            {connections.length > 0 ? `, ${writeCount} with permission to make game changes` : ''}. Secrets are never shown here.
          </p>
        </div>
        <Button type="button" variant="outline" icon={RefreshCw} onClick={() => void load()} loading={loading && connections.length > 0}>Refresh</Button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {loading && connections.length === 0 ? (
        <div className="flex justify-center py-12"><LoadingSpinner text="Loading connections…" /></div>
      ) : groups.length === 0 ? (
        <div className="px-4 py-12 text-center text-gray-500">
          <Bot className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p>No assistant is connected to anyone right now.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {groups.map((group) => (
            <li key={group.userId} className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                <div>
                  <span className="font-semibold text-gray-900">{group.username}</span>
                  <span className="ml-2 text-xs text-gray-500">{group.email}</span>
                </div>
                {group.connections.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" icon={ShieldOff} loading={busyKey === `all:${group.userId}`} onClick={() => void revoke(group, null)} className="text-red-600 hover:bg-red-50">
                    Disconnect all
                  </Button>
                )}
              </div>
              <ul className="divide-y divide-gray-100">
                {group.connections.map((connection) => {
                  const key = `${connection.kind}:${group.userId}:${connection.id}`;
                  const Icon = connection.kind === 'app' ? Bot : KeyRound;
                  return (
                    <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon className="h-5 w-5 flex-none text-gray-400" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">
                            {connection.name}
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${connection.access === 'write' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                              {connection.access === 'write' ? 'Can change the game' : 'Read only'}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {connection.kind === 'app' ? 'App' : 'Personal token'} · connected {formatDate(connection.connectedAt)} · last used {formatDate(connection.lastUsedAt)} · expires {formatDate(connection.expiresAt)}
                          </p>
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="outline" loading={busyKey === key} onClick={() => void revoke(group, connection)}>Disconnect</Button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
