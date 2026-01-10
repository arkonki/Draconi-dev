import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'; // 1. Added useSearchParams
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchPartyById, removePartyMember, deleteParty } from '../lib/api/parties';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { Button } from '../components/shared/Button';
import { 
  Users, Trash2, UserX, ShieldAlert, ClipboardList, Backpack, Swords, FileText, MoreVertical, UserPlus, Sparkles, Hourglass, 
  MessageSquare
} from 'lucide-react';
import { CopyButton } from '../components/shared/CopyButton';
import { ConfirmationDialog } from '../components/shared/ConfirmationDialog';
import { PartyMemberList } from '../components/party/PartyMemberList';
import { PartyNotes } from '../components/party/PartyNotes';
import { PartyTasks } from '../components/party/PartyTasks';
import { PartyInventory } from '../components/party/PartyInventory';
import { PartyEncounterView } from '../components/party/PartyEncounterView';
import { StoryHelperApp } from '../components/party/StoryHelper';
import { TimeTrackerView } from '../components/party/TimeTracker'; 
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/shared/DropdownMenu';
import { GMScreen } from '../components/party/GMScreen';
import { PartyChat } from '../components/party/PartyChat';
import { supabase } from '../lib/supabase';

type Tab = 'members' | 'chat' | 'notes' | 'tasks' | 'inventory' | 'encounter' | 'time' | 'gmScreen' | 'storyhelper'; 

export function PartyView() {
  const { id: partyId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams(); // 2. Get Params
  const navigate = useNavigate();
  const { user, isDM } = useAuth();
  const queryClient = useQueryClient();

  const [isInviteVisible, setIsInviteVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState<'deleteParty' | 'removeMember' | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{id: string, name: string} | null>(null);
  
  const [activeTab, setActiveTab] = useState<Tab>('members'); 
  const [unreadCount, setUnreadCount] = useState(0);

  // 3. Extract noteId from URL
  const noteIdFromUrl = searchParams.get('noteId');

  // 4. Effect: Switch to Notes tab if URL has a noteId
  useEffect(() => {
    if (noteIdFromUrl) {
      setActiveTab('notes');
    }
  }, [noteIdFromUrl]);

  const { data: party, isLoading, error } = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => fetchPartyById(partyId),
    enabled: !!partyId,
  });

  // Realtime Listener for Unread Badge
  useEffect(() => {
    if (!partyId) return;

    const channel = supabase
      .channel(`party-view-badge:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `party_id=eq.${partyId}`,
        },
        () => {
          setActiveTab(currentTab => {
            if (currentTab !== 'chat') {
              setUnreadCount(prev => prev + 1);
            }
            return currentTab;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  const handleTabChange = (tabId: Tab) => {
    setActiveTab(tabId);
    if (tabId === 'chat') {
      setUnreadCount(0);
    }
  };

  const removeMemberMutation = useMutation({
    mutationFn: (characterId: string) => { if (!partyId) throw new Error('Party ID is missing'); return removePartyMember(partyId, characterId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['party', partyId] }); queryClient.invalidateQueries({ queryKey: ['availableCharacters'] }); setDialogOpen(null); setMemberToRemove(null); },
  });

  const deletePartyMutation = useMutation({
    mutationFn: () => { if (!partyId) throw new Error('Party ID is missing'); return deleteParty(partyId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['parties'] }); navigate('/adventure-party'); },
  });

  const handleRemoveMemberClick = (id: string, name: string) => { setMemberToRemove({id, name}); setDialogOpen('removeMember'); };
  const confirmRemoveMember = () => { if (memberToRemove) { removeMemberMutation.mutate(memberToRemove.id); } };
  const confirmDeleteParty = () => { deletePartyMutation.mutate(); };

  const isPartyOwner = user && party && user.id === party.created_by && isDM();
  const joinLink = party?.invite_code ? `${window.location.origin}/party/join/${party.invite_code}` : '';

  const partyMembersString = useMemo(() => {
    return party?.members
      ? party.members.map((m: any) => `- ${m.name} (${m.kin} ${m.profession})`).join('\n')
      : '';
  }, [party]);

  if (isLoading) return <div className="flex justify-center items-center h-96"><LoadingSpinner size="lg" /></div>;
  if (error) return <div className="p-8"><ErrorMessage message={error.message} /></div>;
  if (!party) return <div className="p-8"><ErrorMessage message="Party not found." /></div>;

  const allTabs: { id: Tab; label: string; icon: React.ElementType; dmOnly?: boolean }[] = [
    { id: 'members', label: 'Roster', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageSquare }, 
    { id: 'notes', label: 'Journal', icon: FileText },
    { id: 'tasks', label: 'Quests', icon: ClipboardList },
    { id: 'inventory', label: 'Stash', icon: Backpack },
    { id: 'time', label: 'Time', icon: Hourglass, dmOnly: true }, 
    { id: 'encounter', label: 'Combat', icon: Swords, dmOnly: true },
    { id: 'gmScreen', label: 'GM Screen', icon: ShieldAlert, dmOnly: true },
    { id: 'storyhelper', label: 'Story AI', icon: Sparkles, dmOnly: true },
  ];

  const visibleTabs = allTabs.filter(tab => !tab.dmOnly || isPartyOwner);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Header Card */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-6 md:p-8 bg-gradient-to-r from-white to-gray-50 border-b border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{party.name}</h1>
                <p className="text-gray-500 mt-1 font-medium">A band of {party.members.length} brave adventurers.</p>
              </div>
              
              {isPartyOwner && (
                <div className="flex items-center gap-2">
                   <Button 
                      variant="secondary" 
                      size="sm" 
                      icon={UserPlus} 
                      onClick={() => setIsInviteVisible(!isInviteVisible)}
                      className={isInviteVisible ? "bg-blue-50 border-blue-200 text-blue-700" : ""}
                   >
                      Invite
                   </Button>

                   <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="outline" size="icon" aria-label="Party Settings"><MoreVertical className="h-5 w-5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialogOpen('deleteParty')} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" /> Disband Party
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {isInviteVisible && isPartyOwner && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg animate-in slide-in-from-top-2 fade-in">
                <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-2">Invite Link</h3>
                <div className="flex items-center gap-2">
                  <div className="flex-grow bg-white border border-blue-200 rounded-md px-3 py-2 text-sm text-gray-600 font-mono truncate">
                    {joinLink}
                  </div>
                  <CopyButton textToCopy={joinLink} />
                </div>
              </div>
            )}
        </div>

        <div className="border-b border-gray-200 bg-white overflow-x-auto">
          <nav className="flex px-6 min-w-max">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)} 
                className={`
                  relative group flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-all
                  ${activeTab === tab.id 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                {tab.label}

                {tab.id === 'chat' && unreadCount > 0 && (
                  <span className="absolute top-3 right-0 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl min-h-[500px] overflow-hidden">
        {activeTab === 'members' && (
          <div className="p-6">
            <PartyMemberList 
              party={party} 
              isDM={isPartyOwner} 
              currentUserId={user?.id}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['party', partyId] })}
            />
          </div>
        )}
        
        {activeTab === 'chat' && (
           <div className="p-6">
             <PartyChat partyId={partyId!} members={party.members} />
           </div>
        )}
        
        {/* 5. Pass noteIdFromUrl to PartyNotes */}
        {activeTab === 'notes' && (
          <PartyNotes 
            partyId={partyId!} 
            isDM={isPartyOwner} 
            openNoteId={noteIdFromUrl} // <--- Pass the ID
          />
        )}
        
        {activeTab === 'tasks' && <PartyTasks partyId={partyId!} isDM={isPartyOwner} />}
        
        {activeTab === 'inventory' && (
          <div className="p-6">
             <PartyInventory partyId={partyId!} members={party.members} isDM={isPartyOwner} />
          </div>
        )}

        {activeTab === 'time' && (
           <div className="p-6">
             <TimeTrackerView partyId={partyId!} />
           </div>
        )}
        
        {activeTab === 'encounter' && (
           <PartyEncounterView partyId={partyId!} partyMembers={party.members} isDM={isPartyOwner} />
        )}

        {activeTab === 'gmScreen' && <GMScreen />}
        
        {activeTab === 'storyhelper' && (
          <div className="p-6">
             <StoryHelperApp partyId={partyId!} initialPartyData={partyMembersString} />
          </div>
        )}
      </div>

      <ConfirmationDialog 
        isOpen={dialogOpen === 'removeMember'} 
        onClose={() => setDialogOpen(null)} 
        onConfirm={confirmRemoveMember} 
        title="Remove Member" 
        description={`Are you sure you want to remove ${memberToRemove?.name} from the party?`} 
        confirmText="Remove" 
        isDestructive={true} 
        isLoading={removeMemberMutation.isPending} 
        icon={<UserX className="w-6 h-6 text-red-500" />}
      />

      <ConfirmationDialog 
        isOpen={dialogOpen === 'deleteParty'} 
        onClose={() => setDialogOpen(null)} 
        onConfirm={confirmDeleteParty} 
        title="Disband Party" 
        description="Are you sure? This will permanently delete the party and all associated data." 
        confirmText="Disband Permanently" 
        isDestructive={true} 
        isLoading={deletePartyMutation.isPending} 
        icon={<ShieldAlert className="w-6 h-6 text-red-500" />}
      />
    </div>
  );
}