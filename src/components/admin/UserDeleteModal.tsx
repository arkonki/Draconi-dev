import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trash2, UserX } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import {
  deleteAdminUser,
  displayName,
  fetchUserImpact,
  updateAdminUser,
  type AdminUser,
  type UserImpact,
} from '../../lib/api/adminUsers';

interface UserDeleteModalProps {
  user: AdminUser;
  allUsers: AdminUser[];
  onClose: () => void;
  onDeleted: (message: string) => void;
  onDeactivated: (user: AdminUser, message: string) => void;
}

const CONTENT_LABELS: Record<string, string> = {
  game_sessions: 'game sessions',
  game_session_checkpoints: 'session checkpoints',
  campaign_time_roll_reminders: 'time reminders',
  solo_npcs: 'solo NPCs',
  solo_treasure_draws: 'solo treasure draws',
  compendium: 'compendium entries',
  compendium_templates: 'compendium templates',
  party_display_sessions: 'projector sessions',
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function UserDeleteModal({ user, allUsers, onClose, onDeleted, onDeactivated }: UserDeleteModalProps) {
  const [impact, setImpact] = useState<UserImpact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [working, setWorking] = useState<'delete' | 'deactivate' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserImpact(user.id)
      .then((value) => { if (!cancelled) setImpact(value); })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load what this account owns.'); });
    return () => { cancelled = true; };
  }, [user.id]);

  const heirs = useMemo(() => allUsers
    .filter((candidate) => candidate.id !== user.id && candidate.is_active)
    .sort((a, b) => displayName(a).localeCompare(displayName(b))), [allUsers, user.id]);

  const keepable = impact ? Object.entries(impact.keepable_content).filter(([, count]) => count > 0) : [];
  const restricted = impact ? Object.entries(impact.restricted_content).filter(([, count]) => count > 0) : [];
  const needsTransfer = impact?.needs_transfer ?? false;
  const heir = heirs.find((candidate) => candidate.id === transferTo);
  const confirmed = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const canDelete = Boolean(impact) && confirmed && (!needsTransfer || Boolean(transferTo)) && working === null;

  const remove = async () => {
    setWorking('delete');
    setError(null);
    try {
      const result = await deleteAdminUser(user.id, { confirmEmail, transferTo: transferTo || null });
      const moved = Object.values(result.transferred).reduce((sum, count) => sum + count, 0);
      onDeleted(`Deleted ${result.deleted.username || result.deleted.email}${moved > 0 && heir ? `. ${moved} item${moved === 1 ? '' : 's'} moved to ${displayName(heir)}` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.');
      setWorking(null);
    }
  };

  const deactivate = async () => {
    setWorking('deactivate');
    setError(null);
    try {
      const { user: updated } = await updateAdminUser(user.id, { is_active: false });
      onDeactivated({ ...user, ...updated }, `${displayName(user)} was deactivated and signed out. Nothing was deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not deactivate the account.');
      setWorking(null);
    }
  };

  return (
    <AccessibleDialog
      bodyClassName="px-4 py-4 sm:px-6"
      onClose={onClose}
      title={`Delete ${displayName(user)}?`}
      description={user.email}
      size="lg"
      closeDisabled={working !== null}
      closeOnBackdrop={false}
      footer={(
        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" icon={UserX} onClick={deactivate} loading={working === 'deactivate'} disabled={!user.is_active || working === 'delete'}>
            Deactivate instead
          </Button>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={working !== null}>Cancel</Button>
            <Button type="button" variant="danger" icon={Trash2} onClick={remove} loading={working === 'delete'} disabled={!canDelete}>
              Delete permanently
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</div>}
        {!impact && !loadError && <div className="flex justify-center py-8"><LoadingSpinner text="Checking what this account owns…" /></div>}

        {impact && (
          <>
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <strong>This cannot be undone.</strong> If you only want to stop them signing in, use <em>Deactivate instead</em>: it keeps everything and can be reversed.
            </p>

            <section aria-labelledby="delete-removes">
              <h3 id="delete-removes" className="mb-2 text-sm font-semibold text-gray-900">Permanently removed with the account</h3>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>{plural(impact.characters, 'character')}</li>
                <li>{plural(impact.notes, 'journal note')}</li>
                <li>{plural(impact.messages, 'chat message')} (removed from other players&apos; campaign history too)</li>
                <li>{plural(impact.campaign_memberships, 'campaign membership')}</li>
              </ul>
            </section>

            {impact.owned_campaigns.length > 0 && (
              <section aria-labelledby="delete-campaigns" className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                <h3 id="delete-campaigns" className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900">
                  <AlertTriangle className="h-4 w-4" /> Owns {plural(impact.owned_campaigns.length, 'campaign')}
                </h3>
                <ul className="mb-2 space-y-1 text-sm text-red-900">
                  {impact.owned_campaigns.map((campaign) => (
                    <li key={campaign.id}>{campaign.name} <span className="text-red-700">({plural(campaign.other_members, 'other member')})</span></li>
                  ))}
                </ul>
                <p className="text-xs text-red-800">Without a new owner these campaigns, and everything in them for the other players, would be deleted. A successor is required.</p>
              </section>
            )}

            {(needsTransfer || keepable.length > 0) && (
              <section>
                <label htmlFor="delete-transfer" className="mb-1 block text-sm font-semibold text-gray-900">
                  {needsTransfer ? 'Hand their campaigns and content to' : 'Keep their shared content by handing it to (optional)'}
                </label>
                <select
                  id="delete-transfer"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                >
                  <option value="">{needsTransfer ? 'Choose a user…' : 'Nobody (delete it with the account)'}</option>
                  {heirs.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{displayName(candidate)} — {candidate.email}</option>
                  ))}
                </select>
                {(restricted.length > 0 || keepable.length > 0 || impact.owned_campaigns.length > 0) && (
                  <p className="mt-2 text-xs text-gray-600">
                    Moves: {[
                      impact.owned_campaigns.length > 0 ? `${plural(impact.owned_campaigns.length, 'campaign')} (they become owner)` : null,
                      ...[...restricted, ...keepable].map(([table, count]) => `${count} ${CONTENT_LABELS[table] ?? table}`),
                    ].filter(Boolean).join(', ')}.
                  </p>
                )}
              </section>
            )}

            <section>
              <label htmlFor="delete-confirm" className="mb-1 block text-sm font-semibold text-gray-900">
                Type <span className="font-mono text-red-700">{user.email}</span> to confirm
              </label>
              <input
                id="delete-confirm"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </section>
          </>
        )}
      </div>
    </AccessibleDialog>
  );
}
