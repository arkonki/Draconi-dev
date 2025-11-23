import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Character } from '../../types/character';
import { Shield, Heart, Zap, Sword, UserX, Users, FileText, Skull } from 'lucide-react';
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

// --- SUB-COMPONENT: MEMBER CARD ---

const MemberCard = ({ 
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
  
  // Calculate Stats percentages for visual bars (clamped 0-100)
  const hpPercent = Math.min(100, Math.max(0, (member.current_hp / member.attributes.CON) * 100));
  const wpPercent = Math.min(100, Math.max(0, (member.current_wp / member.attributes.WIL) * 100));
  
  // Get active conditions
  const activeConditions = Object.entries(member.conditions).filter(([_, active]) => active);
  
  // Initials for avatar
  const initials = member.name.slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full group">
      
      {/* Header */}
      <div className="p-5 border-b border-gray-50 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg border-2 border-white shadow-sm">
            {initials}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg leading-tight">{member.name}</h3>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {member.kin} {member.profession}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon_sm" onClick={() => onView(member.id)} title="View Character Sheet">
          <FileText className="w-5 h-5 text-gray-400 hover:text-indigo-600" />
        </Button>
      </div>

      {/* Stats & Info */}
      <div className="p-5 space-y-5 flex-grow">
        
        {/* Health & Willpower Bars */}
        <div className="space-y-3">
          {/* HP */}
          <div>
             <div className="flex justify-between text-xs font-bold mb-1">
                <span className="flex items-center gap-1 text-gray-600"><Heart className="w-3 h-3 text-red-500 fill-red-500"/> Health</span>
                <span className={member.current_hp === 0 ? 'text-red-600' : 'text-gray-700'}>{member.current_hp} / {member.attributes.CON}</span>
             </div>
             <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
               <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${hpPercent}%` }} />
             </div>
          </div>
          {/* WP */}
          <div>
             <div className="flex justify-between text-xs font-bold mb-1">
                <span className="flex items-center gap-1 text-gray-600"><Zap className="w-3 h-3 text-blue-500 fill-blue-500"/> Willpower</span>
                <span className="text-gray-700">{member.current_wp} / {member.attributes.WIL}</span>
             </div>
             <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${wpPercent}%` }} />
             </div>
          </div>
        </div>

        {/* Conditions */}
        {activeConditions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeConditions.map(([name]) => (
               <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[10px] font-bold uppercase border border-red-100">
                 <Skull size={10} /> {name}
               </span>
            ))}
          </div>
        ) : (
           <div className="text-xs text-gray-400 italic">Healthy and ready.</div>
        )}

        {/* Equipment Snapshot */}
        <div className="pt-4 border-t border-gray-100">
           <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Loadout</h4>
           <div className="space-y-2 text-sm text-gray-700">
              {member.equipment.equipped.armor ? (
                 <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{member.equipment.equipped.armor.name}</span>
                 </div>
              ) : (
                 <div className="flex items-center gap-2 text-gray-400 italic">
                    <Shield className="w-4 h-4 opacity-50" /> <span>No Armor</span>
                 </div>
              )}
              
              {member.equipment.equipped.weapons.length > 0 ? (
                 member.equipment.equipped.weapons.slice(0, 2).map((w, i) => (
                   <div key={i} className="flex items-center gap-2">
                      <Sword className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{w.name}</span>
                   </div>
                 ))
              ) : (
                 <div className="flex items-center gap-2 text-gray-400 italic">
                    <Sword className="w-4 h-4 opacity-50" /> <span>Unarmed</span>
                 </div>
              )}
           </div>
        </div>
      </div>

      {/* Actions (DM Only) */}
      {isDM && (
        <div className="p-3 bg-gray-50 border-t border-gray-100 mt-auto">
          <Button 
            variant="ghost" 
            className="w-full text-gray-500 hover:text-red-600 hover:bg-red-50 justify-center" 
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
};

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
      queryClient.invalidateQueries({ queryKey: ['party', party.id] });
      onUpdate();
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member. Please try again.');
    }
  };

  const isPartyCreator = isDM && currentUserId === party.created_by;

  // Only the creator can remove members, standard DMs might just view
  const canManageMembers = isPartyCreator;

  if (party.members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
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
    <div>
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
    </div>
  );
}
