import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Character } from '../../types/character';
import { Shield, Heart, Zap, Sword, UserX, Users, FileText, Skull, ExternalLink } from 'lucide-react';
import { Button } from '../shared/Button';
import { removePartyMember } from '../../lib/api/parties';
import { useQueryClient } from '@tanstack/react-query';

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

// --- HELPER COMPONENT: STAT BAR ---

const StatBar = ({ 
  label, 
  icon: Icon, 
  current, 
  max, 
  colorClass, 
  fillClass 
}: { 
  label: string, 
  icon: any, 
  current: number, 
  max: number, 
  colorClass: string, 
  fillClass: string 
}) => {
  const percent = Math.min(100, Math.max(0, (current / max) * 100));

  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="flex items-center gap-1 text-gray-600">
            <Icon className={`w-3 h-3 ${colorClass}`} /> {label}
        </span>
        <span className={current === 0 ? 'text-red-600' : 'text-gray-700'}>
          {current} / {max}
        </span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div 
            className={`h-full ${fillClass} transition-all duration-500`} 
            style={{ width: `${percent}%` }} 
        />
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: MEMBER CARD ---

const MemberCard = React.memo(({ 
  member, 
  isDM, 
  onRemove, 
  onView 
}: { 
  member: Character, 
  isDM: boolean, 
  onRemove: (id: string, name: string) => void,
  onView: (id: string) => void
}) => {
  
  // Get active conditions
  const activeConditions = useMemo(() => 
    Object.entries(member.conditions || {}).filter(([_, active]) => active), 
  [member.conditions]);
  
  // Initials for avatar fallback
  const initials = member.name.slice(0, 2).toUpperCase();

  // --- DATA EXTRACTION HELPERS ---

  const getArmorName = () => {
    const armor = member.equipment?.equipped?.armor;
    if (!armor) return null;
    if (typeof armor === 'string') return armor;
    return armor.name || null;
  };

  const armorName = getArmorName();
  const weapons = member.equipment?.equipped?.weapons || [];

  // Avatar Component
  const Avatar = () => {
    if (member.portrait_url) {
        return (
            <img 
                src={member.portrait_url} 
                alt={member.name} 
                className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md bg-gray-100"
            />
        );
    }
    return (
        <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl border-2 border-white shadow-md shrink-0">
            {initials}
        </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full">
      
      {/* Header */}
      <div className="p-5 border-b border-gray-50 flex items-start gap-4 bg-gray-50/30">
        
        {/* Avatar - Clickable */}
        <button 
          onClick={() => onView(member.id)} 
          className="shrink-0 hover:opacity-90 transition-opacity focus:outline-none"
          title="Open Character Sheet"
        >
          <Avatar />
        </button>

        {/* Text Info - Clickable Name */}
        <div className="flex-1 min-w-0 pt-1">
          <button 
            onClick={() => onView(member.id)} 
            className="group text-left w-full focus:outline-none"
          >
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
            />
            <StatBar 
                label="Willpower" 
                icon={Zap} 
                current={member.current_wp} 
                max={member.attributes.WIL} 
                colorClass="text-blue-500 fill-blue-500" 
                fillClass="bg-blue-500" 
            />
        </div>

        {/* Conditions */}
        <div className="min-h-[24px]">
            {activeConditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
                {activeConditions.map(([name]) => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[10px] font-bold uppercase border border-red-100">
                    <Skull size={10} /> {name}
                </span>
                ))}
            </div>
            ) : (
            <div className="text-xs text-gray-400 italic flex items-center gap-1">
                <Shield size={10} /> Healthy and ready.
            </div>
            )}
        </div>

        {/* Equipment Snapshot */}
        <div className="pt-4 border-t border-gray-100">
           <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Loadout</h4>
           <div className="space-y-2 text-sm text-gray-700">
              {/* Armor */}
              <div className={`flex items-center gap-2 ${!armorName ? 'text-gray-400 italic' : ''}`}>
                 <Shield className="w-4 h-4 shrink-0 opacity-70" />
                 <span className="truncate">{armorName || "No Armor"}</span>
              </div>
              
              {/* Weapons */}
              <div className={`flex items-center gap-2 ${weapons.length === 0 ? 'text-gray-400 italic' : ''}`}>
                 <Sword className="w-4 h-4 shrink-0 opacity-70" />
                 <div className="truncate">
                    {weapons.length > 0 
                        ? weapons.slice(0, 2).map((w: any) => w.name).join(", ") 
                        : "Unarmed"}
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Actions (DM Only) */}
      {isDM && (
        <div className="p-3 bg-gray-50 border-t border-gray-100 mt-auto">
          <Button 
            variant="ghost" 
            className="w-full text-gray-500 hover:text-red-600 hover:bg-red-50 justify-center transition-colors" 
            size="sm"
            icon={UserX}
            onClick={() => onRemove(member.id, member.name)}
          >
            Remove from Party
          </Button>
        </div>
      )}
    </div>
  );
});

// --- MAIN COMPONENT ---

export function PartyMemberList({ party, isDM, currentUserId, onUpdate }: PartyMemberListProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRemoveMember = async (characterId: string, characterName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${characterName} from the party?`)) {
      return;
    }
    try {
      await removePartyMember(party.id, characterId);
      // Invalidate both specific party and list queries
      queryClient.invalidateQueries({ queryKey: ['party', party.id] });
      onUpdate();
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member. Please try again.');
    }
  };

  const isPartyCreator = isDM && currentUserId === party.created_by;
  const canManageMembers = isPartyCreator;

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
            isDM={canManageMembers} 
            onRemove={handleRemoveMember}
            onView={(id) => navigate(`/character/${id}`)}
        />
        ))}
    </div>
  );
}
