import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle, KeyRound, LogOut, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, UserX, Users,
} from 'lucide-react';
import { Button } from '../shared/Button';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { UserCreationModal } from './UserCreationModal';
import { UserEditModal } from './UserEditModal';
import { UserPasswordModal } from './UserPasswordModal';
import { UserDeleteModal } from './UserDeleteModal';
import { useAuth } from '../../contexts/useAuth';
import { notifyAdminOverviewChanged } from '../../hooks/useAdminOverview';
import {
  displayName,
  fetchAdminUsers,
  revokeUserSessions,
  updateAdminUser,
  type AdminUser,
  type UserRole,
} from '../../lib/api/adminUsers';

type StatusFilter = 'all' | 'active' | 'inactive' | 'attention';
type SortKey = 'newest' | 'name' | 'recent';
type Modal =
  | { type: 'create' }
  | { type: 'edit' | 'password' | 'delete' | 'signout'; user: AdminUser }
  | null;

const ROLE_LABEL: Record<UserRole, string> = { player: 'Player', dm: 'Dungeon Master', admin: 'Administrator' };
const ROLE_CLASS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-800',
  dm: 'bg-blue-100 text-blue-800',
  player: 'bg-green-100 text-green-800',
};

// "Needs attention": cannot sign in yet (no password), or has never signed in.
const needsAttention = (user: AdminUser) => user.is_active && (!user.has_password || !user.last_login_at);

function relativeTime(value: string | null): string {
  if (!value) return 'Never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86_400, 'day'], [2_592_000, 'month'], [31_536_000, 'year']];
  let unit = units[0];
  for (const candidate of units) if (seconds >= candidate[0]) unit = candidate;
  const amount = Math.floor(seconds / unit[0]);
  return `${amount} ${unit[1]}${amount === 1 ? '' : 's'} ago`;
}

function lastActive(user: AdminUser): string | null {
  const times = [user.last_seen_at, user.last_login_at].filter((value): value is string => Boolean(value));
  return times.length ? times.reduce((latest, value) => (new Date(value) > new Date(latest) ? value : latest)) : null;
}

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [modal, setModal] = useState<Modal>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchAdminUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.is_active).length,
    admins: users.filter((user) => user.role === 'admin' && user.is_active).length,
    attention: users.filter(needsAttention).length,
  }), [users]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (statusFilter === 'active' && !user.is_active) return false;
      if (statusFilter === 'inactive' && user.is_active) return false;
      if (statusFilter === 'attention' && !needsAttention(user)) return false;
      if (!query) return true;
      return [user.username, user.email, user.first_name, user.last_name]
        .some((field) => field?.toLowerCase().includes(query));
    });
    return [...matches].sort((a, b) => {
      if (sort === 'name') return displayName(a).localeCompare(displayName(b));
      if (sort === 'recent') return new Date(lastActive(b) ?? 0).getTime() - new Date(lastActive(a) ?? 0).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [users, search, roleFilter, statusFilter, sort]);

  const replaceUser = (updated: AdminUser) => setUsers((current) => current.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)));
  // Any successful change can alter the "needs attention" figures shown elsewhere.
  const success = (text: string) => { setNotice({ kind: 'success', text }); notifyAdminOverviewChanged(); };

  const toggleActive = async (user: AdminUser) => {
    setBusyId(user.id);
    try {
      const { user: updated } = await updateAdminUser(user.id, { is_active: !user.is_active });
      replaceUser({ ...user, ...updated });
      success(user.is_active ? `${displayName(user)} was deactivated and signed out.` : `${displayName(user)} can sign in again.`);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not change the account status.' });
    } finally {
      setBusyId(null);
    }
  };

  const signOutEverywhere = async (user: AdminUser) => {
    setBusyId(user.id);
    try {
      const { sessionsRevoked } = await revokeUserSessions(user.id);
      setModal(null);
      success(`${displayName(user)} was signed out of ${sessionsRevoked} session${sessionsRevoked === 1 ? '' : 's'}.`);
      void load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not sign the user out.' });
    } finally {
      setBusyId(null);
    }
  };

  const filtersActive = search !== '' || roleFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); };

  const tile = (label: string, value: number, filter: StatusFilter | null, tone = 'text-gray-900') => {
    const selectable = filter !== null;
    const selected = selectable && statusFilter === filter;
    return (
      <button
        type="button"
        disabled={!selectable}
        aria-pressed={selectable ? selected : undefined}
        onClick={() => selectable && setStatusFilter(selected ? 'all' : filter)}
        className={`rounded-xl border p-3 text-left transition-colors ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'} ${selectable ? 'hover:border-blue-300' : 'cursor-default'}`}
      >
        <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </button>
    );
  };

  const iconButton = (user: AdminUser, label: string, onClick: () => void, icon: React.ReactNode, danger = false, disabled = false) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={`${label}: ${displayName(user)}`}
      onClick={onClick}
      disabled={disabled || busyId === user.id}
      className={danger ? 'text-gray-500 hover:text-red-600' : 'text-gray-500 hover:text-blue-600'}
    >
      {icon}
    </Button>
  );

  const renderActions = (user: AdminUser, isSelf: boolean) => (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {iconButton(user, 'Edit', () => setModal({ type: 'edit', user }), <Pencil className="h-4 w-4" />)}
      {iconButton(user, 'Reset password', () => setModal({ type: 'password', user }), <KeyRound className="h-4 w-4" />)}
      {iconButton(user, 'Sign out everywhere', () => setModal({ type: 'signout', user }), <LogOut className="h-4 w-4" />, false, user.active_sessions === 0)}
      {iconButton(
        user,
        user.is_active ? 'Deactivate' : 'Reactivate',
        () => void toggleActive(user),
        user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
        user.is_active,
        isSelf,
      )}
      {iconButton(user, 'Delete', () => setModal({ type: 'delete', user }), <Trash2 className="h-4 w-4" />, true, isSelf)}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Users</h3>
          <p className="text-sm text-gray-500">Create accounts, change roles, reset passwords and remove people who no longer play.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" icon={RefreshCw} onClick={() => void load()} loading={loading && users.length > 0}>Refresh</Button>
          <Button type="button" icon={Plus} onClick={() => setModal({ type: 'create' })}>Create user</Button>
        </div>
      </div>

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-900'}`}>
          <span>{notice.text}</span>
          <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-800">Could not load users</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile('Total users', counts.total, 'all')}
        {tile('Active', counts.active, 'active', 'text-green-700')}
        {tile('Active administrators', counts.admins, null, 'text-purple-700')}
        {tile('Need attention', counts.attention, 'attention', counts.attention > 0 ? 'text-amber-700' : 'text-gray-900')}
      </div>
      {counts.attention > 0 && statusFilter !== 'attention' && (
        <p className="-mt-2 text-xs text-gray-500">&ldquo;Need attention&rdquo; means an active account that has never signed in or has no password set.</p>
      )}

      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="relative min-w-0 flex-grow">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search users"
            placeholder="Search name, username or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 xl:flex">
        <select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">All roles</option>
          <option value="player">Players</option>
          <option value="dm">Dungeon Masters</option>
          <option value="admin">Administrators</option>
        </select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
          <option value="attention">Needs attention</option>
        </select>
        <select aria-label="Sort users" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="newest">Newest first</option>
          <option value="recent">Recently active</option>
          <option value="name">Name A–Z</option>
        </select>
        </div>
      </div>

      {loading && users.length === 0 ? (
        <div className="flex justify-center py-12"><LoadingSpinner text="Loading users…" /></div>
      ) : visible.length === 0 && !error ? (
        <div className="px-4 py-12 text-center">
          <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h4 className="text-lg font-semibold text-gray-700">{users.length === 0 ? 'No users yet' : 'No users match'}</h4>
          {filtersActive && <Button type="button" variant="link" onClick={clearFilters}>Clear filters</Button>}
        </div>
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 xl:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Registered users</caption>
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3">User</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Content</th>
                <th scope="col" className="px-4 py-3">Last active</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {visible.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const seen = lastActive(user);
                return (
                  <tr key={user.id} className={`transition-colors hover:bg-gray-50 ${user.is_active ? '' : 'bg-gray-50/60 text-gray-500'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                          {displayName(user).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium text-gray-900">
                            <span className="truncate">{displayName(user)}</span>
                            {isSelf && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700">You</span>}
                          </div>
                          <div className="truncate text-xs text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_CLASS[user.role]}`}>
                        {user.role === 'admin' && <ShieldCheck className="h-3 w-3" />}{ROLE_LABEL[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle className="h-3.5 w-3.5" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><UserX className="h-3.5 w-3.5" /> Deactivated</span>
                      )}
                      {!user.has_password && <div className="mt-1 text-xs font-medium text-amber-700">No password set</div>}
                      {user.active_sessions > 0 && <div className="mt-1 text-xs text-gray-500">{user.active_sessions} session{user.active_sessions === 1 ? '' : 's'}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>{user.character_count} character{user.character_count === 1 ? '' : 's'}</div>
                      <div>{user.campaign_count} campaign{user.campaign_count === 1 ? '' : 's'}{user.owned_campaigns > 0 ? ` (owns ${user.owned_campaigns})` : ''}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600" title={seen ? new Date(seen).toLocaleString() : undefined}>
                      {relativeTime(seen)}
                    </td>
                    <td className="px-4 py-3">
                      {renderActions(user, isSelf)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 xl:hidden" aria-label="Registered users">
          {visible.map((user) => {
            const isSelf = user.id === currentUser?.id;
            const seen = lastActive(user);
            return (
              <li key={user.id} className={`rounded-xl border p-4 ${user.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                <div className="flex items-start gap-3">
                  <div aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                    {displayName(user).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <span className="truncate">{displayName(user)}</span>
                      {isSelf && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700">You</span>}
                    </div>
                    <div className="truncate text-xs text-gray-500">{user.email}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_CLASS[user.role]}`}>
                        {user.role === 'admin' && <ShieldCheck className="h-3 w-3" />}{ROLE_LABEL[user.role]}
                      </span>
                      {user.is_active
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle className="h-3.5 w-3.5" /> Active</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><UserX className="h-3.5 w-3.5" /> Deactivated</span>}
                      {!user.has_password && <span className="text-xs font-medium text-amber-700">No password set</span>}
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      {user.character_count} character{user.character_count === 1 ? '' : 's'} · {user.campaign_count} campaign{user.campaign_count === 1 ? '' : 's'}
                      {user.owned_campaigns > 0 ? ` (owns ${user.owned_campaigns})` : ''} · Last active {relativeTime(seen)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-2">{renderActions(user, isSelf)}</div>
              </li>
            );
          })}
        </ul>
        </>
      )}
      {visible.length > 0 && <p className="text-xs text-gray-500">Showing {visible.length} of {users.length} users.</p>}

      {modal?.type === 'create' && (
        <UserCreationModal onClose={() => setModal(null)} onUserCreated={() => void load()} />
      )}
      {modal?.type === 'edit' && (
        <UserEditModal
          user={modal.user}
          isSelf={modal.user.id === currentUser?.id}
          onClose={() => setModal(null)}
          onSaved={(updated, summary) => { replaceUser(updated); setModal(null); success(summary); void load(); }}
        />
      )}
      {modal?.type === 'password' && (
        <UserPasswordModal user={modal.user} onClose={() => setModal(null)} onDone={(message) => { setModal(null); success(message); void load(); }} />
      )}
      {modal?.type === 'delete' && (
        <UserDeleteModal
          user={modal.user}
          allUsers={users}
          onClose={() => setModal(null)}
          onDeleted={(message) => { setModal(null); success(message); void load(); }}
          onDeactivated={(updated, message) => { replaceUser(updated); setModal(null); success(message); void load(); }}
        />
      )}
      {modal?.type === 'signout' && (
        <AccessibleDialog
      bodyClassName="px-4 py-4 sm:px-6"
          onClose={() => setModal(null)}
          title={`Sign ${displayName(modal.user)} out everywhere?`}
          size="sm"
          footer={(
            <div className="flex w-full justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="button" icon={LogOut} loading={busyId === modal.user.id} onClick={() => void signOutEverywhere(modal.user)}>Sign out</Button>
            </div>
          )}
        >
          <p className="text-sm text-gray-700">
            This ends all {modal.user.active_sessions} active session{modal.user.active_sessions === 1 ? '' : 's'} on every device. They can sign in again with their password.
          </p>
        </AccessibleDialog>
      )}
    </div>
  );
}
