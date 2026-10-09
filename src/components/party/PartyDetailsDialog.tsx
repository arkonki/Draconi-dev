import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { CopyButton } from '../shared/CopyButton';
import { Input } from '../shared/Input';
import { useConfirm } from '../../hooks/useConfirm';
import { getAbsoluteAppUrl } from '../../lib/appUrl';
import { regenerateInviteCode, updatePartyDetails, type Party } from '../../lib/api/parties';
import { queryKeys } from '../../lib/queryKeys';

interface PartyDetailsDialogProps {
  party: Party;
  isOpen: boolean;
  onClose: () => void;
}

/** Lets the campaign owner rename the campaign, describe it, and replace the invite link. */
export function PartyDetailsDialog({ party, isOpen, onClose }: PartyDetailsDialogProps) {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [name, setName] = useState(party.name);
  const [description, setDescription] = useState(party.description ?? '');

  useEffect(() => {
    if (isOpen) {
      setName(party.name);
      setDescription(party.description ?? '');
    }
  }, [isOpen, party.name, party.description]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.party(party.id), exact: true }),
    queryClient.invalidateQueries({ queryKey: queryKeys.parties }),
  ]);

  const save = useMutation({
    mutationFn: () => updatePartyDetails(party.id, { name, description }),
    onSuccess: async () => { await refresh(); onClose(); },
  });

  const newLink = useMutation({
    mutationFn: () => regenerateInviteCode(party.id),
    onSuccess: refresh,
  });

  const replaceLink = async () => {
    const confirmed = await confirm({
      title: 'Create a new invite link?',
      description: 'The current link stops working straight away. Anyone you already sent it to will need the new one. People who have joined stay in the campaign.',
      confirmText: 'Create new link',
      destructive: false,
    });
    if (confirmed) newLink.mutate();
  };

  const changed = name.trim() !== party.name || description.trim() !== (party.description ?? '').trim();
  const joinLink = party.invite_code ? getAbsoluteAppUrl(`party/join/${party.invite_code}`) : '';
  const error = save.error ?? newLink.error;

  return (
    <>
      <AccessibleDialog
        isOpen={isOpen}
        onClose={onClose}
        title="Campaign details"
        description="Change how the campaign appears to everyone in it."
        size="md"
        closeDisabled={save.isPending}
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim() || !changed}>Save</Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="campaign-name" className="mb-1 block text-sm font-semibold text-gray-700">Name</label>
            <Input id="campaign-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label htmlFor="campaign-description" className="mb-1 block text-sm font-semibold text-gray-700">Description</label>
            <textarea
              id="campaign-description"
              value={description}
              rows={3}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A line or two about the campaign. Shown on the party list."
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Link2 className="h-4 w-4" /> Invite link</h3>
            <div className="mt-2 flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-600">{joinLink}</div>
              <CopyButton textToCopy={joinLink} />
            </div>
            <Button type="button" variant="outline" size="sm" icon={RefreshCw} className="mt-3" loading={newLink.isPending} onClick={() => void replaceLink()}>
              Create a new link
            </Button>
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
        </div>
      </AccessibleDialog>
      {confirmDialog}
    </>
  );
}
