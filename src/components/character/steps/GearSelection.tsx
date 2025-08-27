import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Package, AlertCircle, Info, CheckCircle2, Backpack, Dice4, Spline, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner';
import { ErrorMessage } from '../../../components/shared/ErrorMessage';
import { Button } from '../../../components/shared/Button';
import { GameItem, fetchItems } from '../../../lib/api/items';
import { normalizeCurrency } from '../../../lib/equipment';

interface EquipmentOption {
  option: number;
  items: string[];
  description: string;
}

interface ProfessionData {
  starting_equipment: string[];
  equipment_description: string[];
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

  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10,
  });

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
              items: optionString.split(',').map((item: string) => item.trim()).filter(Boolean),
              description: (professionData.equipment_description || [])[idx] || ''
            })
          );
          setAvailableOptions(options);
        }
      } catch (err) {
        setErrorOptions('Failed to load equipment options.');
      } finally {
        setLoadingOptions(false);
      }
    }
    fetchEquipmentOptions();
  }, [character.profession]);

  const findItemDetails = (itemName: string): GameItem | undefined => {
    const baseItemName = itemName.split(' or ')[0].trim();
    const nameWithoutCount = baseItemName.replace(/^\d+\s+/, '');
    return allItems.find(item => item.name.toLowerCase() === nameWithoutCount.toLowerCase());
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
    setEquipmentConfirmed(false);
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
          acc[idx] = item.split(/\s+or\s+/i)[0].trim();
        } else {
          acc[idx] = '';
        }
        return acc;
      }, {} as { [key: number]: string });
      setDiceResults(initialResults);
      setShowDiceModal(true);
    } else {
      updateCharacter({
        startingEquipment: { option: selectedOption, items: selectedGear.items },
        equipment: {
          money: character.equipment?.money || { gold: 0, silver: 0, copper: 0 },
          equipped: character.equipment?.equipped || { weapons: [] },
          inventory: [...selectedGear.items]
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
        finalItems.push(diceResults[idx] || item.split(/\s+or\s+/i)[0].trim());
      } else {
        const diceInfo = parseDiceNotation(item);
        if (diceInfo) {
          const result = diceResults[idx] ? parseInt(diceResults[idx]) : rollDice(diceInfo.count, diceInfo.sides);
          const restText = diceInfo.rest.toLowerCase();
          if (restText.includes('gold')) updatedMoney.gold += result;
          else if (restText.includes('silver')) updatedMoney.silver += result;
          else if (restText.includes('copper')) updatedMoney.copper += result;
          else finalItems.push(`${result} ${diceInfo.rest}`);
        } else {
          finalItems.push(item);
        }
      }
    });

    updateCharacter({
      startingEquipment: { option: selectedOption, items: finalItems },
      equipment: {
        money: normalizeCurrency(updatedMoney),
        equipped: character.equipment?.equipped || { weapons: [] },
        inventory: [...finalItems]
      }
    });
    setShowDiceModal(false);
    setEquipmentConfirmed(true);
  };

  const allDiceModalFilled = selectedOption !== null && availableOptions
    .find(g => g.option === selectedOption)
    ?.items.every((item, idx) => {
      if (item.toLowerCase().includes(' or ')) return !!diceResults[idx];
      if (parseDiceNotation(item)) return !!diceResults[idx];
      return true;
    });

  if (loadingOptions || isLoadingItems) return <LoadingSpinner />;
  if (errorOptions || errorItems) return <ErrorMessage message={errorOptions || errorItems?.message || 'Failed to load data.'} />;
  if (!character.profession) return <div className="p-6 text-center"><p className="text-gray-600">Please select a profession first.</p></div>;

  return (
    <div className="space-y-6">
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Choose Starting Equipment</h3>
        <p className="text-gray-600">Select one of the equipment packages for your {character.profession}.</p>
      </div>

      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Equipment Selection</h4>
          <p className="text-sm text-blue-700">Items with <Dice4 className="inline w-4 h-4 text-amber-600" /> require a roll, items with <Spline className="inline w-4 h-4 text-purple-600" /> offer a choice.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableOptions.map((option) => (
          <div key={option.option} onClick={() => handleOptionSelect(option.option)} className={`p-6 border rounded-lg cursor-pointer transition-all ${selectedOption === option.option ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-6 h-6 text-gray-500" />
              <div>
                <h4 className="font-semibold">Option {option.option}</h4>
                <p className="text-sm text-gray-600">{option.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              <h5 className="font-medium text-gray-700">Equipment List:</h5>
              <ul className="space-y-1.5">
                {option.items.map((item, index) => {
                  const hasDice = !!parseDiceNotation(item);
                  const hasChoice = item.toLowerCase().includes(' or ');
                  const itemDetails = findItemDetails(item);
                  return (
                    <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      {hasDice ? (<Dice4 className="w-4 h-4 text-amber-500 flex-shrink-0" />)
                       : hasChoice ? (<Spline className="w-4 h-4 text-purple-500 flex-shrink-0" />)
                       : (<CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />)}
                      <span>{item}</span>

                      {/* --- FIX: Individual info icon and tooltip for each item --- */}
                      {itemDetails?.effect && (
                        <span className="relative group flex items-center">
                          <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal z-20 pointer-events-none">
                            <p className="font-bold">{itemDetails.name}</p>
                            <p>{itemDetails.effect}</p>
                            <p className="mt-1 text-gray-300">Weight: {itemDetails.weight}, Cost: {itemDetails.cost}</p>
                          </div>
                        </span>
                      )}
                      {/* --- END OF FIX --- */}
                    </li>
                  );
                })}
              </ul>
            </div>
            {selectedOption === option.option && <div className="mt-4 flex items-center gap-2 text-blue-600"><CheckCircle2 className="w-5 h-5" /><span className="text-sm font-medium">Selected</span></div>}
          </div>
        ))}
      </div>

      {!selectedOption && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div><h4 className="font-medium text-amber-800">Equipment Required</h4><p className="text-sm text-amber-700">Please select a starting equipment package.</p></div>
        </div>
      )}

       <button onClick={handleConfirmEquipment} disabled={!selectedOption || equipmentConfirmed} className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${equipmentConfirmed ? 'bg-green-600 text-white cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
         <Backpack className="w-5 h-5" />
         {equipmentConfirmed ? 'Equipment Confirmed' : 'Confirm Equipment Selection'}
       </button>

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
                    <select value={diceResults[index] || ''} onChange={(e) => setDiceResults(prev => ({ ...prev, [index]: e.target.value }))} className="mt-1 w-full border rounded px-2 py-1 text-sm">
                      <option value="" disabled>Select one...</option>
                      {alternatives.map((alt, i) => <option key={i} value={alt}>{alt}</option>)}
                    </select>
                  </div>
                );
              }
              const diceInfo = parseDiceNotation(item);
              if (!diceInfo) return null;
              return (
                <div key={index} className="mb-4 p-3 border rounded bg-amber-50 border-amber-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{item}</span>
                    <Button size="sm" variant="secondary" onClick={() => { const roll = rollDice(diceInfo.count, diceInfo.sides); setDiceResults(prev => ({ ...prev, [index]: roll.toString() })); }}>
                      Roll {diceInfo.count}D{diceInfo.sides}
                    </Button>
                  </div>
                  <input type="number" min={diceInfo.count} max={diceInfo.count * diceInfo.sides} value={diceResults[index] || ''}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === '') { setDiceResults(prev => ({ ...prev, [index]: '' })); }
                      else { const val = parseInt(valStr); if (!isNaN(val)) { const clampedVal = Math.max(diceInfo.count, Math.min(diceInfo.count * diceInfo.sides, val)); setDiceResults(prev => ({ ...prev, [index]: clampedVal.toString() })); } }
                    }}
                    className="mt-1 w-full border rounded px-2 py-1 text-sm" placeholder={`Enter result (${diceInfo.count}-${diceInfo.count * diceInfo.sides})`} />
                </div>
              );
            })}
            <div className="flex justify-end gap-4 mt-6">
              <Button variant="secondary" onClick={() => setShowDiceModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleConfirmDice} disabled={!allDiceModalFilled}>
                Confirm Rolls/Choices
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
