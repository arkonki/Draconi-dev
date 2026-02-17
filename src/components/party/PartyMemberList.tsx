import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Character, WeaponEntry } from '../../types/character';
import { Shield, Heart, Zap, Sword, UserX, Users, ExternalLink, Skull, Minus, Plus } from 'lucide-react';
import { Button } from '../shared/Button';
import { removePartyMember } from '../../lib/api/parties';
import { updateCharacter } from '../../lib/api/characters';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// --- TYPES ---

interface PartyMemberListProps {
  party: {
    id: string;
    created_by: string;
    members: Character[];
  };
  isDM: boolean;
  currentUserId?: string;
  onUpdate: () => void;
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
  isDM
}: { 
  label: string, 
  icon: React.ComponentType<{ className?: string }>, 
  current: number, 
  max: number, 
  colorClass: string, 
  fillClass: string,
  onAdjust?: (amount: number) => void,
  isDM?: boolean
}) => {
  // Calculate percentage, clamped between 0 and 100
  const percent = Math.min(100, Math.max(0, (current / max) * 100));

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
                className="w-6 h-5 flex items-center justify-center hover:bg-gray-200 hover:text-red-600 active:bg-gray-300 transition-colors"
                title="Decrease"
              >
                <Minus size={12} strokeWidth={3} />
              </button>
              <div className="w-px h-3 bg-gray-300"></div>
              <button 
                onClick={(e) => { e.stopPropagation(); onAdjust(1); }}
                className="w-6 h-5 flex items-center justify-center hover:bg-gray-200 hover:text-green-600 active:bg-gray-300 transition-colors"
                title="Increase"
              >
                <Plus size={12} strokeWidth={3} />
              </button>
            </div>
          )}
          
          <span className={`${current === 0 ? 'text-red-600 animate-pulse' : 'text-gray-700'} transition-colors duration-300`}>
            {current} / {max}
          </span>
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
  onAdjustWP
}: { 
  member: Character, 
  isDM: boolean, 
  onRemove: (id: string, name: string) => void,
  onView: (id: string) => void,
  onAdjustHP: (amount: number) => void,
  onAdjustWP: (amount: number) => void
}) => {
  
  const activeConditions = useMemo(() => 
    Object.entries(member.conditions || {}).filter(([, active]) => active), 
  [member.conditions]);
  
  const initials = member.name.slice(0, 2).toUpperCase();

  const getArmorName = () => {
    const armor = member.equipment?.equipped?.armor as unknown;
    if (!armor) return null;
    if (typeof armor === 'string') return armor;
    if (typeof armor === 'object' && 'name' in armor && typeof armor.name === 'string') return armor.name;
    return null;
  };

  const armorName = getArmorName();
  const weapons: WeaponEntry[] = member.equipment?.equipped?.weapons || [];

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
          <button onClick={() => onView(member.id)} className="group text-left w-full focus:outline-none">
            <h3 className="font-bold text-gray-900 text-lg leading-tight break-words group-hover:text-indigo-700 transition-colors flex items-center gap-2">
              {member.name}
              <ExternalLink size={14} className="text-gray-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-all" />
            </h3>
            <div className="h-0.5 w-0 bg-indigo-500 group-hover:w-full transition-all duration-300 mt-0.5 opacity-50"></div>
          </button>
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
                max={member.attributes.CON} 
                colorClass="text-red-500 fill-red-500" 
                fillClass="bg-red-500" 
                isDM={isDM}
                onAdjust={onAdjustHP}
            />
            <StatBar 
                label="Willpower" 
                icon={Zap} 
                current={member.current_wp} 
                max={member.attributes.WIL} 
                colorClass="text-blue-500 fill-blue-500" 
                fillClass="bg-blue-500" 
                isDM={isDM}
                onAdjust={onAdjustWP}
            />
        </div>

        {/* Conditions Badge List */}
        <div className="min-h-[24px]">
            {activeConditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
                {activeConditions.map(([name]) => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[10px] font-bold uppercase border border-red-100 animate-in fade-in">
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
           <div className="space-y-2 text-sm text-gray-700">
              <div className={`flex items-center gap-2 ${!armorName ? 'text-gray-400 italic' : ''}`}>
                 <Shield className="w-4 h-4 shrink-0 opacity-70" />
                 <span className="truncate">{armorName || "No Armor"}</span>
              </div>
              <div className={`flex items-center gap-2 ${weapons.length === 0 ? 'text-gray-400 italic' : ''}`}>
                 <Sword className="w-4 h-4 shrink-0 opacity-70" />
                 <div className="truncate">
                    {weapons.length > 0 ? weapons.slice(0, 2).map((w) => w.name).join(", ") : "Unarmed"}
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* GM Actions */}
      {isDM && (
        <div className="p-3 bg-gray-50 border-t border-gray-100 mt-auto">
          <Button variant="ghost" className="w-full text-gray-500 hover:text-red-600 hover:bg-red-50 justify-center transition-colors" size="sm" icon={UserX} onClick={() => onRemove(member.id, member.name)}>
            Remove from Party
          </Button>
        </div>
      )}
    </div>
  );
});

// --- MAIN COMPONENT: PARTY LIST ---

export function PartyMemberList({ party, isDM, currentUserId, onUpdate }: PartyMemberListProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  void currentUserId;

  // --- 1. REAL-TIME SUBSCRIPTION ---
  // This is the core logic. It listens for ANY changes to characters in this party.
  useEffect(() => {
    const channel = supabase
      .channel(`party-view-${party.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          // When Supabase says "Data changed!", we tell React Query to fetch the fresh data.
          // This causes the UI to re-render automatically with new HP/WP/Conditions.
          console.log('Realtime update received:', payload);
          queryClient.invalidateQueries({ queryKey: ['party', party.id] });
          
          // Optionally trigger the parent's update handler if it does broader logic
          if (onUpdate) onUpdate(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [party.id, queryClient, onUpdate]);

  // --- 2. STAT ADJUSTMENT ---
  const handleStatAdjust = async (charId: string, stat: 'current_hp' | 'current_wp', amount: number, currentVal: number, maxVal: number) => {
    // 1. Calculate new value
    const newVal = Math.min(maxVal, Math.max(0, currentVal + amount));
    if (newVal === currentVal) return;

    // 2. Optimistic Update? 
    // We could update local state immediately, but since we have Real-Time enabled,
    // we can just send the request. The UI will update when the server confirms (via subscription).
    // This ensures everyone sees the "Truth".
    try {
      await updateCharacter(charId, { [stat]: newVal });
    } catch (e) {
      console.error("Failed to update stat", e);
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
            onView={(id) => navigate(`/character/${id}`)}
            onAdjustHP={(amount) => handleStatAdjust(member.id, 'current_hp', amount, member.current_hp, member.attributes.CON)}
            onAdjustWP={(amount) => handleStatAdjust(member.id, 'current_wp', amount, member.current_wp, member.attributes.WIL)}
        />
        ))}
    </div>
  );
}
