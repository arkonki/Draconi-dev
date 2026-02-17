import React, { useState, useEffect } from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { MessageSquare, Dices, Loader2, X, Heart, ShieldAlert, RotateCcw, Skull, Zap, ChevronDown } from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';
import type { EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';
import { useAuth } from '../../contexts/useAuth';
import { useQuery } from '@tanstack/react-query';
import { PartyChat } from '../party/PartyChat';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../shared/DropdownMenu';
import { fetchParties } from '../../lib/api/parties';

// --- HELPER: Editable Stat Box ---
interface StatInputProps {
  value: number;
  max: number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const StatInput = ({ value, max, icon: Icon, colorClass, onChange, disabled }: StatInputProps) => {
  const [localVal, setLocalVal] = useState(String(value));
  useEffect(() => { setLocalVal(String(value)); }, [value]);
  const handleBlur = () => {
    const num = parseInt(localVal);
    if (!isNaN(num) && num !== value) onChange(num);
    else setLocalVal(String(value));
  };
  return (
    <div className="flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm h-7">
      <div className={`px-1.5 h-full flex items-center justify-center bg-stone-50 border-r border-stone-200`}>
        <Icon className={`w-3 h-3 ${value === 0 ? 'text-stone-400' : colorClass}`} />
      </div>
      <input
        type="number"
        className="w-10 px-1 text-center font-bold text-sm outline-none focus:bg-blue-50"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        disabled={disabled}
      />
      {/* Only show max if it's greater than 0 */}
      {max > 0 && <div className="px-1.5 h-full flex items-center justify-center text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{max}</div>}
    </div>
  );
};

// --- HELPER: Combatant Card ---
const CombatantCard = ({ combatant }: { combatant: EncounterCombatant }) => {
  const { setInitiativeForCombatant, updateCombatant, isSaving, character } = useCharacterSheetStore();
  const [initiativeValue, setInitiativeValue] = useState<string>(combatant.initiative_roll?.toString() ?? '');

  useEffect(() => { setInitiativeValue(combatant.initiative_roll?.toString() ?? ''); }, [combatant.initiative_roll]);

  const handleSetInitiative = () => {
    const initiative = parseInt(initiativeValue, 10);
    if (!isNaN(initiative) && initiative >= 1 && initiative <= 10) {
      setInitiativeForCombatant(combatant.id, initiative);
    }
  };

  const isMyCharacter = combatant.character_id === character?.id;
  const isPlayer = !!combatant.character_id;
  const hasActed = combatant.has_acted || false;
  const isMonster = !isPlayer;
  const isDefeated = isMonster && combatant.current_hp === 0;
  const isDying = isPlayer && combatant.current_hp === 0;
  const canEditStats = isMyCharacter;

  let borderClass = isPlayer ? 'border-teal-600 bg-teal-50' : 'border-orange-700 bg-orange-50';
  if (isDefeated) borderClass = 'border-stone-400 bg-stone-200 opacity-70';
  else if (hasActed) borderClass = 'border-stone-300 bg-stone-100 opacity-70 grayscale';

  const maxWp = combatant.max_wp || combatant.character?.max_wp || 0;
  const showWp = !isMonster || maxWp > 0;

  return (
    <div className={`relative p-3 rounded-lg border-l-4 shadow-sm transition-all ${borderClass}`}>
      {isDefeated && <div className="absolute inset-0 flex items-center justify-center z-0 opacity-20"><span className="text-3xl font-black uppercase -rotate-12 text-black">Defeated</span></div>}
      <div className="relative z-10 flex justify-between items-start mb-2">
        <div className="flex-grow">
          <p className={`font-bold leading-tight ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-900'}`}>{combatant.display_name}</p>
          {isDying && <span className="text-xs font-bold text-red-600 flex items-center gap-1"><Skull size={12} /> DYING</span>}
        </div>
        <div className="flex items-center gap-2 ml-2">
          {(!combatant.initiative_roll || isMyCharacter) && !isDefeated ? (
            <div className="flex items-center gap-1">
              <input type="number" value={initiativeValue} onChange={(e) => setInitiativeValue(e.target.value)} placeholder="#" className="w-8 px-1 py-0.5 text-center border rounded text-sm font-bold" min="1" max="10" disabled={isSaving} />
              {!combatant.initiative_roll && <Button onClick={handleSetInitiative} size="sm" variant="secondary" disabled={isSaving}>Set</Button>}
            </div>
          ) : (
            <div className="w-8 h-8 bg-white border-2 border-stone-800 rounded flex items-center justify-center font-serif font-bold text-lg shadow-sm">{combatant.initiative_roll}</div>
          )}
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatInput value={combatant.current_hp || 0} max={combatant.max_hp || 10} icon={Heart} colorClass="text-red-600" disabled={!canEditStats || isSaving} onChange={(val: number) => updateCombatant(combatant.id, { current_hp: val })} />
          {showWp && <StatInput value={combatant.current_wp || combatant.character?.current_wp || 0} max={maxWp} icon={Zap} colorClass="text-blue-600" disabled={!canEditStats || isSaving} onChange={(val: number) => updateCombatant(combatant.id, { current_wp: val })} />}
        </div>
        {(isMyCharacter || !isPlayer) && !isDefeated && (
          <Button onClick={() => updateCombatant(combatant.id, { has_acted: !combatant.has_acted })} size="sm" variant={hasActed ? "ghost" : "outline"} className={hasActed ? "text-stone-500" : "text-stone-800 border-stone-400 bg-white"} title="End Turn">
            {hasActed ? <RotateCcw size={14} /> : <ShieldAlert size={14} />}
          </Button>
        )}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
interface PartySummary {
  id: string;
  name: string;
  members: Character[];
}

interface IncomingMessage {
  party_id?: string;
}

export function EncounterChatView({ forcedPartyId, forcedPartyName, forcedMembers }: { forcedPartyId?: string, forcedPartyName?: string, forcedMembers?: Character[] }) {
  const { user } = useAuth();
  const { character, activeEncounter, encounterCombatants, isLoadingEncounter, fetchActiveEncounter } = useCharacterSheetStore();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'combat' | 'chat'>('combat');
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(forcedPartyId || null);
  const [unreadCount, setUnreadCount] = useState(0);

  // ...

  // 1. Fetch User's Parties (Both DM and Player)
  const { data: myParties = [] } = useQuery<PartySummary[]>({
    queryKey: ['myParties', user?.id],
    queryFn: async () => {
      if (!user) return [];

      try {
        const [dmParties, playerParties] = await Promise.all([
          fetchParties(user.id, true),
          fetchParties(user.id, false)
        ]);

        // Merge and deduplicate by ID
        const allParties = [...dmParties, ...playerParties];
        const uniqueParties = Array.from(new Map(allParties.map(p => [p.id, p])).values());

        return uniqueParties.map(p => ({
          id: p.id,
          name: p.name,
          members: p.members
        }));
      } catch (err) {
        console.error("Error fetching parties for chat:", err);
        return [];
      }
    },
    enabled: !!user
  });

  // 2. Set Default Party
  useEffect(() => {
    if (forcedPartyId) {
      if (selectedPartyId !== forcedPartyId) setSelectedPartyId(forcedPartyId);
    } else if (character?.party_id) {
      if (selectedPartyId !== character.party_id) setSelectedPartyId(character.party_id);
    } else if (myParties.length > 0 && !selectedPartyId) {
      setSelectedPartyId(myParties[0].id);
    }
  }, [character?.party_id, myParties, forcedPartyId]);

  // 3. Listen for Chat Messages (Unread Badge)
  useEffect(() => {
    if (!selectedPartyId) return;

    const channel = supabase.channel(`global-chat-monitor`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as IncomingMessage;
        const messagePartyId = msg.party_id;
        const isRelevant = typeof messagePartyId === 'string' &&
          ((myParties.some(p => p.id === messagePartyId)) || (forcedPartyId === messagePartyId));

        if (isRelevant) {
          if (!isOpen || (isOpen && activeTab !== 'chat') || (isOpen && selectedPartyId !== messagePartyId)) {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myParties, isOpen, activeTab, selectedPartyId, forcedPartyId]);

  // Clear unread when opening chat
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setUnreadCount(0);
    }
  }, [isOpen, activeTab]);

  // 4. Listen for Encounter Updates
  useEffect(() => {
    const targetPartyId = forcedPartyId || character?.party_id;
    const targetCharId = character?.id || 'dm-observer';

    if (!targetPartyId) return;

    // Initial fetch
    fetchActiveEncounter(targetPartyId, targetCharId);

    // Subscribe specifically to this party's encounters
    const channel = supabase.channel(`encounter-updates-${targetPartyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'encounters',
          filter: `party_id=eq.${targetPartyId}`
        },
        (payload) => {
          console.log("Encounter update received:", payload);
          if (targetPartyId) {
            fetchActiveEncounter(targetPartyId, targetCharId);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [character?.party_id, character?.id, forcedPartyId]);

  useEffect(() => {
    if (!activeEncounter?.id) return;
    const targetPartyId = forcedPartyId || character?.party_id;
    const targetCharId = character?.id || 'dm-observer';

    const channel = supabase.channel(`combatant-updates`).on('postgres_changes', { event: '*', schema: 'public', table: 'encounter_combatants' }, () => {
      if (targetPartyId) fetchActiveEncounter(targetPartyId, targetCharId);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeEncounter?.id, forcedPartyId, character?.party_id, character?.id]);

  if (!character && myParties.length === 0 && !forcedPartyId) return null;

  const isInActiveEncounter = activeEncounter?.status === 'active';

  // Resolve current party details (either from Fetch or Forced)
  const partyFromList = myParties.find(p => p.id === selectedPartyId);
  const currentPartyName = partyFromList?.name || forcedPartyName || 'Party View';
  const currentPartyMembers = partyFromList?.members || forcedMembers || [];

  const sortedCombatants = [...(encounterCombatants || [])].sort((a, b) => (a.initiative_roll ?? 1000) - (b.initiative_roll ?? 1000));

  return (
    <>
      {/* --- FLOATING TOGGLE BUTTON --- */}
      {/* Changed: Adjusted position 'bottom-20 md:bottom-4' to sit higher on mobile */}
      {/* Changed: Z-index 50 to stay above standard UI but below modal */}
      <button
        className={`fixed bottom-20 md:bottom-4 right-4 p-3 md:p-4 rounded-full shadow-lg text-white transition-all duration-200 z-50 hover:scale-105 active:scale-95 ${isInActiveEncounter ? 'bg-red-700 hover:bg-red-800 ring-2 ring-red-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? "Close Chat/Combat" : "Open Chat/Combat"}
      >
        <div className="relative">
          {isInActiveEncounter ? <Dices size={24} /> : <MessageSquare size={24} />}
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white animate-bounce">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </button>

      {/* --- MODAL DRAWER --- */}
      {/* Changed: Z-index 100 to ensure it is always on top */}
      {isOpen && (
        <div className="fixed inset-0 flex justify-end z-[100] backdrop-blur-sm animate-in fade-in duration-200">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsOpen(false)}
            aria-label="Close encounter chat drawer"
          />
          <div className="relative bg-stone-100 w-full max-w-sm h-full shadow-2xl flex flex-col border-l border-stone-300 transform transition-transform animate-in slide-in-from-right duration-300">

            {/* Header */}
            <div className="p-3 bg-stone-800 text-white shadow-md flex-shrink-0">
              <div className="flex justify-between items-center mb-3">

                {myParties.length > 1 && !forcedPartyId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <button className="flex items-center gap-2 font-bold font-serif text-lg hover:text-stone-300 transition-colors">
                        {currentPartyName || 'Select Party'} <ChevronDown size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48 bg-stone-700 text-white border-stone-600 z-[110]">
                      {myParties.map(p => (
                        <DropdownMenuItem key={p.id} onSelect={() => setSelectedPartyId(p.id)} className="hover:bg-stone-600 focus:bg-stone-600 cursor-pointer">
                          {p.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <h2 className="text-lg font-bold font-serif tracking-wide truncate pr-4">{currentPartyName || 'Party View'}</h2>
                )}

                <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-white"><X size={24} /></button>
              </div>

              {/* Tabs */}
              <div className="flex bg-stone-900/50 rounded p-1 gap-1">
                <button
                  onClick={() => setActiveTab('combat')}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${activeTab === 'combat' ? 'bg-stone-600 text-white shadow' : 'text-stone-400 hover:text-stone-200'}`}
                >
                  Combat {isInActiveEncounter && <span className="ml-1 text-red-400">●</span>}
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all relative ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow' : 'text-stone-400 hover:text-stone-200'}`}
                >
                  Chat
                  {unreadCount > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>}
                </button>
              </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-grow overflow-hidden flex flex-col relative bg-[#f5f5f0]">

              {/* --- TAB 1: COMBAT --- */}
              {activeTab === 'combat' && (
                <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-[#f5f5f0]">
                  {isLoadingEncounter && !activeEncounter ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-stone-500" /></div>
                  ) : activeEncounter ? (
                    <div className="space-y-4">
                      <div className="bg-white p-3 rounded shadow-sm border border-stone-200">
                        <h3 className="font-bold text-lg text-stone-800">{activeEncounter.name}</h3>
                        <p className="text-xs text-stone-500">{activeEncounter.description}</p>
                        <div className="mt-2 text-xs font-bold text-stone-400 uppercase tracking-widest text-right">Round {activeEncounter.current_round}</div>
                      </div>

                      <div className="space-y-2 pb-20">
                        {sortedCombatants.length > 0 ? (
                          sortedCombatants.map(c => <CombatantCard key={c.id} combatant={c} />)
                        ) : <p className="text-sm text-stone-500 italic text-center py-4">No combatants.</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-stone-400">
                      <ShieldAlert className="w-12 h-12 mb-2 opacity-20" />
                      <p className="italic">No active combat.</p>
                    </div>
                  )}
                </div>
              )}

              {/* --- TAB 2: CHAT --- */}
              {activeTab === 'chat' && selectedPartyId && (
                <div className="h-full flex flex-col">
                  <PartyChat partyId={selectedPartyId} members={currentPartyMembers} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
