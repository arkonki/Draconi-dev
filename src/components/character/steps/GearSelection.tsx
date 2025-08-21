import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Package, AlertCircle, Info, CheckCircle2, Backpack, Dice4, Spline, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner';
import { ErrorMessage } from '../../../components/shared/ErrorMessage';
import { Button } from '../../../components/shared/Button';
import { GameItem, fetchItems } from '../../../lib/api/items'; // Import fetchItems and GameItem
import { normalizeCurrency, parseCost } from '../../../lib/equipment'; // Import utility

interface EquipmentOption {
  option: number;
  items: string[]; // Names of items
  description: string;
}

interface ProfessionData {
  starting_equipment: string[]; // Array of strings like "Dagger, Torch" or "D6 Silver"
  equipment_description: string[]; // Descriptions for each option
}

export function GearSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [availableOptions, setAvailableOptions] = useState<EquipmentOption[]>([]);
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(false);
  const [showDiceModal, setShowDiceModal] = useState(false);
  const [diceResults, setDiceResults] = useState<{ [key: number]: string }>({});
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [errorOptions, setErrorOptions] = useState('');

  // Fetch all game items for looking up details
  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'], // Use the same key as InventoryModal to share cache
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10,
  });

  // Fetch starting equipment options from Supabase for the selected profession
  useEffect(() => {
    async function fetchEquipmentOptions() {
      if (!character.profession) {
        setErrorOptions('Profession not selected.');
        setLoadingOptions(false);
        return;
      }
      try {
        setLoadingOptions(true);
        setErrorOptions('');
        const { data, error } = await supabase
          .from('professions')
          .select('starting_equipment, equipment_description')
          .eq('name', character.profession)
          .single();

        if (error) throw error;
        if (data) {
          const professionData = data as ProfessionData;
          const options: EquipmentOption[] = (professionData.starting_equipment || []).map(
            (optionString: string, idx: number) => ({
              option: idx + 1,
              items: optionString.split(',').map((item: string) => item.trim()).filter(Boolean), // Ensure no empty strings
              description: (professionData.equipment_description || [])[idx] || ''
            })
          );
          setAvailableOptions(options);
        } else {
          setAvailableOptions([]);
        }
      } catch (err) {
        console.error('Error fetching equipment options:', err);
        setErrorOptions('Failed to load equipment options.');
      } finally {
        setLoadingOptions(false);
      }
    }
    fetchEquipmentOptions();
  }, [character.profession]);

  // Helper to find item details from the fetched list
  const findItemDetails = (itemName: string): GameItem | undefined => {
    // Handle cases like "Dagger or Short Sword" - find details for the first part
    const baseItemName = itemName.split(' or ')[0].trim();
    // Handle cases like "2 Torches" - find details for "Torch"
    const nameWithoutCount = baseItemName.replace(/^\d+\s+/, '');
    return allItems.find(item => item.name === nameWithoutCount);
  };


  const parseDiceNotation = (item: string) => {
    const match = item.match(/^(\d*D\d+)/i);
    if (!match) return null;
    const diceNotation = match[1];
    const parts = diceNotation.toUpperCase().split('D');
    const count = parts[0] === '' ? 1 : parseInt(parts[0]);
    const sides = parseInt(parts[1]);
    const rest = item.slice(diceNotation.length).trim();
    return { count, sides, rest };
  };

  const rollDice = (count: number, sides: number): number => {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  };

  const handleOptionSelect = (option: number) => {
    setSelectedOption(option);
    setEquipmentConfirmed(false); // Reset confirmation when changing selection
  };

  const handleConfirmEquipment = () => {
    if (selectedOption === null) return;

    const selectedGear = availableOptions.find(opt => opt.option === selectedOption);
    if (!selectedGear) return;

    const requiresResolution = selectedGear.items.some(
      item => parseDiceNotation(item) || item.toLowerCase().includes(' or ')
    );

    if (requiresResolution) {
      const initialResults = selectedGear.items.reduce((acc, item, idx) => {
        if (item.toLowerCase().includes(' or ')) {
          const alternatives = item.split(/\s+or\s+/i).map(alt => alt.trim());
          acc[idx] = alternatives[0]; // Default to first option
        } else {
          acc[idx] = ''; // Needs dice roll or is fixed
        }
        return acc;
      }, {} as { [key: number]: string });
      setDiceResults(initialResults);
      setShowDiceModal(true);
    } else {
      // Directly update character if no resolution needed
      const currentMoney = character.equipment?.money || { gold: 0, silver: 0, copper: 0 };
      updateCharacter({
        startingEquipment: { // Store the chosen option index and resolved items
            option: selectedOption,
            items: selectedGear.items
        },
        equipment: { // Populate the actual equipment
          money: currentMoney,
          equipped: character.equipment?.equipped || { weapons: [] },
          inventory: [...selectedGear.items] // Add all items to inventory initially
        }
      });
      setEquipmentConfirmed(true);
    }
  };

  const handleConfirmDice = () => {
    if (selectedOption === null) return;
    const selectedGear = availableOptions.find(opt => opt.option === selectedOption);
    if (!selectedGear) return;

    const currentMoney = character.equipment?.money || { gold: 0, silver: 0, copper: 0 };
    const updatedMoney = { ...currentMoney };
    const finalItems: string[] = [];

    selectedGear.items.forEach((item, idx) => {
      if (item.toLowerCase().includes(' or ')) {
        // Use the selected alternative from the modal state
        const chosenItem = diceResults[idx] || item.split(/\s+or\s+/i)[0].trim(); // Default to first if somehow not set
        finalItems.push(chosenItem);
      } else {
        const diceInfo = parseDiceNotation(item);
        if (diceInfo) {
          // Use entered/rolled result
          const result = diceResults[idx] ? parseInt(diceResults[idx]) : rollDice(diceInfo.count, diceInfo.sides);
          const restText = diceInfo.rest.toLowerCase();
          if (restText.includes('gold')) updatedMoney.gold += result;
          else if (restText.includes('silver')) updatedMoney.silver += result;
          else if (restText.includes('copper')) updatedMoney.copper += result;
          else finalItems.push(`${result} ${diceInfo.rest}`); // Add item with quantity
        } else {
          // Fixed item, just add it
          finalItems.push(item);
        }
      }
    });

    updateCharacter({
      startingEquipment: { // Store the chosen option index and resolved items
        option: selectedOption,
        items: finalItems
      },
      equipment: { // Populate the actual equipment
        money: normalizeCurrency(updatedMoney),
        equipped: character.equipment?.equipped || { weapons: [] },
        inventory: [...finalItems] // Add resolved items to inventory
      }
    });
    setShowDiceModal(false);
    setEquipmentConfirmed(true);
  };

  // Check if all dice/choices in the modal are resolved
  const allDiceModalFilled = selectedOption !== null && availableOptions
    .find(g => g.option === selectedOption)
    ?.items.every((item, idx) => {
      if (item.toLowerCase().includes(' or ')) return !!diceResults[idx];
      if (parseDiceNotation(item)) return !!diceResults[idx];
      return true; // Fixed items don't need input
    });


  if (loadingOptions || isLoadingItems) return <LoadingSpinner />;
  if (errorOptions || errorItems) return <ErrorMessage message={errorOptions || errorItems?.message || 'Failed to load data.'} />;
  if (!character.profession) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please select a profession before choosing equipment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Choose Starting Equipment</h3>
        <p className="text-gray-600">
          Select one of the available equipment packages for your {character.profession}.
        </p>
      </div>

      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Equipment Selection</h4>
          <p className="text-sm text-blue-700">
            Choose carefully – this will be your starting gear. Items with <Dice4 className="inline w-4 h-4 text-amber-600" /> require a dice roll, items with <Spline className="inline w-4 h-4 text-purple-600" /> offer a choice.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableOptions.map((option) => (
          <div
            key={option.option}
            onClick={() => handleOptionSelect(option.option)}
            className={`p-6 border rounded-lg cursor-pointer transition-all ${
              selectedOption === option.option
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-6 h-6 text-gray-500" />
              <div>
                <h4 className="font-semibold">Option {option.option}</h4>
                <p className="text-sm text-gray-600">{option.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              <h5 className="font-medium text-gray-700">Equipment List:</h5>
              <ul className="space-y-1">
                {option.items.map((item, index) => {
                  const hasDice = !!parseDiceNotation(item);
                  const hasChoice = item.toLowerCase().includes(' or ');
                  const itemDetails = findItemDetails(item); // Use updated helper
                  return (
                    <li key={index} className="flex items-center gap-2 text-sm text-gray-600 group relative">
                      {hasDice ? (
                        <Dice4 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : hasChoice ? (
                        <Spline className="w-4 h-4 text-purple-500 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                      <span>{item}</span>
                      {/* Tooltip for item details */}
                      {itemDetails?.effect && (
                         <div className="absolute bottom-full left-0 mb-2 bg-gray-800 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal z-10 max-w-xs">
                           {itemDetails.effect} (W: {itemDetails.weight}, Cost: {itemDetails.cost})
                         </div>
                       )}
                    </li>
                  );
                })}
              </ul>
            </div>
            {selectedOption === option.option && (
              <div className="mt-4 flex items-center gap-2 text-blue-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">Selected</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {!selectedOption && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div><h4 className="font-medium text-amber-800">Equipment Required</h4><p className="text-sm text-amber-700">Please select a starting equipment package.</p></div>
        </div>
      )}

      {/* Confirm Button */}
       <button
         onClick={handleConfirmEquipment}
         disabled={!selectedOption || equipmentConfirmed} // Disable if not selected or already confirmed
         className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
           equipmentConfirmed
             ? 'bg-green-600 text-white cursor-default'
             : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
         }`}
       >
         <Backpack className="w-5 h-5" />
         {equipmentConfirmed ? 'Equipment Confirmed' : 'Confirm Equipment Selection'}
       </button>


      {/* Dice Modal */}
      {showDiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Resolve Dice Rolls & Selections</h3>
               <button onClick={() => setShowDiceModal(false)} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            {(availableOptions.find(gear => gear.option === selectedOption)?.items || []).map((item, index) => {
              if (item.toLowerCase().includes(' or ')) {
                const alternatives = item.split(/\s+or\s+/i).map(alt => alt.trim());
                return (
                  <div key={index} className="mb-4 p-3 border rounded bg-purple-50 border-purple-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{item}</label>
                    <select
                      value={diceResults[index] || ''}
                      onChange={(e) => setDiceResults(prev => ({ ...prev, [index]: e.target.value }))}
                      className="mt-1 w-full border rounded px-2 py-1 text-sm"
                    >
                      <option value="" disabled>Select one...</option>
                      {alternatives.map((alt, i) => <option key={i} value={alt}>{alt}</option>)}
                    </select>
                  </div>
                );
              }
              const diceInfo = parseDiceNotation(item);
              if (!diceInfo) return null; // Skip items without dice/choice
              return (
                <div key={index} className="mb-4 p-3 border rounded bg-amber-50 border-amber-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{item}</span>
                    <Button
                      size="sm" variant="secondary"
                      onClick={() => {
                        const roll = rollDice(diceInfo.count, diceInfo.sides);
                        setDiceResults(prev => ({ ...prev, [index]: roll.toString() }));
                      }}
                    >
                      Roll {diceInfo.count}D{diceInfo.sides}
                    </Button>
                  </div>
                  <input
                    type="number"
                    min={diceInfo.count} // Min possible roll
                    max={diceInfo.count * diceInfo.sides} // Max possible roll
                    value={diceResults[index] || ''}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      // Allow empty input temporarily
                      if (valStr === '') {
                          setDiceResults(prev => ({ ...prev, [index]: '' }));
                      } else {
                          const val = parseInt(valStr);
                          if (!isNaN(val)) {
                              const clampedVal = Math.max(diceInfo.count, Math.min(diceInfo.count * diceInfo.sides, val));
                              setDiceResults(prev => ({ ...prev, [index]: clampedVal.toString() }));
                          }
                      }
                    }}
                    className="mt-1 w-full border rounded px-2 py-1 text-sm"
                    placeholder={`Enter result (${diceInfo.count}-${diceInfo.count * diceInfo.sides})`}
                  />
                </div>
              );
            })}
            <div className="flex justify-end gap-4 mt-6">
              <Button variant="secondary" onClick={() => setShowDiceModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleConfirmDice}
                disabled={!allDiceModalFilled}
              >
                Confirm Rolls/Choices
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
