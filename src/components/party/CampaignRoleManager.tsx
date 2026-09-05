import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Shield, Swords, UserCog, X } from 'lucide-react';
import type { CampaignMembership, CampaignRole, Party } from '../../lib/api/parties';
import { updateCampaignMemberRole } from '../../lib/api/parties';
import { Button } from '../shared/Button';

interface CampaignRoleManagerProps {
  party: Party;
  isOpen: boolean;
  onClose: () => void;
}

const editableRoles: Array<Exclude<CampaignRole, 'owner'>> = ['gm', 'player', 'observer'];

const roleDetails: Record<CampaignRole, { label: string; description: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', description: 'Full control, including campaign roles and deletion.', icon: Shield },
  gm: { label: 'GM', description: 'GM tools, campaign chat, encounters, and projector control.', icon: UserCog },
  player: { label: 'Player', description: 'Campaign access, chat, and player actions.', icon: Swords },
  observer: { label: 'Observer', description: 'Read-only campaign and chat access.', icon: Eye },
};

function memberName(member: CampaignMembership) {
  const profile = member.users;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return fullName || profile?.username || 'Campaign member';
}

export function CampaignRoleManager({ party, isOpen, onClose }: CampaignRoleManagerProps) {
  const queryClient = useQueryClient();
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Exclude<CampaignRole, 'owner'> }) => (
      updateCampaignMemberRole(party.id, userId, role)
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['party', party.id] }),
        queryClient.invalidateQueries({ queryKey: ['parties'] }),
      ]);
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <UserCog className="h-5 w-5 text-indigo-600" /> Campaign roles
            </h2>
            <p className="mt-1 text-sm text-gray-500">Roles apply only to {party.name}.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close campaign roles">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="space-y-3">
            {party.campaign_memberships.map((member) => {
              const details = roleDetails[member.role];
              const Icon = details.icon;
              const isOwner = member.role === 'owner';
              const isUpdating = roleMutation.isPending && roleMutation.variables?.userId === member.user_id;

              return (
                <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">{memberName(member)}</div>
                      <div className="text-xs text-gray-500">{details.description}</div>
                    </div>
                  </div>

                  {isOwner ? (
                    <span className="self-start rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700 sm:self-auto">Owner</span>
                  ) : (
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
                  )}
                </div>
              );
            })}
          </div>

          {roleMutation.error && (
            <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{roleMutation.error.message}</p>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
