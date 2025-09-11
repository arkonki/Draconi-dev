import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchPartyById, removePartyMember, deleteParty } from '../lib/api/parties';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { Button } from '../components/shared/Button';
import { Users, Sword, Trash2, UserX, Link as LinkIcon, ShieldAlert, Notebook, ClipboardList, Backpack, Swords, FileText, MoreVertical, UserPlus, Award } from 'lucide-react';
import { CopyButton } from '../components/shared/CopyButton';
import { ConfirmationDialog } from '../components/shared/ConfirmationDialog';
import { PartyNotes } from '../components/party/PartyNotes';
import { PartyTasks } from '../components/party/PartyTasks';
import { PartyInventory } from '../components/party/PartyInventory';
import { PartyEncounterView } from '../components/party/PartyEncounterView';
import { SessionEndCheatsheet } from '../components/party/SessionEndCheatsheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/shared/DropdownMenu';
// --- NEW: Import the GMScreen component ---
import { GMScreen } from '../components/party/GMScreen';

// --- UPDATED: Add 'gmScreen' to the Tab type ---
type Tab = 'members' | 'notes' | 'tasks' | 'inventory' | 'encounter' | 'sessionEnd' | 'gmScreen';

export function PartyView() {
  const { id: partyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isDM } = useAuth();
  const queryClient = useQueryClient();

  const [isInviteVisible, setIsInviteVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState<'deleteParty' | 'removeMember' | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('members');

  const { data: party, isLoading, error } = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => fetchPartyById(partyId),
    enabled: !!partyId,
  });

  const removeMemberMutation = useMutation({
    mutationFn: (characterId: string) => { if (!partyId) throw new Error('Party ID is missing'); return removePartyMember(partyId, characterId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['party', partyId] }); queryClient.invalidateQueries({ queryKey: ['availableCharacters'] }); setDialogOpen(null); setMemberToRemove(null); },
  });

  const deletePartyMutation = useMutation({
    mutationFn: () => { if (!partyId) throw new Error('Party ID is missing'); return deleteParty(partyId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['parties'] }); navigate('/adventure-party'); },
  });

  const handleRemoveMember = (characterId: string) => { setMemberToRemove(characterId); setDialogOpen('removeMember'); };
  const confirmRemoveMember = () => { if (memberToRemove) { removeMemberMutation.mutate(memberToRemove); } };
  const confirmDeleteParty = () => { deletePartyMutation.mutate(); };

  const isPartyOwner = user && party && user.id === party.created_by && isDM();
  const joinLink = party?.invite_code ? `${window.location.origin}/party/join/${party.invite_code}` : '';

  if (isLoading) return <div className="flex justify-center items-center p-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <div className="p-8"><ErrorMessage message={error.message} /></div>;
  if (!party) return <div className="p-8"><ErrorMessage message="Party not found." /></div>;

  // --- UPDATED: Add the new tab to the array ---
  const allTabs: { id: Tab; label: string; icon: React.ElementType; dmOnly?: boolean }[] = [
    { id: 'members', label: 'Members', icon: Users },
    { id: 'notes', label: 'Notes', icon: Notebook },
    { id: 'tasks', label: 'Tasks', icon: ClipboardList },
    { id: 'inventory', label: 'Inventory', icon: Backpack },
    { id: 'encounter', label: 'Encounter', icon: Swords },
    { id: 'sessionEnd', label: 'Session End', icon: Award, dmOnly: true },
    { id: 'gmScreen', label: 'GM Screen', icon: ShieldAlert, dmOnly: true },
  ];

  const visibleTabs = allTabs.filter(tab => !tab.dmOnly || isPartyOwner);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-lg rounded-xl">
        <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div><h1 className="text-3xl font-bold text-gray-900">{party.name}</h1><p className="text-gray-500 mt-1">A band of brave adventurers.</p></div>
              {isPartyOwner && (
                <div className="mt-4 md:mt-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger><Button variant="outline" size="icon" aria-label="Party Actions"><MoreVertical className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setIsInviteVisible(prev => !prev)}><UserPlus className="w-4 h-4" /> Invite Player</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setDialogOpen('deleteParty')} className="text-red-500 hover:text-red-700 focus:text-red-700 hover:bg-red-50 focus:bg-red-50"><Trash2 className="w-4 h-4" /> Delete Party</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            {isInviteVisible && isPartyOwner && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h3 className="font-semibold text-blue-800">Share this link to invite players:</h3>
                <div className="flex items-center gap-2 mt-2 bg-white p-2 rounded-md"><input type="text" readOnly value={joinLink} className="w-full bg-transparent text-gray-700 focus:outline-none"/><CopyButton textToCopy={joinLink} /></div>
              </div>
            )}
        </div>

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6 px-6 overflow-x-auto" aria-label="Tabs">
            {visibleTabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 flex items-center gap-2 px-1 py-4 text-sm font-medium border-b-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6 bg-gray-50/50">
          {activeTab === 'members' && (
            <div className="space-y-4">
              {party.members.length > 0 ? (
                party.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded-full"><Sword className="w-6 h-6 text-gray-600" /></div>
                      <div><h3 className="font-semibold text-gray-900">{member.name}</h3><p className="text-sm text-gray-500">{member.kin} {member.profession}</p></div>
                    </div>
                    {isPartyOwner && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/character/${member.id}`)} icon={FileText}>View Sheet</Button>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(member.id!)} aria-label={`Remove ${member.name}`}><UserX className="w-5 h-5 text-red-500" /></Button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">This party has no members yet. Invite someone!</p>
              )}
            </div>
          )}
          {activeTab === 'notes' && <PartyNotes partyId={partyId!} isDM={isPartyOwner} />}
          {activeTab === 'tasks' && <PartyTasks partyId={partyId!} isDM={isPartyOwner} />}
          {activeTab === 'inventory' && <PartyInventory partyId={partyId!} members={party.members} isDM={isPartyOwner} />}
          {activeTab === 'encounter' && <PartyEncounterView partyId={partyId!} partyMembers={party.members} isDM={isPartyOwner} />}
          {activeTab === 'sessionEnd' && <SessionEndCheatsheet members={party.members} partyId={partyId!} />}
          {/* --- NEW: Render the GMScreen when its tab is active --- */}
          {activeTab === 'gmScreen' && <GMScreen />}
        </div>
      </div>

      <ConfirmationDialog isOpen={dialogOpen === 'removeMember'} onClose={() => setDialogOpen(null)} onConfirm={confirmRemoveMember} title="Remove Member" description={`Are you sure you want to remove this character from the party?`} confirmText="Remove" isDestructive={true} isLoading={removeMemberMutation.isPending} icon={<UserX className="w-6 h-6 text-red-500" />}/>
      <ConfirmationDialog isOpen={dialogOpen === 'deleteParty'} onClose={() => setDialogOpen(null)} onConfirm={confirmDeleteParty} title="Delete Party" description="Are you sure you want to permanently delete this party? This action cannot be undone." confirmText="Delete" isDestructive={true} isLoading={deletePartyMutation.isPending} icon={<ShieldAlert className="w-6 h-6 text-red-500" />}/>
    </div>
  );
}
