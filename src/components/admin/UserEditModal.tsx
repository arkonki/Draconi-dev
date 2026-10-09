import { useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import {
  updateAdminUser,
  type AdminUser,
  type AdminUserChanges,
  type UserRole,
} from '../../lib/api/adminUsers';

interface UserEditModalProps {
  user: AdminUser;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: AdminUser, summary: string) => void;
}

const ROLE_HELP: Record<UserRole, string> = {
  player: 'Plays characters and joins campaigns.',
  dm: 'Can run campaigns they create. No access to site administration.',
  admin: 'Full access: manages users, game data, backups and maintenance.',
};

const fieldClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';

export function UserEditModal({ user, isSelf, onClose, onSaved }: UserEditModalProps) {
  const [form, setForm] = useState({
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    username: user.username ?? '',
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes = useMemo<AdminUserChanges>(() => {
    const next: AdminUserChanges = {};
    if (form.first_name.trim() !== (user.first_name ?? '')) next.first_name = form.first_name.trim() || null;
    if (form.last_name.trim() !== (user.last_name ?? '')) next.last_name = form.last_name.trim() || null;
    if (form.username.trim() !== (user.username ?? '')) next.username = form.username.trim();
    if (form.email.trim().toLowerCase() !== user.email) next.email = form.email.trim().toLowerCase();
    if (form.role !== user.role) next.role = form.role;
    if (form.is_active !== user.is_active) next.is_active = form.is_active;
    return next;
  }, [form, user]);

  const changeCount = Object.keys(changes).length;
  const promoting = changes.role === 'admin';
  const demoting = user.role === 'admin' && changes.role !== undefined && changes.role !== 'admin';
  const deactivating = changes.is_active === false;
  const emailChanging = changes.email !== undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (changeCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const { user: updated } = await updateAdminUser(user.id, changes);
      const labels = Object.keys(changes).map((key) => key.replace('_', ' ')).join(', ');
      onSaved({ ...user, ...updated }, `Saved changes to ${updated.username || updated.email} (${labels}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccessibleDialog
      bodyClassName="px-4 py-4 sm:px-6"
      onClose={onClose}
      title="Edit user"
      description={user.email}
      closeDisabled={saving}
      footer={(
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="edit-user-form" loading={saving} disabled={changeCount === 0}>
            {changeCount === 0 ? 'No changes' : `Save ${changeCount} change${changeCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}
    >
      <form id="edit-user-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">First name
            <input className={`${fieldClass} mt-1`} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} maxLength={100} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Last name
            <input className={`${fieldClass} mt-1`} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} maxLength={100} />
          </label>
        </div>

        <label className="block text-sm font-medium text-gray-700">Username
          <input className={`${fieldClass} mt-1`} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} minLength={3} maxLength={50} required />
        </label>

        <label className="block text-sm font-medium text-gray-700">Email
          <input type="email" className={`${fieldClass} mt-1`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        {emailChanging && (
          <p className="-mt-2 text-xs text-amber-700">The user signs in with their email. Tell them about the change; no email is sent automatically.</p>
        )}

        <fieldset className="space-y-2" disabled={isSelf}>
          <legend className="mb-1 text-sm font-medium text-gray-700">Role</legend>
          <select
            aria-label="Role"
            className={fieldClass}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            <option value="player">Player</option>
            <option value="dm">Dungeon Master</option>
            <option value="admin">Administrator</option>
          </select>
          <p className="text-xs text-gray-500">{ROLE_HELP[form.role]}</p>
          {promoting && (
            <p className="flex items-start gap-2 rounded-lg bg-purple-50 p-3 text-xs text-purple-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" /> This gives {user.username || user.email} full control of the site, including the ability to delete other users.
            </p>
          )}
          {demoting && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">They will lose access to the administration screens straight away. The system always keeps at least one active administrator.</p>
          )}
        </fieldset>

        <fieldset className="space-y-2" disabled={isSelf}>
          <legend className="mb-1 text-sm font-medium text-gray-700">Account status</legend>
          <label className="flex items-center gap-3 text-sm text-gray-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Account is active (can sign in)
          </label>
          {deactivating && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              They will be signed out everywhere immediately and cannot sign in again until reactivated. Their characters, notes and campaigns are kept.
            </p>
          )}
        </fieldset>

        {isSelf && (
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            This is your own account, so your role and status are locked. Ask another administrator to change them.
          </p>
        )}
      </form>
    </AccessibleDialog>
  );
}
