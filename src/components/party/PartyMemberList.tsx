import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Character } from '../../types/character';
import { Shield, Heart, Zap, Sword, UserX, Trash2 } from 'lucide-react'; // Added UserX
import { Button } from '../shared/Button';
import { removePartyMember } from '../../lib/api/parties'; // Import the remove function
import { useQueryClient } from '@tanstack/react-query'; // To invalidate queries

interface PartyMemberListProps {
  party: {
    id: string;
    created_by: string; // ID of the user who created the party
    members: Character[];
  };
  isDM: boolean; // Is the current user a DM?
  currentUserId?: string; // ID of the currently logged-in user
  onUpdate: () => void; // Function to call after an update (like member removal)
}

export function PartyMemberList({ party, isDM, currentUserId, onUpdate }: PartyMemberListProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient(); // Get query client

  const handleRemoveMember = async (characterId: string, characterName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${characterName} from the party?`)) {
      return;
    }
    try {
      await removePartyMember(party.id, characterId);
      // Invalidate the party query to refresh the member list
      queryClient.invalidateQueries({ queryKey: ['party', party.id] });
      onUpdate(); // Call the passed-in update function if needed elsewhere
    } catch (error) {
      console.error('Failed to remove member:', error);
      // TODO: Show an error message to the user
      alert(`Failed to remove member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Check if the current user is the creator of this party
  const isPartyCreator = isDM && currentUserId === party.created_by;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {party.members.map((member) => (
        <div
          key={member.id}
          className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow flex flex-col justify-between"
        >
          <div> {/* Content wrapper */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">{member.name}</h3>
                <p className="text-gray-600">
                  {member.kin} {member.profession}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm" // Make button smaller
                onClick={() => navigate(`/character/${member.id}`)}
              >
                View Sheet
              </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm"> {/* Smaller text */}
                <Heart className="w-4 h-4 text-red-500" /> {/* Smaller icon */}
                <span>
                  {member.current_hp}/{member.attributes.CON} HP
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm"> {/* Smaller text */}
                <Zap className="w-4 h-4 text-blue-500" /> {/* Smaller icon */}
                <span>
                  {member.current_wp}/{member.attributes.WIL} WP
                </span>
              </div>
            </div>

            {/* Conditions */}
            {Object.entries(member.conditions).some(([_, value]) => value) && (
              <div className="mb-4">
                <h4 className="text-xs font-medium text-gray-700 mb-1">Conditions:</h4> {/* Smaller heading */}
                <div className="flex flex-wrap gap-1"> {/* Smaller gap */}
                  {Object.entries(member.conditions).map(([condition, active]) =>
                    active && (
                      <span
                        key={condition}
                        className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800" // Smaller padding/text
                      >
                        {condition}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Equipment Overview */}
            <div className="mb-4"> {/* Add margin bottom */}
              <h4 className="text-xs font-medium text-gray-700 mb-1">Equipment:</h4> {/* Smaller heading */}
              <div className="space-y-1">
                {member.equipment.equipped.armor && (
                  <div className="flex items-center gap-1 text-xs"> {/* Smaller gap/text */}
                    <Shield className="w-3 h-3 text-gray-500" /> {/* Smaller icon */}
                    <span>{member.equipment.equipped.armor.name}</span> {/* Access name property */}
                  </div>
                )}
                {member.equipment.equipped.weapons.map((weapon, index) => (
                  <div key={index} className="flex items-center gap-1 text-xs"> {/* Smaller gap/text */}
                    <Sword className="w-3 h-3 text-gray-500" /> {/* Smaller icon */}
                    <span>{weapon.name}</span>
                  </div>
                ))}
                {/* Show message if no significant equipment */}
                 {!member.equipment.equipped.armor && member.equipment.equipped.weapons.length === 0 && (
                    <p className="text-xs text-gray-500 italic">No significant equipment.</p>
                 )}
              </div>
            </div>
          </div> {/* End Content wrapper */}

          {/* Remove Member Button (only for Party Creator DM) */}
          {isPartyCreator && (
            <div className="mt-auto pt-4 border-t border-gray-100"> {/* Position button at bottom */}
              <Button
                variant="danger_outline" // Use a danger style
                size="sm"
                icon={UserX}
                onClick={() => handleRemoveMember(member.id, member.name)}
                className="w-full" // Make button full width within its container
              >
                Remove Member
              </Button>
            </div>
          )}
        </div>
      ))}
       {party.members.length === 0 && (
         <div className="col-span-full text-center py-12">
            <p className="text-gray-600">This party has no members yet.</p>
         </div>
       )}
    </div>
  );
}
