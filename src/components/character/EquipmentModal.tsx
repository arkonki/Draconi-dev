import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Character } from '../../types/character';
import { Shield, Sword, AlertCircle, X } from 'lucide-react';
// Removed incorrect import: import { findEquipment } from '../../data/equipment';
import { GameItem, fetchItems } from '../../lib/api/items'; // Import API functions and type
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button'; // Import Button if needed for unequip

interface EquipmentModalProps {
  character: Character;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export function EquipmentModal({ character, onClose, onUpdate }: EquipmentModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Fetch all game items once for details lookup
  const { data: allItems = [], isLoading, error: fetchError } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'], // Use the same key to leverage cache
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Helper to find item details from the fetched list
  const findItemDetails = (itemName: string | undefined): GameItem | undefined => {
    if (!itemName) return undefined;
    return allItems.find(item => item.name === itemName);
  };

  // Mutation for updating character equipment
  const updateCharacterMutation = useMutation({
    mutationFn: async (newEquipment: Character['equipment']) => {
      const { error: updateError } = await supabase
        .from('characters')
        .update({ equipment: newEquipment })
        .eq('id', character.id);
      if (updateError) throw updateError;
      return newEquipment;
    },
    onSuccess: (newEquipment) => {
      onUpdate({ ...character, equipment: newEquipment });
      queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update equipment');
    }
  });


  const handleUnequipItem = async (type: 'armor' | 'helmet' | 'weapon', weaponIndex?: number) => {
    try {
      setError(null);
      const newEquipment = JSON.parse(JSON.stringify(character.equipment)); // Deep copy
      const equipped = newEquipment.equipped;
      let itemNameToAddBack: string | null = null;

      if (type === 'weapon' && typeof weaponIndex === 'number' && equipped.weapons?.[weaponIndex]) {
        itemNameToAddBack = equipped.weapons[weaponIndex].name;
        equipped.weapons.splice(weaponIndex, 1);
      } else if (type === 'armor' && equipped.armor) {
        itemNameToAddBack = equipped.armor;
        delete equipped.armor; // Use delete for optional properties
      } else if (type === 'helmet' && equipped.helmet) {
        itemNameToAddBack = equipped.helmet;
        delete equipped.helmet; // Use delete for optional properties
      }

      // Add the unequipped item back to inventory if found
      if (itemNameToAddBack) {
        if (!newEquipment.inventory) {
          newEquipment.inventory = [];
        }
        newEquipment.inventory.push(itemNameToAddBack);
      } else {
        console.warn(`Attempted to unequip non-existent item: ${type} at index ${weaponIndex}`);
        return; // Don't proceed if item wasn't actually equipped
      }

      updateCharacterMutation.mutate(newEquipment);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unequip item');
    }
  };

  const calculateArmorRating = () => {
    let rating = 0;
    const equipped = character.equipment.equipped;

    if (equipped.armor) {
      const armorData = findItemDetails(equipped.armor);
      if (armorData?.armor_rating) {
        rating += Number(armorData.armor_rating);
      }
    }

    if (equipped.helmet) {
      const helmetData = findItemDetails(equipped.helmet);
      if (helmetData?.armor_rating) {
        rating += Number(helmetData.armor_rating);
      }
    }

    return rating;
  };

  const getBaneEffects = (itemName: string | undefined) => {
    const item = findItemDetails(itemName);
    if (!item?.effect) return null;
    const baneMatch = item.effect.match(/Bane on ([^.]+)/i); // Case-insensitive
    return baneMatch ? baneMatch[1] : null;
  };

  if (isLoading) {
    return (
       <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
         <div className="bg-white rounded-lg p-6"><LoadingSpinner /></div>
       </div>
    );
  }

  if (fetchError) {
     return (
       <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
         <div className="bg-white rounded-lg p-6"><ErrorMessage message={`Failed to load item data: ${fetchError.message}`} /></div>
       </div>
     );
  }


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Equipped Items</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && <div className="mb-4"><ErrorMessage message={error} /></div>}
          {updateCharacterMutation.isPending && <div className="flex justify-center"><LoadingSpinner size="sm"/></div>}

          {/* Armor Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Armor (Total Rating: {calculateArmorRating()})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Body Armor */}
              <div className="p-4 border rounded-lg bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium text-gray-700">Body Armor</h4>
                    {character.equipment.equipped.armor ? (
                      <>
                        <p className="text-lg font-bold text-gray-900">{character.equipment.equipped.armor}</p>
                        {getBaneEffects(character.equipment.equipped.armor) && (
                          <p className="text-sm text-red-600 mt-1">
                            Bane on: {getBaneEffects(character.equipment.equipped.armor)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-500 italic">None equipped</p>
                    )}
                  </div>
                  {character.equipment.equipped.armor && (
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => handleUnequipItem('armor')}
                      disabled={updateCharacterMutation.isPending}
                    >
                      Unequip
                    </Button>
                  )}
                </div>
              </div>

              {/* Helmet */}
              <div className="p-4 border rounded-lg bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium text-gray-700">Helmet</h4>
                    {character.equipment.equipped.helmet ? (
                      <>
                        <p className="text-lg font-bold text-gray-900">{character.equipment.equipped.helmet}</p>
                        {getBaneEffects(character.equipment.equipped.helmet) && (
                          <p className="text-sm text-red-600 mt-1">
                            Bane on: {getBaneEffects(character.equipment.equipped.helmet)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-500 italic">None equipped</p>
                    )}
                  </div>
                  {character.equipment.equipped.helmet && (
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => handleUnequipItem('helmet')}
                      disabled={updateCharacterMutation.isPending}
                    >
                      Unequip
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Weapons Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sword className="w-5 h-5 text-blue-600" />
              Weapons
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Weapon</th>
                    <th className="px-3 py-2">Grip</th>
                    <th className="px-3 py-2">Range</th>
                    <th className="px-3 py-2">Damage</th>
                    <th className="px-3 py-2">Durability</th>
                    <th className="px-3 py-2">Features</th>
                    <th className="px-3 py-2"></th> {/* Actions column */}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(character.equipment.equipped.weapons || []).map((weapon, index) => {
                     const weaponDetails = findItemDetails(weapon.name);
                     return (
                       <tr key={index} className="hover:bg-gray-50">
                         <td className="px-3 py-2 font-medium">{weapon.name}</td>
                         <td className="px-3 py-2">{weaponDetails?.grip || weapon.grip || 'N/A'}</td>
                         <td className="px-3 py-2">{weaponDetails?.range || weapon.range || 'N/A'}</td>
                         <td className="px-3 py-2">{weaponDetails?.damage || weapon.damage || 'N/A'}</td>
                         <td className="px-3 py-2">{weaponDetails?.durability || weapon.durability || 'N/A'}</td>
                         <td className="px-3 py-2">
                           <div className="flex flex-wrap gap-1">
                             {(weaponDetails?.features || weapon.features || []).map((feature, i) => (
                               <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                                 {feature}
                               </span>
                             ))}
                           </div>
                         </td>
                         <td className="px-3 py-2">
                           <Button
                             variant="secondary" size="sm"
                             onClick={() => handleUnequipItem('weapon', index)}
                             disabled={updateCharacterMutation.isPending}
                           >
                             Unequip
                           </Button>
                         </td>
                       </tr>
                     );
                  })}
                  {(character.equipment.equipped.weapons || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-gray-500 italic">
                        No weapons equipped
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div> {/* End Scrollable Content Area */}
         <div className="p-4 border-t flex justify-end flex-shrink-0">
             <Button variant="primary" onClick={onClose}>Close</Button>
         </div>
      </div> {/* End Modal Container */}
    </div> // End Fixed Overlay
  );
}
