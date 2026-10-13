import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Shield, Swords, UserCog, X } from 'lucide-react';
import type { CampaignMembership, CampaignRole, Party } from '../../lib/api/parties';
import { removeCampaignMember, setAllowObservers, transferCampaignOwnership, updateCampaignMemberRole } from '../../lib/api/parties';
import { useConfirm } from '../../hooks/useConfirm';
import { Button } from '../shared/Button';

interface CampaignRoleManagerProps {
  party: Party;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  /** Only the owner (or an administrator) can change roles, hand the campaign over or remove people. */
  canManage: boolean;
}

const editableRoles: Array<Exclude<CampaignRole, 'owner'>> = ['gm', 'player', 'observer'];

const roleDetails: Record<CampaignRole, { label: string; description: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', description: 'Full control, including campaign roles and deletion.', icon: Shield },
  gm: { label: 'GM', description: 'GM tools, campaign chat, encounters, and projector control.', icon: UserCog },
  player: { label: 'Player', description: 'Campaign access, chat, and player actions.', icon: Swords },
  observer: { label: 'Observer', description: 'Read-only campaign and chat access.', icon: Eye },
};

const ROLE_ORDER: CampaignRole[] = ['owner', 'gm', 'player', 'observer'];

function memberName(member: CampaignMembership) {
  const profile = member.users;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return profile?.username || fullName || 'Campaign member';
}

/** Everyone in the campaign and their role. Anyone in it can look; the owner can also change things. */
export function CampaignRoleManager({ party, isOpen, onClose, currentUserId, canManage }: CampaignRoleManagerProps) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['party', party.id] }),
      queryClient.invalidateQueries({ queryKey: ['parties'] }),
    ]);
  };

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Exclude<CampaignRole, 'owner'> }) => (
      updateCampaignMemberRole(party.id, userId, role)
    ),
    onSuccess: refresh,
  });

  const { confirm, dialog: confirmDialog } = useConfirm();
  const transferMutation = useMutation({
    mutationFn: (userId: string) => transferCampaignOwnership(party.id, userId),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeCampaignMember(party.id, userId),
    onSuccess: refresh,
  });

  const observersMutation = useMutation({
    mutationFn: (allow: boolean) => setAllowObservers(party.id, allow),
    onSuccess: refresh,
  });

  const handOver = async (member: CampaignMembership) => {
    const confirmed = await confirm({
      title: `Make ${memberName(member)} the owner?`,
      description: `${memberName(member)} will own ${party.name}, including campaign roles, the invite link and disbanding it. You stay on as a GM, but you can't take ownership back yourself.`,
      confirmText: 'Hand over campaign',
    });
    if (confirmed) transferMutation.mutate(member.user_id);
  };

  const remove = async (member: CampaignMembership) => {
    const confirmed = await confirm({
      title: `Remove ${memberName(member)}?`,
      description: `${memberName(member)} loses access to ${party.name}. They can come back through the invite link${party.allow_observers === false ? ' only as a player, since observers are switched off' : ''}.`,
      confirmText: 'Remove from campaign',
    });
    if (confirmed) removeMutation.mutate(member.user_id);
  };

  if (!isOpen) return null;

  const people = [...party.campaign_memberships].sort(
    (left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role) || memberName(left).localeCompare(memberName(right)),
  );
  const observerCount = people.filter((member) => member.role === 'observer').length;
  const error = transferMutation.error || roleMutation.error || removeMutation.error || observersMutation.error;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <UserCog className="h-5 w-5 text-indigo-600" /> People &amp; roles
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {canManage ? `Roles apply only to ${party.name}.` : `Who is in ${party.name}, and in what role.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close people and roles">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {canManage && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <input
                id="allow-observers"
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={party.allow_observers !== false}
                disabled={observersMutation.isPending}
                onChange={(event) => observersMutation.mutate(event.target.checked)}
              />
              <div>
                <label htmlFor="allow-observers" className="font-semibold text-gray-900">Let people watch through the invite link</label>
                <p className="text-xs text-gray-500">
                  Anyone with the link can follow the game as an observer, without a character. They can read but not change anything.
                  {observerCount > 0 ? ` ${observerCount} ${observerCount === 1 ? 'person is' : 'people are'} watching now.` : ''}
                  {party.allow_observers === false ? ' Switched off: the link only works for joining with a character.' : ''}
                </p>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {people.map((member) => {
              const details = roleDetails[member.role];
              const Icon = details.icon;
              const isOwner = member.role === 'owner';
              const isUpdating = roleMutation.isPending && roleMutation.variables?.userId === member.user_id;
              const characters = party.members.filter((character) => character.user_id === member.user_id);
              const isYou = member.user_id === currentUserId;

              return (
                <li key={member.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">
                        {memberName(member)}{isYou ? <span className="font-normal text-gray-500"> (you)</span> : null}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {characters.length > 0 ? characters.map((character) => character.name).join(', ') : details.description}
                      </div>
                    </div>
                  </div>

                  {isOwner || !canManage ? (
                    <span className="self-start rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700 sm:self-auto">{details.label}</span>
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
                        <span className="sr-only">Role for {memberName(member)}</span>
                        <select
                          value={member.role}
                          disabled={isUpdating}
                          onChange={(event) => roleMutation.mutate({
                            userId: member.user_id,
                            role: event.target.value as Exclude<CampaignRole, 'owner'>,
                          })}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
                        >
                          {editableRoles.map((role) => <option key={role} value={role}>{roleDetails[role].label}</option>)}
                        </select>
                      </label>
                      <Button type="button" variant="ghost" size="sm" loading={transferMutation.isPending && transferMutation.variables === member.user_id} onClick={() => void handOver(member)}>
                        Make owner
                      </Button>
                      {member.role !== 'player' && (
                        <Button type="button" variant="ghost" size="sm" loading={removeMutation.isPending && removeMutation.variables === member.user_id} onClick={() => void remove(member)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {canManage && (
            <p className="mt-3 text-xs text-gray-500">
              To remove a player, take their characters off the roster. Observers and GMs have no character, so they have a Remove button here.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
