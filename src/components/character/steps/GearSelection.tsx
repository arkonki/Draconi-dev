import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Package, Info, CheckCircle2, Backpack, Dice4, Spline, Coins, Utensils, Swords, ArrowDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';
import { GameItem, fetchItems } from '../../../lib/api/items';
import { normalizeCurrency } from '../../../lib/equipment';
import { Money } from '../../../types/character';

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
  const [selectedOption, setSelectedOption] = useState<number | null>(character.startingEquipment?.option ?? null);
  const [availableOptions, setAvailableOptions] = useState<EquipmentOption[]>([]);
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(!!character.startingEquipment);
  
  // Stores choices for "Item A or Item B" -> { "optionIndex-itemIndex": "Selected String" }
  const [itemChoices, setItemChoices] = useState<Record<string, string>>({});

  // Dice Resolution State
  const [diceResults, setDiceResults] = useState<{ [key: number]: string }>({});
  
  // Loading State
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [errorOptions, setErrorOptions] = useState('');

  // Tooltip State (Mobile Friendly)
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);

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
      } catch {
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
    updateCharacter({ startingEquipment: undefined });
    
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

  const getTooltipLayout = (triggerEl: HTMLElement | null) => {
    if (!triggerEl || !triggerEl.isConnected) return null;
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 24);
    const estimatedHeight = 288;
    const margin = 12;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centerX, margin + width / 2), window.innerWidth - margin - width / 2);
    const showAbove = rect.top > estimatedHeight + margin;
    const placement = showAbove ? 'top' as const : 'bottom' as const;
    const top = placement === 'top'
      ? Math.max(margin + estimatedHeight, rect.top - 10)
      : Math.min(window.innerHeight - margin - estimatedHeight, rect.bottom + 10);
    return { top, left, placement };
  };

  const handleInfoClick = (e: React.MouseEvent, itemName: string) => {
    e.stopPropagation();
    if (activeTooltip === itemName) {
      setActiveTooltip(null);
    } else {
      const layout = getTooltipLayout(e.currentTarget);
      if (!layout) return;
      setTooltipPosition(layout);
      setActiveTooltip(itemName);
    }
  };

  const handleKeyboardActivate = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
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
      handleConfirmDice();
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

    finalizeSelection(finalItems, calculatedMoney);
  };

  const finalizeSelection = (items: string[], money: Money) => {
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

  const allRequiredRollsFilled = selectedOption !== null && availableOptions
    .find(g => g.option === selectedOption)
    ?.items.every((item, idx) => {
      if (!parseDiceNotation(item)) return true; // Skip non-dice items
      return diceResults[idx] !== undefined && diceResults[idx] !== '';
    });

  const selectedOptionHasRolls = selectedOption !== null && !!availableOptions
    .find(option => option.option === selectedOption)
    ?.items.some(item => !!parseDiceNotation(item));

  if (loadingOptions || isLoadingItems) return <LoadingSpinner />;
  if (errorOptions || errorItems) return <ErrorMessage message={errorOptions || errorItems?.message || 'Failed to load data.'} />;
  if (!character.profession) return <div className="p-6 text-center"><p className="text-gray-600">Please select a profession first.</p></div>;

  return (
    <div className="space-y-5">
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

      <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
        <ArrowDown className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <div><strong>Select a package below.</strong> Any ration or money rolls appear directly inside the selected package. Roll them or enter the result manually, then confirm the package.</div>
      </div>

      {/* OPTIONS GRID */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {availableOptions.map((option) => (
          <div 
            key={option.option} 
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button, input, select, details, summary')) return;
              handleOptionSelect(option.option);
            }}
            onKeyDown={(event) => {
              handleKeyboardActivate(event, () => handleOptionSelect(option.option));
            }}
            role="button"
            tabIndex={0}
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
                                  <div className="flex-1">
                                      <select 
                                        className="w-full text-xs p-1 border rounded border-purple-300 bg-white focus:ring-2 focus:ring-purple-200 outline-none"
                                        value={itemChoices[`${option.option}-${index}`] || item.split(' or ')[0].trim()}
                                        onChange={(e) => handleChoiceChange(option.option, index, e.target.value)}
                                        onClick={(event) => event.stopPropagation()}
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

            {selectedOption === option.option && (
              <div className="mt-4 space-y-3 border-t border-blue-200 pt-3">
                {option.items.map((item, index) => {
                  const diceInfo = parseDiceNotation(item);
                  if (!diceInfo) return null;
                  const currentValue = diceResults[index] || '';
                  return (
                    <div key={`roll-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-amber-900">
                        <span className="flex items-center gap-1.5"><Dice4 className="h-4 w-4" /> {item}</span>
                        <span className="font-normal text-amber-700">{diceInfo.count}–{diceInfo.count * diceInfo.sides}</span>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setDiceResults(previous => ({ ...previous, [index]: String(rollDice(diceInfo.count, diceInfo.sides)) }))} className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">Roll {diceInfo.count === 1 ? '' : diceInfo.count}D{diceInfo.sides}</button>
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Manual result for {item}</span>
                          <input
                            type="number"
                            min={diceInfo.count}
                            max={diceInfo.count * diceInfo.sides}
                            value={currentValue}
                            onChange={(event) => {
                              const rawValue = event.target.value;
                              if (!rawValue) {
                                setDiceResults(previous => ({ ...previous, [index]: '' }));
                                return;
                              }
                              const numericValue = Number(rawValue);
                              if (Number.isFinite(numericValue)) {
                                const clampedValue = Math.max(diceInfo.count, Math.min(diceInfo.count * diceInfo.sides, numericValue));
                                setDiceResults(previous => ({ ...previous, [index]: String(clampedValue) }));
                              }
                            }}
                            className="w-full rounded-md border border-amber-300 px-3 py-2 text-center font-mono font-bold focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                            placeholder="Manual result"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={handleConfirmEquipment}
                  disabled={equipmentConfirmed || (selectedOptionHasRolls && !allRequiredRollsFilled)}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${equipmentConfirmed ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : selectedOptionHasRolls && !allRequiredRollsFilled ? 'cursor-not-allowed bg-gray-200 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {equipmentConfirmed ? 'Package confirmed' : selectedOptionHasRolls && !allRequiredRollsFilled ? 'Resolve rolls to confirm' : 'Confirm this package'}
                </button>
              </div>
            )}
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
            
        </div>
      )}

      {/* Tooltip Overlay */}
      {activeTooltip && tooltipPosition && (
        <div 
          style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} 
          className={`fixed -translate-x-1/2 w-64 max-w-[calc(100vw-1.5rem)] max-h-[min(18rem,calc(100vh-1.5rem))] overflow-y-auto p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-200 pointer-events-none ${tooltipPosition.placement === 'top' ? '-translate-y-[calc(100%+10px)]' : 'translate-y-[10px]'}`}
        >
          {tooltipPosition.placement === 'top' ? (
            <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
          ) : (
            <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
          )}
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

    </div>
  );
}
