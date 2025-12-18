import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Package, AlertCircle, Info, CheckCircle2, Backpack, Dice4, Spline, X, Coins, Utensils, Swords } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';
import { Button } from '../../shared/Button';
import { GameItem, fetchItems } from '../../../lib/api/items';
import { normalizeCurrency, formatCost } from '../../../lib/equipment';

interface EquipmentOption {
  option: number;
  items: string[];
  description: string;
}

interface ProfessionData {
  starting_equipment: string[];
  equipment_description: string[];
}

const WEAPON_SKILLS = [
  'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 
  'Knives', 'Slings', 'Spears', 'Staves', 'Swords'
];

// Helper to check if an item string implies a choice
const isChoiceItem = (item: string) => item.toLowerCase().includes(' or ');

// Helper to check if an item string implies a dice roll
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

export function GearSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [availableOptions, setAvailableOptions] = useState<EquipmentOption[]>([]);
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(false);
  
  // Stores choices for "Item A or Item B" -> { "optionIndex-itemIndex": "Selected String" }
  const [itemChoices, setItemChoices] = useState<Record<string, string>>({});

  // Dice Resolution State
  const [showDiceModal, setShowDiceModal] = useState(false);
  const [diceResults, setDiceResults] = useState<{ [key: number]: string }>({});
  
  // Loading State
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [errorOptions, setErrorOptions] = useState('');

  // Tooltip State (Mobile Friendly)
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null); 
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10,
  });

  // RESTORED: Filter trained weapon skills for display
  const trainedWeaponSkills = useMemo(() => {
    return (character.trainedSkills || []).filter(skill => WEAPON_SKILLS.includes(skill));
  }, [character.trainedSkills]);

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

  // Close tooltip on scroll
  useEffect(() => {
    const handleScroll = () => setActiveTooltip(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // --- Helper Functions ---

  const findItemDetails = (itemName: string): GameItem | undefined => {
    const baseItemName = itemName.split(' or ')[0].trim();
    // Remove "10 " or "D6 " from start for lookup
    const nameWithoutCount = baseItemName.replace(/^(\d+|D\d+|\d+D\d+)\s+/, '');
    return allItems.find(item => item.name.toLowerCase() === nameWithoutCount.toLowerCase());
  };

  const rollDice = (count: number, sides: number): number => {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  };

  // --- Interaction Handlers ---

  const handleOptionSelect = (optionId: number) => {
    setSelectedOption(optionId);
    setEquipmentConfirmed(false);
    setDiceResults({}); // Reset dice if switching options
    
    // Initialize default choices for this option
    const option = availableOptions.find(o => o.option === optionId);
    if (option) {
      const newChoices: Record<string, string> = {};
      option.items.forEach((item, idx) => {
        if (isChoiceItem(item)) {
          const choices = item.split(' or ').map(s => s.trim());
          newChoices[`${optionId}-${idx}`] = choices[0]; // Default to first
        }
      });
      setItemChoices(prev => ({ ...prev, ...newChoices }));
    }
  };

  const handleChoiceChange = (optionId: number, itemIndex: number, value: string) => {
    setItemChoices(prev => ({
      ...prev,
      [`${optionId}-${itemIndex}`]: value
    }));
  };

  const handleInfoClick = (e: React.MouseEvent, itemName: string) => {
    e.stopPropagation();
    if (activeTooltip === itemName) {
      setActiveTooltip(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      let leftPos = rect.left + rect.width / 2;
      
      // Keep tooltip on screen
      if (leftPos < 140) leftPos = 140; 
      if (leftPos > window.innerWidth - 140) leftPos = window.innerWidth - 140;

      setTooltipPosition({ top: rect.top, left: leftPos });
      setActiveTooltip(itemName);
    }
  };

  const handleBackgroundClick = () => {
    setActiveTooltip(null);
  };

  const getActiveItemDetails = () => {
    if (!activeTooltip) return null;
    return findItemDetails(activeTooltip);
  };

  const handleConfirmEquipment = () => {
    if (selectedOption === null) return;
    const selectedGear = availableOptions.find(opt => opt.option === selectedOption);
    if (!selectedGear) return;

    // Check if there are any dice rolls needed (Choice items are already resolved via state)
    const requiresRoll = selectedGear.items.some(item => !!parseDiceNotation(item));

    if (requiresRoll) {
      setShowDiceModal(true);
    } else {
      // Build final list immediately
      const finalItems = selectedGear.items.map((item, idx) => {
        if (isChoiceItem(item)) {
          return itemChoices[`${selectedOption}-${idx}`] || item.split(' or ')[0].trim();
        }
        return item;
      });
      
      finalizeSelection(finalItems, { gold: 0, silver: 0, copper: 0 });
    }
  };

  const handleConfirmDice = () => {
    if (selectedOption === null) return;
    const selectedGear = availableOptions.find(opt => opt.option === selectedOption);
    if (!selectedGear) return;

    const baseMoney = { gold: 0, silver: 0, copper: 0 }; 
    const calculatedMoney = { ...baseMoney };
    const finalItems: string[] = [];

    selectedGear.items.forEach((item, idx) => {
      // 1. Already Resolved Choice
      if (isChoiceItem(item)) {
        finalItems.push(itemChoices[`${selectedOption}-${idx}`] || item.split(' or ')[0].trim());
      }
      // 2. Dice Roll ("D12 Silver", "D6 Rations")
      else if (parseDiceNotation(item)) {
        const diceInfo = parseDiceNotation(item)!;
        const result = diceResults[idx] ? parseInt(diceResults[idx]) : 0; 
        const restText = diceInfo.rest.toLowerCase();

        if (restText.includes('gold')) calculatedMoney.gold += result;
        else if (restText.includes('silver')) calculatedMoney.silver += result;
        else if (restText.includes('copper')) calculatedMoney.copper += result;
        else {
           finalItems.push(`${result} ${diceInfo.rest}`);
        }
      } 
      // 3. Static Item ("Backpack")
      else {
        finalItems.push(item);
      }
    });

    setShowDiceModal(false);
    finalizeSelection(finalItems, calculatedMoney);
  };

  const finalizeSelection = (items: string[], money: any) => {
    updateCharacter({
      startingEquipment: { option: selectedOption!, items: items },
      equipment: {
        money: normalizeCurrency(money),
        equipped: character.equipment?.equipped || { weapons: [] },
        inventory: [...items]
      }
    });
    setEquipmentConfirmed(true);
  };

  // --- Summary Calculation ---
  const getPreviewData = () => {
    if (selectedOption === null) return null;
    const gear = availableOptions.find(g => g.option === selectedOption);
    if (!gear) return null;

    if (equipmentConfirmed && character.startingEquipment) {
       return {
           items: character.startingEquipment.items,
           money: character.equipment?.money || { gold: 0, silver: 0, copper: 0 }
       };
    }

    // Preview based on current choices
    const currentItems = gear.items.map((item, idx) => {
        if (isChoiceItem(item)) {
            return itemChoices[`${selectedOption}-${idx}`] || item.split(' or ')[0].trim();
        }
        return item;
    });

    return {
        items: currentItems,
        money: { gold: 0, silver: 0, copper: 0 } 
    };
  };

  const previewData = getPreviewData();

  const getRationCount = (items: string[]) => {
      let count = 0;
      items.forEach(i => {
          if (i.toLowerCase().includes('ration')) {
             const match = i.match(/^(\d+)/);
             count += match ? parseInt(match[1]) : 1; 
          }
      });
      return count;
  };

  const allDiceModalFilled = selectedOption !== null && availableOptions
    .find(g => g.option === selectedOption)
    ?.items.every((item, idx) => {
      if (!parseDiceNotation(item)) return true; // Skip non-dice items
      return diceResults[idx] !== undefined && diceResults[idx] !== '';
    });

  if (loadingOptions || isLoadingItems) return <LoadingSpinner />;
  if (errorOptions || errorItems) return <ErrorMessage message={errorOptions || errorItems?.message || 'Failed to load data.'} />;
  if (!character.profession) return <div className="p-6 text-center"><p className="text-gray-600">Please select a profession first.</p></div>;

  return (
    <div className="space-y-6" onClick={handleBackgroundClick}>
      <div className="prose max-w-none">
        <h3 className="text-xl font-bold mb-2">Starting Equipment</h3>
        <p className="text-gray-600 text-sm">
            Select an equipment package for your <strong>{character.profession}</strong>.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
          {/* RESTORED: Info Box 1: Trained Skills */}
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm shadow-sm">
            <Swords className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-red-800 uppercase text-xs tracking-wider mb-1">Your Fighting Style</h4>
              {trainedWeaponSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {trainedWeaponSkills.map(skill => (
                        <span key={skill} className="px-2 py-0.5 bg-white rounded border border-red-200 text-red-700 font-medium text-xs">
                            {skill}
                        </span>
                    ))}
                </div>
              ) : (
                <p className="text-red-600 italic">No specific weapon training.</p>
              )}
            </div>
          </div>

          {/* Info Box 2: Icon Legend */}
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm shadow-sm">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-blue-800 text-xs">
              <p className="mb-1"><Dice4 className="inline w-3 h-3 text-amber-600 mr-1" /> <strong>Roll:</strong> Results determined by dice (e.g. money).</p>
              <p><Spline className="inline w-3 h-3 text-purple-600 mr-1" /> <strong>Choice:</strong> You must select one option.</p>
            </div>
          </div>
      </div>

      {/* OPTIONS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableOptions.map((option) => (
          <div 
            key={option.option} 
            onClick={(e) => { e.stopPropagation(); handleOptionSelect(option.option); }} 
            className={`
                relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 flex flex-col
                ${selectedOption === option.option 
                    ? 'border-blue-600 bg-blue-50 shadow-md transform scale-[1.02] z-10' 
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }
            `}
          >
            <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200/60">
              <div className={`p-2 rounded-full ${selectedOption === option.option ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Package className="w-5 h-5" />
              </div>
              <div>
                <h4 className={`font-bold ${selectedOption === option.option ? 'text-blue-900' : 'text-gray-700'}`}>Option {option.option}</h4>
              </div>
              {selectedOption === option.option && <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />}
            </div>
            
            {/* Description - FULL TEXT VISIBLE */}
            {option.description && (
                <p className="text-xs text-gray-500 mb-3 leading-relaxed italic border-b border-dashed border-gray-200 pb-2">
                    {option.description}
                </p>
            )}

            <ul className="space-y-2 flex-grow">
                {option.items.map((item, index) => {
                  const hasDice = !!parseDiceNotation(item);
                  const hasChoice = isChoiceItem(item);
                  
                  // UPDATED: Determine currently selected item for finding details
                  let currentItemName = item;
                  if (hasChoice && selectedOption === option.option) {
                      currentItemName = itemChoices[`${option.option}-${index}`] || item.split(' or ')[0].trim();
                  } else if (hasChoice) {
                      currentItemName = item.split(' or ')[0].trim(); // Default for preview
                  }
                  
                  const itemDetails = findItemDetails(currentItemName);
                  
                  return (
                    <li key={index} className="flex flex-col gap-1 text-sm text-gray-700">
                      <div className="flex items-start gap-2">
                          <div className="mt-0.5 flex-shrink-0">
                              {hasDice ? <Dice4 className="w-3.5 h-3.5 text-amber-500" />
                              : hasChoice ? <Spline className="w-3.5 h-3.5 text-purple-500" />
                              : <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />}
                          </div>
                          
                          {/* RENDER CONTENT: Either Select Box or Text */}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                              {hasChoice && selectedOption === option.option ? (
                                  <div onClick={(e) => e.stopPropagation()} className="flex-1">
                                      <select 
                                        className="w-full text-xs p-1 border rounded border-purple-300 bg-white focus:ring-2 focus:ring-purple-200 outline-none"
                                        value={itemChoices[`${option.option}-${index}`] || item.split(' or ')[0].trim()}
                                        onChange={(e) => handleChoiceChange(option.option, index, e.target.value)}
                                      >
                                          {item.split(' or ').map(choice => (
                                              <option key={choice} value={choice.trim()}>{choice.trim()}</option>
                                          ))}
                                      </select>
                                  </div>
                              ) : (
                                  <span className="leading-snug truncate">{item}</span>
                              )}

                              {/* NEW: Info Button logic for Dropdown Selection */}
                              {itemDetails?.effect && (
                                <button
                                  type="button"
                                  onClick={(e) => handleInfoClick(e, currentItemName)}
                                  className={`flex-shrink-0 p-0.5 -m-0.5 rounded-full transition-colors ${activeTooltip === currentItemName ? 'text-blue-600' : 'text-gray-400 hover:text-blue-500'}`}
                                >
                                  <Info size={14} />
                                </button>
                              )}
                          </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>

      {/* BACKPACK SUMMARY */}
      {selectedOption && previewData && (
        <div className="mt-6 border-t-2 border-dashed border-gray-300 pt-6 animate-in fade-in slide-in-from-bottom-2">
            <h4 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Backpack className="w-5 h-5 text-gray-600" /> Your Backpack
                {equipmentConfirmed && <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">Confirmed</span>}
            </h4>
            
            <div className="bg-gray-800 text-gray-100 rounded-lg p-4 shadow-lg">
                <div className="flex flex-wrap gap-4 text-sm mb-4 border-b border-gray-600 pb-3">
                    <div className="flex items-center gap-2" title="Money">
                        <Coins className="w-4 h-4 text-yellow-400" />
                        <span className="font-mono">
                            <span className="text-yellow-400">{previewData.money.gold}G</span>{' '}
                            <span className="text-gray-400">{previewData.money.silver}S</span>{' '}
                            <span className="text-orange-400">{previewData.money.copper}C</span>
                        </span>
                    </div>
                    {equipmentConfirmed && (
                        <div className="flex items-center gap-2" title="Rations">
                            <Utensils className="w-4 h-4 text-green-400" />
                            <span className="font-mono">{getRationCount(previewData.items)} Rations</span>
                        </div>
                    )}
                </div>
                
                <div className="text-xs text-gray-300 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {previewData.items.map((item, idx) => (
                        <div key={idx} className="truncate">• {item}</div>
                    ))}
                </div>
            </div>
            
            <div className="mt-4">
                 <button 
                    onClick={handleConfirmEquipment} 
                    disabled={equipmentConfirmed} 
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold transition-all shadow-md active:scale-95 ${
                        equipmentConfirmed 
                        ? 'bg-gray-100 text-gray-400 cursor-default border border-gray-200' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {equipmentConfirmed ? (
                        <><CheckCircle2 className="w-5 h-5" /> Equipment Confirmed</>
                    ) : (
                        <><Dice4 className="w-5 h-5" /> Confirm & Roll for Stats</>
                    )}
                 </button>
                 {!equipmentConfirmed && (
                     <p className="text-center text-xs text-gray-500 mt-2">
                        Clicking confirm will resolve any dice rolls for money or items.
                     </p>
                 )}
            </div>
        </div>
      )}

      {/* Tooltip Overlay */}
      {activeTooltip && tooltipPosition && (
        <div 
          style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} 
          className="fixed -translate-x-1/2 -translate-y-[calc(100%+10px)] w-64 p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
        >
          <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
          {(() => {
            const details = getActiveItemDetails();
            if (!details) return "No details available.";
            return (
              <>
                <p className="font-bold border-b border-gray-700 pb-1 mb-1">{details.name}</p>
                <p>{details.effect}</p>
                <p className="mt-1 text-gray-300">Weight: {details.weight}, Cost: {details.cost}</p>
              </>
            );
          })()}
        </div>
      )}

      {/* Dice Resolution Modal (Only for Rolls now) */}
      {showDiceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <h3 className="text-xl font-bold text-gray-800">Resolve Rolls</h3>
               <button onClick={() => setShowDiceModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="space-y-4">
                {(availableOptions.find(gear => gear.option === selectedOption)?.items || []).map((item, index) => {
                
                // Only show if it's a dice roll item (ignore choices/static items)
                const diceInfo = parseDiceNotation(item);
                if (diceInfo) {
                    return (
                        <div key={index} className="p-4 border rounded-lg bg-amber-50 border-amber-200">
                            <div className="flex justify-between items-center mb-3">
                                <span className="font-bold text-amber-900 text-sm flex items-center gap-2">
                                    <Dice4 className="w-4 h-4" /> {item}
                                </span>
                            </div>
                            
                            <div className="flex gap-2">
                                <Button 
                                    size="sm" 
                                    variant="secondary" 
                                    className="flex-shrink-0 bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                                    onClick={() => { 
                                        const roll = rollDice(diceInfo.count, diceInfo.sides); 
                                        setDiceResults(prev => ({ ...prev, [index]: roll.toString() })); 
                                    }}
                                >
                                    Roll
                                </Button>
                                <input 
                                    type="number" 
                                    min={diceInfo.count} 
                                    max={diceInfo.count * diceInfo.sides} 
                                    value={diceResults[index] || ''}
                                    onChange={(e) => {
                                        const valStr = e.target.value;
                                        if (valStr === '') { setDiceResults(prev => ({ ...prev, [index]: '' })); }
                                        else { 
                                            const val = parseInt(valStr); 
                                            if (!isNaN(val)) { 
                                                const clampedVal = Math.max(diceInfo.count, Math.min(diceInfo.count * diceInfo.sides, val)); 
                                                setDiceResults(prev => ({ ...prev, [index]: clampedVal.toString() })); 
                                            } 
                                        }
                                    }}
                                    className="w-full border-amber-300 rounded-md text-center font-mono font-bold focus:ring-amber-500 focus:border-amber-500" 
                                    placeholder="?" 
                                />
                            </div>
                        </div>
                    );
                }
                return null;
                })}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setShowDiceModal(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button variant="primary" onClick={handleConfirmDice} disabled={!allDiceModalFilled} className="w-full sm:w-auto">
                Confirm Results
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
