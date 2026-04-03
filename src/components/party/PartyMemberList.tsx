import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Character, WeaponEntry } from '../../types/character';
import { Shield, Heart, Zap, Sword, UserX, Users, ExternalLink, Skull, Minus, Plus, Loader2, MoreVertical, XCircle } from 'lucide-react';
import { Button } from '../shared/Button';
import { removePartyMember } from '../../lib/api/parties';
import { mapCharacterData, updateCharacter } from '../../lib/api/characters';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Party } from '../../lib/api/parties';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../shared/DropdownMenu';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { CharacterSheet } from '../character/CharacterSheet';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const CONDITION_STYLES: Record<string, string> = {
  exhausted: 'bg-amber-50 text-amber-700 border-amber-100',
  sickly: 'bg-lime-50 text-lime-700 border-lime-100',
  dazed: 'bg-violet-50 text-violet-700 border-violet-100',
  angry: 'bg-red-50 text-red-700 border-red-100',
  scared: 'bg-sky-50 text-sky-700 border-sky-100',
  disheartened: 'bg-slate-50 text-slate-700 border-slate-200',
};

// --- TYPES ---

interface PartyMemberListProps {
  party: {
    id: string;
    name: string;
    created_by: string;
    members: Character[];
  };
  isDM: boolean;
  currentUserId?: string;
  onUpdate: () => void;
}

interface CharacterSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  onRetry: () => void;
  members: Character[];
  selectedMemberId: string | null;
  onSelectMember: (memberId: string) => void;
}

function CharacterSheetModal({
  isOpen,
  onClose,
  title,
  isLoading,
  isReady,
  error,
  onRetry,
  members,
  selectedMemberId,
  onSelectMember,
}: CharacterSheetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-2 md:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full h-[96vh] md:h-[92vh] max-w-[1400px] overflow-hidden border border-stone-300 flex flex-col">
        <div className="p-3 md:p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <div className="min-w-0">
            <h3 className="text-base md:text-lg font-bold font-serif">Character Sheet</h3>
            <p className="text-xs text-stone-300 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close character sheet">
            <XCircle size={24} />
          </button>
        </div>

        {members.length > 1 && (
          <div className="border-b bg-stone-100 px-3 py-2 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max" role="tablist" aria-label="Party members">
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onSelectMember(member.id)}
                  role="tab"
                  id={`character-sheet-tab-${member.id}`}
                  aria-selected={member.id === selectedMemberId}
                  aria-controls={`character-sheet-panel-${member.id}`}
                  tabIndex={member.id === selectedMemberId ? 0 : -1}
                  className={`px-3 py-1.5 rounded-t-lg rounded-b-sm border text-sm font-medium transition-colors whitespace-nowrap ${
                    member.id === selectedMemberId
                      ? 'bg-white text-stone-900 border-stone-300 border-b-white shadow-sm'
                      : 'bg-stone-200/70 text-stone-600 border-transparent hover:bg-white/80 hover:text-stone-800'
                  }`}
                >
                  {member.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto bg-[#f5f0e1]"
          role="tabpanel"
          id={`character-sheet-panel-${selectedMemberId ?? 'default'}`}
          aria-labelledby={selectedMemberId ? `character-sheet-tab-${selectedMemberId}` : undefined}
        >
          {error ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <p className="text-red-600 font-semibold">{error}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button variant="primary" onClick={onRetry}>Retry</Button>
              </div>
            </div>
          ) : isLoading || !isReady ? (
            <div className="h-full flex items-center justify-center gap-3 text-stone-600">
              <LoadingSpinner />
              <span className="font-medium">Loading character sheet...</span>
            </div>
          ) : (
            <CharacterSheet />
          )}
        </div>
      </div>
    </div>
  );
}

// --- COMPONENT 1: INTERACTIVE STAT BAR (ANIMATED) ---

const StatBar = ({ 
  label, 
  icon: Icon, 
  current, 
  max, 
  colorClass, 
  fillClass,
  onAdjust,
  isDM,
  isUpdating = false,
}: { 
  label: string, 
  icon: React.ComponentType<{ className?: string }>, 
  current: number, 
  max: number, 
  colorClass: string, 
  fillClass: string, 
  onAdjust?: (amount: number) => void,
  isDM?: boolean,
  isUpdating?: boolean,
}) => {
  // Calculate percentage, clamped between 0 and 100
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(100, Math.max(0, (current / safeMax) * 100));

  return (
    <div className="group/stat select-none">
      <div className="flex justify-between items-center text-xs font-bold mb-1">
        <span className="flex items-center gap-1 text-gray-600">
            <Icon className={`w-3 h-3 ${colorClass}`} /> {label}
        </span>
        
        <div className="flex items-center gap-2">
          {/* GM Controls: Fade in on hover (desktop) or always visible if active */}
          {isDM && onAdjust && (
            <div className="flex items-center opacity-100 md:opacity-0 group-hover/stat:opacity-100 transition-opacity bg-gray-100 rounded border border-gray-200 shadow-sm overflow-hidden">
              <button 
                onClick={(e) => { e.stopPropagation(); onAdjust(-1); }}
                className="w-6 h-5 flex items-center justify-center hover:bg-gray-200 hover:text-red-600 active:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Decrease"
                disabled={isUpdating}
              >
                <Minus size={12} strokeWidth={3} />
              </button>
              <div className="w-px h-3 bg-gray-300"></div>
              <button 
                onClick={(e) => { e.stopPropagation(); onAdjust(1); }}
                className="w-6 h-5 flex items-center justify-center hover:bg-gray-200 hover:text-green-600 active:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Increase"
                disabled={isUpdating}
              >
                <Plus size={12} strokeWidth={3} />
              </button>
            </div>
          )}
          
          <span className={`${current === 0 ? 'text-red-600 animate-pulse' : 'text-gray-700'} transition-colors duration-300`}>
            {current} / {max}
          </span>
          {isUpdating && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
        </div>
      </div>
      
      {/* Animated Bar Background */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-100 relative">
        {/* Animated Bar Fill */}
        <div 
            className={`h-full ${fillClass} transition-all duration-500 ease-out`} 
            style={{ width: `${percent}%` }} 
        />
      </div>
    </div>
  );
};

// --- COMPONENT 2: MEMBER CARD ---

const MemberCard = React.memo(({ 
  member, 
  isDM, 
  onRemove, 
  onView,
  onAdjustHP,
  onAdjustWP,
  isUpdatingHP,
  isUpdatingWP,
}: { 
  member: Character, 
  isDM: boolean, 
  onRemove: (id: string, name: string) => void,
  onView: (id: string) => void,
  onAdjustHP: (amount: number) => void,
  onAdjustWP: (amount: number) => void,
  isUpdatingHP: boolean,
  isUpdatingWP: boolean,
}) => {
  
  const activeConditions = useMemo(() => 
    Object.entries(member.conditions || {}).filter(([, active]) => active), 
  [member.conditions]);
  
  const initials = member.name.slice(0, 2).toUpperCase();

  const getEquippedItemName = (item: unknown) => {
    if (!item) return null;
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && 'name' in item && typeof item.name === 'string') return item.name;
    return null;
  };

  const armorName = getEquippedItemName(member.equipment?.equipped?.armor as unknown);
  const helmetName = getEquippedItemName(member.equipment?.equipped?.helmet as unknown);
  const shieldName = getEquippedItemName(member.equipment?.equipped?.shield as unknown);
  const weapons: WeaponEntry[] = member.equipment?.equipped?.weapons || [];
  const loadoutRows = [
    armorName ? { label: 'Armor', icon: Shield, value: armorName, iconClass: 'opacity-70' } : null,
    helmetName ? { label: 'Helmet', icon: Shield, value: helmetName, iconClass: 'opacity-50' } : null,
    shieldName ? { label: 'Shield', icon: Shield, value: shieldName, iconClass: 'opacity-60' } : null,
    weapons.length > 0
      ? { label: 'Weapons', icon: Sword, value: weapons.slice(0, 2).map((w) => w.name).join(', '), iconClass: 'opacity-70' }
      : null,
  ].filter(Boolean) as Array<{ label: string; icon: typeof Shield; value: string; iconClass: string }>;

  const Avatar = () => {
    if (member.portrait_url) {
        return (
            <img src={member.portrait_url} alt={member.name} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md bg-gray-100"/>
        );
    }
    return (
        <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl border-2 border-white shadow-md shrink-0">
            {initials}
        </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="p-5 border-b border-gray-50 flex items-start gap-4 bg-gray-50/30">
        <button onClick={() => onView(member.id)} className="shrink-0 hover:opacity-90 transition-opacity focus:outline-none" title="Open Character Sheet">
          <Avatar />
        </button>

        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => onView(member.id)} className="group text-left min-w-0 flex-1 focus:outline-none">
              <h3 className="font-bold text-gray-900 text-lg leading-tight break-words group-hover:text-indigo-700 transition-colors flex items-center gap-2">
                <span className="min-w-0 break-words">{member.name}</span>
                <ExternalLink size={14} className="shrink-0 text-gray-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-all" />
              </h3>
              <div className="h-0.5 w-0 bg-indigo-500 group-hover:w-full transition-all duration-300 mt-0.5 opacity-50"></div>
            </button>
            {isDM && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-gray-600 transition-colors"
                    aria-label={`Member actions for ${member.name}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuItem onSelect={() => onRemove(member.id, member.name)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <UserX className="w-4 h-4" /> Remove from Party
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1.5 break-words leading-snug">
            {member.kin} • {member.profession}
          </p>
        </div>
      </div>

      {/* Stats & Info */}
      <div className="p-5 space-y-5 flex-grow">
        
        {/* Health & Willpower Bars */}
        <div className="space-y-3">
            <StatBar 
                label="Health" 
                icon={Heart} 
                current={member.current_hp} 
                max={member.max_hp} 
                colorClass="text-red-500 fill-red-500" 
                fillClass="bg-red-500" 
                isDM={isDM}
                onAdjust={onAdjustHP}
                isUpdating={isUpdatingHP}
            />
            <StatBar 
                label="Willpower" 
                icon={Zap} 
                current={member.current_wp} 
                max={member.max_wp} 
                colorClass="text-blue-500 fill-blue-500" 
                fillClass="bg-blue-500" 
                isDM={isDM}
                onAdjust={onAdjustWP}
                isUpdating={isUpdatingWP}
            />
        </div>

        {/* Conditions Badge List */}
        <div className="min-h-[24px]">
            {activeConditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
                {activeConditions.map(([name]) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase border animate-in fade-in ${CONDITION_STYLES[name] || 'bg-stone-50 text-stone-700 border-stone-200'}`}
                >
                    <Skull size={10} /> {name}
                </span>
                ))}
            </div>
            ) : (
            <div className="text-xs text-gray-400 italic flex items-center gap-1">
                <Shield size={10} /> Healthy
            </div>
            )}
        </div>

        {/* Equipment Snapshot */}
        <div className="pt-4 border-t border-gray-100">
           <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Loadout</h4>
           {loadoutRows.length > 0 ? (
             <div className="space-y-2 text-sm text-gray-700">
                {loadoutRows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 shrink-0 ${row.iconClass}`} />
                      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{row.label}</span>
                      <span className="truncate">{row.value}</span>
                    </div>
                  );
                })}
             </div>
           ) : (
             <div className="text-xs text-gray-400 italic flex items-center gap-1">
               <Sword className="w-3 h-3" /> No equipped gear
             </div>
           )}
        </div>
      </div>

    </div>
  );
});

// --- MAIN COMPONENT: PARTY LIST ---

export function PartyMemberList({ party, isDM, currentUserId, onUpdate }: PartyMemberListProps) {
  const queryClient = useQueryClient();
  const {
    character: viewedSheetCharacter,
    isLoading: isCharacterSheetLoading,
    error: characterSheetError,
    fetchCharacter: fetchCharacterSheetData,
    setCharacter: setViewedSheetCharacter,
  } = useCharacterSheetStore();
  const [updatingStats, setUpdatingStats] = useState<Record<string, boolean>>({});
  const [isCharacterSheetModalOpen, setIsCharacterSheetModalOpen] = useState(false);
  const [selectedSheetMemberId, setSelectedSheetMemberId] = useState<string | null>(null);
  const previousViewedCharacterRef = useRef<Character | null>(null);
  const activeSheetRequestIdRef = useRef(0);
  const shouldRestoreCharacterContextRef = useRef(false);
  const memberIds = useMemo(() => new Set(party.members.map((member) => member.id)), [party.members]);
  const selectedSheetMember = useMemo(
    () => party.members.find((member) => member.id === selectedSheetMemberId) ?? null,
    [party.members, selectedSheetMemberId]
  );
  const requestedSheetCharacterId = selectedSheetMemberId;
  const isRequestedCharacterLoaded = !!requestedSheetCharacterId && viewedSheetCharacter?.id === requestedSheetCharacterId;

  const restorePreviousCharacterContext = () => {
    const previousCharacter = previousViewedCharacterRef.current;
    previousViewedCharacterRef.current = null;
    shouldRestoreCharacterContextRef.current = false;
    setViewedSheetCharacter(previousCharacter ?? null);
  };

  const loadCharacterSheetForModal = (characterId: string, userId: string) => {
    shouldRestoreCharacterContextRef.current = false;
    const requestId = ++activeSheetRequestIdRef.current;

    void fetchCharacterSheetData(characterId, userId).finally(() => {
      if (activeSheetRequestIdRef.current !== requestId) return;
      if (shouldRestoreCharacterContextRef.current) {
        restorePreviousCharacterContext();
      }
    });
  };

  const handleOpenCharacterSheet = (characterId: string) => {
    if (!currentUserId) {
      alert('Cannot open character sheet: user not authenticated.');
      return;
    }

    if (!isCharacterSheetModalOpen) {
      previousViewedCharacterRef.current = useCharacterSheetStore.getState().character;
    }

    setSelectedSheetMemberId(characterId);
    setIsCharacterSheetModalOpen(true);
    loadCharacterSheetForModal(characterId, currentUserId);
  };

  const handleRetryCharacterSheetLoad = () => {
    if (!requestedSheetCharacterId || !currentUserId) return;
    loadCharacterSheetForModal(requestedSheetCharacterId, currentUserId);
  };

  const handleSelectSheetMember = (memberId: string) => {
    if (!currentUserId || memberId === selectedSheetMemberId) return;
    setSelectedSheetMemberId(memberId);
    loadCharacterSheetForModal(memberId, currentUserId);
  };

  const handleCloseCharacterSheetModal = () => {
    setIsCharacterSheetModalOpen(false);
    setSelectedSheetMemberId(null);

    shouldRestoreCharacterContextRef.current = true;
    if (!isCharacterSheetLoading) {
      restorePreviousCharacterContext();
    }
  };

  useEffect(() => {
    return () => {
      if (previousViewedCharacterRef.current || shouldRestoreCharacterContextRef.current) {
        restorePreviousCharacterContext();
      }
    };
  }, []);

  // --- 1. REAL-TIME SUBSCRIPTION ---
  useEffect(() => {
    const applyCharacterUpdate = (updatedRow: unknown) => {
      const updatedMember = mapCharacterData(updatedRow);

      queryClient.setQueryData<Party>(['party', party.id], (currentParty) => {
        if (!currentParty) {
          return currentParty;
        }

        return {
          ...currentParty,
          members: currentParty.members.map((member) =>
            member.id === updatedMember.id
              ? {
                  ...member,
                  ...updatedMember,
                  party_id: updatedMember.party_id || member.party_id || party.id,
                }
              : member
          ),
        };
      });
    };

    const channel = supabase
      .channel(`party-view-${party.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
        },
        (payload) => {
          const updatedId = typeof payload.new?.id === 'string' ? payload.new.id : null;
          const previousId = typeof payload.old?.id === 'string' ? payload.old.id : null;
          if (!updatedId || (!memberIds.has(updatedId) && !(previousId && memberIds.has(previousId)))) {
            return;
          }

          applyCharacterUpdate(payload.new);
          queryClient.invalidateQueries({ queryKey: ['party', party.id] });
          queryClient.invalidateQueries({ queryKey: ['parties'] });
          queryClient.invalidateQueries({ queryKey: ['myParties'] });

          if (onUpdate) onUpdate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `party_id=eq.${party.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['party', party.id] });
          queryClient.invalidateQueries({ queryKey: ['parties'] });
          queryClient.invalidateQueries({ queryKey: ['myParties'] });

          if (onUpdate) onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberIds, onUpdate, party.id, queryClient]);

  // --- 2. STAT ADJUSTMENT ---
  const handleStatAdjust = async (charId: string, stat: 'current_hp' | 'current_wp', amount: number, currentVal: number, maxVal: number) => {
    // 1. Calculate new value
    const newVal = Math.min(maxVal, Math.max(0, currentVal + amount));
    if (newVal === currentVal) return;

    const statKey = `${charId}:${stat}`;
    const previousParty = queryClient.getQueryData<Party>(['party', party.id]);

    setUpdatingStats((prev) => ({ ...prev, [statKey]: true }));

    queryClient.setQueryData<Party>(['party', party.id], (currentParty) => {
      if (!currentParty) {
        return currentParty;
      }

      return {
        ...currentParty,
        members: currentParty.members.map((member) =>
          member.id === charId ? { ...member, [stat]: newVal } : member
        ),
      };
    });

    try {
      await updateCharacter(charId, { [stat]: newVal });
      await queryClient.invalidateQueries({ queryKey: ['party', party.id] });
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
    } catch (e) {
      console.error("Failed to update stat", e);
      if (previousParty) {
        queryClient.setQueryData(['party', party.id], previousParty);
      }
      alert('Failed to update character stat. Please try again.');
    } finally {
      setUpdatingStats((prev) => {
        const next = { ...prev };
        delete next[statKey];
        return next;
      });
    }
  };

  const handleRemoveMember = async (characterId: string, characterName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${characterName} from the party?`)) {
      return;
    }
    try {
      await removePartyMember(party.id, characterId);
      queryClient.invalidateQueries({ queryKey: ['party', party.id] });
      onUpdate();
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member. Please try again.');
    }
  };

  // --- 3. RENDER ---

  if (party.members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 animate-in fade-in zoom-in-95 duration-500">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
           <Users className="w-8 h-8 text-gray-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">Waiting for Adventurers</h3>
        <p className="text-gray-500 text-sm mt-1 max-w-sm text-center">
          Share the party code with your players to have them join the roster.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {party.members.map(member => (
        <MemberCard 
            key={member.id} 
            member={member} 
            isDM={isDM} 
            onRemove={handleRemoveMember}
            onView={handleOpenCharacterSheet}
            onAdjustHP={(amount) => handleStatAdjust(member.id, 'current_hp', amount, member.current_hp, member.max_hp)}
            onAdjustWP={(amount) => handleStatAdjust(member.id, 'current_wp', amount, member.current_wp, member.max_wp)}
            isUpdatingHP={Boolean(updatingStats[`${member.id}:current_hp`])}
            isUpdatingWP={Boolean(updatingStats[`${member.id}:current_wp`])}
        />
        ))}
      <CharacterSheetModal
        isOpen={isCharacterSheetModalOpen}
        onClose={handleCloseCharacterSheetModal}
        title={selectedSheetMember?.name || 'Character'}
        isLoading={isCharacterSheetLoading}
        isReady={isRequestedCharacterLoaded}
        error={characterSheetError}
        onRetry={handleRetryCharacterSheetLoad}
        members={party.members}
        selectedMemberId={selectedSheetMemberId}
        onSelectMember={handleSelectSheetMember}
      />
    </div>
  );
}
