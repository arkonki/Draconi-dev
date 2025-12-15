import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Character } from '../../types/character';
import { Shield, Sword, AlertCircle, X, Dices } from 'lucide-react';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Button } from '../shared/Button';
import { useDice } from '../dice/DiceContext'; // Import Dice Context

interface EquipmentModalProps {
  character: Character;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export function EquipmentModal({ character, onClose, onUpdate }: EquipmentModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { rollDice } = useDice(); // Hook to trigger dice rolls

  // Fetch all game items once for details lookup
  const { data: allItems = [], isLoading, error: fetchError } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10,
  });

  const findItemDetails = (itemName: string | undefined): GameItem | undefined => {
    if (!itemName) return undefined;
    return allItems.find(item => item.name === itemName);
  };

  // Helper to map weapon names to Dragonbane skills
  const getWeaponSkill = (itemName: string): string => {
    const name = itemName.toLowerCase();
    if (name.includes('axe')) return 'Axes';
    if (name.includes('bow') && !name.includes('cross')) return 'Bows';
    if (name.includes('crossbow')) return 'Crossbows';
    if (name.includes('hammer') || name.includes('club') || name.includes('mace')) return 'Hammers';
    if (name.includes('knife') || name.includes('dagger')) return 'Knives';
    if (name.includes('spear') || name.includes('trident') || name.includes('lance')) return 'Spears';
    if (name.includes('staff')) return 'Staves';
    if (name.includes('sword') || name.includes('scimitar')) return 'Swords';
    if (name.includes('sling')) return 'Slings';
    return 'Brawling'; // Fallback
  };

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
      const newEquipment = JSON.parse(JSON.stringify(character.equipment));
      const equipped = newEquipment.equipped;
      let itemNameToAddBack: string | null = null;

      if (type === 'weapon' && typeof weaponIndex === 'number' && equipped.weapons?.[weaponIndex]) {
        itemNameToAddBack = equipped.weapons[weaponIndex].name;
        equipped.weapons.splice(weaponIndex, 1);
      } else if (type === 'armor' && equipped.armor) {
        itemNameToAddBack = equipped.armor;
        delete equipped.armor;
      } else if (type === 'helmet' && equipped.helmet) {
        itemNameToAddBack = equipped.helmet;
        delete equipped.helmet;
      }

      if (itemNameToAddBack) {
        if (!newEquipment.inventory) {
          newEquipment.inventory = [];
        }
        newEquipment.inventory.push(itemNameToAddBack);
      } else {
        return;
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
      if (armorData?.armor_rating) rating += Number(armorData.armor_rating);
    }
    if (equipped.helmet) {
      const helmetData = findItemDetails(equipped.helmet);
      if (helmetData?.armor_rating) rating += Number(helmetData.armor_rating);
    }
    return rating;
  };

  const getBaneEffects = (itemName: string | undefined) => {
    const item = findItemDetails(itemName);
    if (!item?.effect) return null;
    const baneMatch = item.effect.match(/Bane on ([^.]+)/i);
    return baneMatch ? baneMatch[1] : null;
  };

  const handleAttackClick = (weaponName: string, damageFormula: string | undefined) => {
    const skillName = getWeaponSkill(weaponName);
    // Try to find the skill level in the character's skill list
    // Handles case sensitivity if DB stores them differently
    const skillLevel = character.skill_levels?.[skillName] 
      || character.skill_levels?.[skillName.toUpperCase()] 
      || character.skill_levels?.[Object.keys(character.skill_levels).find(k => k.toLowerCase() === skillName.toLowerCase()) || ''] 
      || 0;

    rollDice({
      label: `Attack: ${weaponName}`,
      skillName: skillName,
      target: skillLevel,
      damageFormula: damageFormula || '1d6', // Fallback damage
      type: 'attack'
    });
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
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-6 border-b flex-shrink-0 bg-stone-50 rounded-t-lg">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-serif font-bold text-stone-800">Equipped Gear</h2>
            <button onClick={onClose} className="text-stone-500 hover:text-red-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-stone-50">
          {error && <div className="mb-4"><ErrorMessage message={error} /></div>}
          {updateCharacterMutation.isPending && <div className="flex justify-center mb-4"><LoadingSpinner size="sm"/></div>}

          {/* Armor Section */}
          <div className="mb-8">
            <h3 className="text-lg font-bold font-serif mb-4 flex items-center gap-2 text-stone-700 border-b border-stone-200 pb-2">
              <Shield className="w-5 h-5 text-blue-700" />
              Armor Rating: <span className="text-blue-700">{calculateArmorRating()}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Body Armor */}
              <div className="p-4 border border-stone-200 rounded-lg bg-white shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-stone-600 text-xs uppercase tracking-wider">Body Armor</h4>
                    {character.equipment.equipped.armor ? (
                      <>
                        <p className="text-lg font-bold text-stone-800">{character.equipment.equipped.armor}</p>
                        {getBaneEffects(character.equipment.equipped.armor) && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Bane: {getBaneEffects(character.equipment.equipped.armor)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-stone-400 italic mt-1">None equipped</p>
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
              <div className="p-4 border border-stone-200 rounded-lg bg-white shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-stone-600 text-xs uppercase tracking-wider">Helmet</h4>
                    {character.equipment.equipped.helmet ? (
                      <>
                        <p className="text-lg font-bold text-stone-800">{character.equipment.equipped.helmet}</p>
                        {getBaneEffects(character.equipment.equipped.helmet) && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Bane: {getBaneEffects(character.equipment.equipped.helmet)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-stone-400 italic mt-1">None equipped</p>
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
            <h3 className="text-lg font-bold font-serif mb-4 flex items-center gap-2 text-stone-700 border-b border-stone-200 pb-2">
              <Sword className="w-5 h-5 text-red-700" />
              Weapons at Hand
            </h3>

            <div className="overflow-x-auto rounded-lg border border-stone-200 shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-stone-100 text-stone-600 font-serif">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-bold">Weapon</th>
                    <th className="px-4 py-3 font-bold">Grip</th>
                    <th className="px-4 py-3 font-bold">Range</th>
                    <th className="px-4 py-3 font-bold">Damage</th>
                    <th className="px-4 py-3 font-bold">Durability</th>
                    <th className="px-4 py-3 font-bold">Features</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {(character.equipment.equipped.weapons || []).map((weapon, index) => {
                     const weaponDetails = findItemDetails(weapon.name);
                     const damage = weaponDetails?.damage || weapon.damage || 'N/A';
                     return (
                       <tr key={index} className="hover:bg-stone-50 transition-colors">
                         <td className="px-4 py-3 font-bold text-stone-800">{weapon.name}</td>
                         <td className="px-4 py-3 text-stone-600">{weaponDetails?.grip || weapon.grip || '-'}</td>
                         <td className="px-4 py-3 text-stone-600">{weaponDetails?.range || weapon.range || '-'}</td>
                         <td className="px-4 py-3 font-bold text-red-700">{damage}</td>
                         <td className="px-4 py-3 text-stone-600">{weaponDetails?.durability || weapon.durability || '-'}</td>
                         <td className="px-4 py-3">
                           <div className="flex flex-wrap gap-1">
                             {(weaponDetails?.features || weapon.features || []).map((feature, i) => (
                               <span key={i} className="px-2 py-0.5 text-[10px] uppercase font-bold bg-stone-100 text-stone-600 rounded border border-stone-200">
                                 {feature}
                               </span>
                             ))}
                           </div>
                         </td>
                         <td className="px-4 py-3">
                           <div className="flex items-center justify-end gap-2">
                             {/* Attack Button - Text description as requested */}
                             <Button
                               variant="primary"
                               size="sm"
                               onClick={() => handleAttackClick(weapon.name, damage)}
                               className="flex items-center gap-2 px-3 bg-red-700 hover:bg-red-800 border-red-900"
                             >
                               <Dices size={16} />
                               <span>Attack</span>
                             </Button>

                             <Button
                               variant="secondary" 
                               size="sm"
                               onClick={() => handleUnequipItem('weapon', index)}
                               disabled={updateCharacterMutation.isPending}
                               className="text-stone-500 hover:text-red-600 border-stone-300 hover:border-red-300"
                             >
                               Unequip
                             </Button>
                           </div>
                         </td>
                       </tr>
                     );
                  })}
                  {(character.equipment.equipped.weapons || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-stone-400 italic bg-stone-50">
                        No weapons equipped
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div> 
         <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end flex-shrink-0 rounded-b-lg">
             <Button variant="secondary" onClick={onClose}>Close</Button>
         </div>
      </div> 
    </div> 
  );
}