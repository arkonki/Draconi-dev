import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'; // 1. Added useSearchParams
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/useAuth';
import { fetchPartyById, removePartyMember, deleteParty } from '../lib/api/parties';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { Button } from '../components/shared/Button';
import {
  Users, Trash2, UserX, ShieldAlert, ClipboardList, Backpack, Swords, FileText, MoreVertical, UserPlus, Sparkles, Hourglass,
  MessageSquare, ChevronDown, Dices, Map
} from 'lucide-react';
import { CopyButton } from '../components/shared/CopyButton';
import { ConfirmationDialog } from '../components/shared/ConfirmationDialog';
import { PartyMemberList } from '../components/party/PartyMemberList';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/shared/DropdownMenu';
import { EncounterChatView } from '../components/party/EncounterChatView';
import { supabase } from '../lib/supabase';
import { Breadcrumbs, BreadcrumbItem } from '../components/shared/Breadcrumbs';
import { Home } from 'lucide-react';

type Tab = 'members' | 'chat' | 'notes' | 'tasks' | 'inventory' | 'encounter' | 'time' | 'tables' | 'gmScreen' | 'storyhelper' | 'atlas';

const StoryHelperApp = lazy(() =>
  import('../components/party/StoryHelper').then((module) => ({
    default: module.StoryHelperApp,
  }))
);
const PartyChat = lazy(() =>
  import('../components/party/PartyChat').then((module) => ({
    default: module.PartyChat,
  }))
);
const PartyNotes = lazy(() =>
  import('../components/party/PartyNotes').then((module) => ({
    default: module.PartyNotes,
  }))
);
const AtlasView = lazy(() =>
  import('../components/party/AtlasView').then((module) => ({
    default: module.AtlasView,
  }))
);
const PartyTasks = lazy(() =>
  import('../components/party/PartyTasks').then((module) => ({
    default: module.PartyTasks,
  }))
);
const PartyInventory = lazy(() =>
  import('../components/party/PartyInventory').then((module) => ({
    default: module.PartyInventory,
  }))
);
const TimeTrackerView = lazy(() =>
  import('../components/party/TimeTracker').then((module) => ({
    default: module.TimeTrackerView,
  }))
);
const PartyEncounterView = lazy(() =>
  import('../components/party/PartyEncounterView').then((module) => ({
    default: module.PartyEncounterView,
  }))
);
const RandomTableManager = lazy(() =>
  import('../components/tools/RandomTableManager').then((module) => ({
    default: module.RandomTableManager,
  }))
);
const GMScreen = lazy(() =>
  import('../components/party/GMScreen').then((module) => ({
    default: module.GMScreen,
  }))
);

export function PartyView() {
  const { id: partyId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams(); // 2. Get Params
  const navigate = useNavigate();
  const { user, isDM } = useAuth();
  const queryClient = useQueryClient();

  const [isInviteVisible, setIsInviteVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Added for custom dropdown
  const [dialogOpen, setDialogOpen] = useState<'deleteParty' | 'removeMember' | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string, name: string } | null>(null);

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

  const confirmRemoveMember = () => { if (memberToRemove) { removeMemberMutation.mutate(memberToRemove.id); } };
  const confirmDeleteParty = () => { deletePartyMutation.mutate(); };

  const isPartyOwner = user && party && user.id === party.created_by && isDM();
  const joinLink = party?.invite_code ? `${window.location.origin}/party/join/${party.invite_code}` : '';

  if (isLoading) return <div className="flex justify-center items-center h-96"><LoadingSpinner size="lg" /></div>;
  if (error) return <div className="p-8"><ErrorMessage message={error.message} /></div>;
  if (!party) return <div className="p-8"><ErrorMessage message="Party not found." /></div>;

  const allTabs: { id: Tab; label: string; icon: React.ElementType; dmOnly?: boolean }[] = [
    { id: 'members', label: 'Roster', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'notes', label: 'Journal', icon: FileText },
    { id: 'atlas', label: 'Atlas', icon: Map },
    { id: 'tasks', label: 'Quests', icon: ClipboardList },
    { id: 'inventory', label: 'Stash', icon: Backpack },
    { id: 'time', label: 'Time', icon: Hourglass, dmOnly: true },
    { id: 'encounter', label: 'Combat', icon: Swords, dmOnly: true },
    { id: 'tables', label: 'Roll Tables', icon: Dices, dmOnly: true },
    { id: 'gmScreen', label: 'GM Screen', icon: ShieldAlert, dmOnly: true },
    { id: 'storyhelper', label: 'Story AI', icon: Sparkles, dmOnly: true },
  ];

  const visibleTabs = allTabs.filter(tab => !tab.dmOnly || isPartyOwner);

  // Helper function to get tab label
  const getTabLabel = (tabId: Tab): string => {
    const tab = allTabs.find(t => t.id === tabId);
    return tab?.label || tabId;
  };

  // Build breadcrumbs dynamically
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Adventure Party', path: '/adventure-party', icon: Users },
    { label: party.name }
  ];

  // Add active tab to breadcrumbs if not on members (default) tab
  if (activeTab !== 'members') {
    const tab = allTabs.find(t => t.id === activeTab);
    if (tab) {
      breadcrumbs.push({ label: getTabLabel(activeTab), icon: tab.icon });
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <Breadcrumbs items={breadcrumbs} />
      {/* Header Card */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-visible">
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
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Party Settings"><MoreVertical className="h-5 w-5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
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

        {/* Navigation - Unified Dropdown (Reverted Design) */}
        <div className="border-b border-gray-200 bg-white relative">
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                {(() => {
                  const currentTab = allTabs.find(t => t.id === activeTab);
                  const Icon = currentTab?.icon || Users;
                  return (
                    <>
                      <Icon className="w-5 h-5 text-indigo-600" />
                      <span className="font-medium text-gray-900">{currentTab?.label || 'Menu'}</span>
                    </>
                  );
                })()}
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Wrapper for dropdown content to handle absolute positioning */}
          {isMenuOpen && (
            <>
              {/* Backdrop to close on click outside */}
              <button
                type="button"
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close menu"
              />

              <div
                className="absolute top-full left-0 right-0 mx-4 mt-1 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 z-50 overflow-hidden"
                style={{ maxHeight: '60vh', overflowY: 'auto' }}
              >
                <div className="py-1">
                  {visibleTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        handleTabChange(tab.id);
                        setIsMenuOpen(false);
                      }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b border-gray-50 last:border-0 ${activeTab === tab.id
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                    >
                      <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                      <span className="flex-1">{tab.label}</span>
                      {tab.id === 'chat' && unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl min-h-[500px] overflow-hidden">
        {(() => {
          const lazyTabFallback = (
            <div className="p-6 flex items-center justify-center min-h-[220px]">
              <LoadingSpinner size="lg" />
            </div>
          );

          return (
            <>
        {activeTab === 'members' && (
          <div className="p-6">
            <PartyMemberList
              party={party}
              isDM={!!isPartyOwner}
              currentUserId={user?.id}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['party', partyId] })}
            />
          </div>
        )}

        {activeTab === 'chat' && (
          <Suspense fallback={lazyTabFallback}>
            <div className="p-6">
              <PartyChat partyId={partyId!} members={party.members} />
            </div>
          </Suspense>
        )}

        {/* 5. Pass noteIdFromUrl to PartyNotes */}
        {activeTab === 'notes' && (
          <Suspense fallback={lazyTabFallback}>
            <PartyNotes
              partyId={partyId!}
              isDM={!!isPartyOwner}
              openNoteId={noteIdFromUrl}
            />
          </Suspense>
        )}

        {activeTab === 'atlas' && (
          <Suspense fallback={lazyTabFallback}>
            <div className="p-6">
              <AtlasView partyId={partyId!} isDM={!!isPartyOwner} />
            </div>
          </Suspense>
        )}

        {activeTab === 'tasks' && (
          <Suspense fallback={lazyTabFallback}>
            <PartyTasks partyId={partyId!} isDM={!!isPartyOwner} />
          </Suspense>
        )}

        {activeTab === 'inventory' && (
          <Suspense fallback={lazyTabFallback}>
            <div className="p-6">
              <PartyInventory partyId={partyId!} members={party.members} isDM={!!isPartyOwner} />
            </div>
          </Suspense>
        )}

        {activeTab === 'time' && (
          <Suspense fallback={lazyTabFallback}>
            <div className="p-6">
              <TimeTrackerView partyId={partyId!} onTabChange={handleTabChange} />
            </div>
          </Suspense>
        )}

        {activeTab === 'encounter' && (
          <Suspense fallback={lazyTabFallback}>
            <PartyEncounterView partyId={partyId!} partyMembers={party.members} isDM={!!isPartyOwner} />
          </Suspense>
        )}

        {/* 6. Roll Tables View */}
        {activeTab === 'tables' && (
          <Suspense fallback={lazyTabFallback}>
            <div className="p-6">
              <RandomTableManager partyId={partyId!} />
            </div>
          </Suspense>
        )}

        {activeTab === 'gmScreen' && (
          <Suspense fallback={lazyTabFallback}>
            <GMScreen />
          </Suspense>
        )}

        {activeTab === 'storyhelper' && (
          <div className="p-6">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-16">
                  <LoadingSpinner size="lg" />
                </div>
              }
            >
              <StoryHelperApp partyId={partyId!} />
            </Suspense>
          </div>
        )}
            </>
          );
        })()}
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
      {partyId && <EncounterChatView forcedPartyId={partyId} forcedPartyName={party.name} forcedMembers={party.members} />}
    </div>
  );
}
