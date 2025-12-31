import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Sword, Dices, Star, X, Save, Hammer, Crosshair, AlertCircle } from 'lucide-react';
import { Character, AttributeName, DiceType } from '../../types/character';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { useDice } from '../dice/DiceContext';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';

// --- HELPER FUNCTIONS ---

// Keys are lowercase to ensure case-insensitive matching
const skillAttributeMap: Record<string, AttributeName> = { 
  'axes': 'STR', 'bows': 'AGL', 'brawling': 'STR', 'crossbows': 'AGL', 
  'hammers': 'STR', 'knives': 'AGL', 'slings': 'AGL', 'spears': 'STR', 
  'staves': 'AGL', 'swords': 'STR' 
};

const getBaseChance = (value: number): number => { 
  if (value <= 5) return 3; 
  if (value <= 8) return 4; 
  if (value <= 12) return 5; 
  if (value <= 15) return 6; 
  return 7; 
};

const calculateFallbackLevel = (character: Character, skillName: string, attribute: AttributeName): number => { 
  const isTrained = character.trainedSkills?.includes(skillName) ?? false; 
  const baseValue = character.attributes?.[attribute] ?? 10; 
  const baseChance = getBaseChance(baseValue); 
  return isTrained ? baseChance * 2 : baseChance; 
};

const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => { 
  return { 'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed', 'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened' }[attr] as keyof Character['conditions']; 
};

const parseSkillLevels = (skillLevelsData: any): Record<string, number> => { 
  if (typeof skillLevelsData === 'object' && skillLevelsData !== null) { return skillLevelsData; } 
  return {}; 
};

const parseBaseSkillName = (skillNameWithAttr: string | null | undefined): string | null => { 
  if (!skillNameWithAttr) return null; 
  return skillNameWithAttr.split('(')[0].trim(); 
};

const isValidDiceType = (s: string): s is DiceType => { 
  return ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(s); 
};

const formatItemFeatures = (features: string | string[] | undefined): string => { 
  if (!features) return '-'; 
  if (Array.isArray(features)) return features.join(', '); 
  return features; 
};

// --- TYPES ---
interface ItemNote { enhanced?: boolean; bonus?: string; }
type ItemCategory = 'armor' | 'weapon';

// --- MODAL COMPONENT ---
const ItemNotesModal = ({ item, category, character, onClose, onSave }: { item: GameItem; category: ItemCategory; character: Character; onClose: () => void; onSave: (notes: any) => void; }) => {
  const [isEnhanced, setIsEnhanced] = useState(false);
  const [bonusText, setBonusText] = useState('');

  useEffect(() => {
    const notes = character.item_notes || {};
    const itemNote = notes[category]?.[item.id];
    if (itemNote) {
      setIsEnhanced(itemNote.enhanced || false);
      setBonusText(itemNote.bonus || '');
    }
  }, [item, category, character.item_notes]);

  const handleSave = () => {
    const currentNotes = JSON.parse(JSON.stringify(character.item_notes || {}));
    if (!currentNotes[category]) { currentNotes[category] = {}; }
    currentNotes[category][item.id] = { enhanced: isEnhanced, bonus: isEnhanced ? bonusText : '' };
    onSave(currentNotes);
    onClose();
  };
  
  const handleEnhanceToggle = (checked: boolean) => {
    setIsEnhanced(checked);
    if (!checked) { setBonusText(''); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded-lg max-w-lg w-full p-6 shadow-2xl flex flex-col animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-4 border-b-2 border-[#1a472a]/20 pb-2">
          <h3 className="text-xl font-serif font-bold text-[#1a472a]">Notes: {item.name}</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-red-600"><X /></button>
        </div>
        
        <div className="space-y-6 font-serif text-stone-800">
          <div className="p-3 bg-[#e8f4f8] border border-blue-200 rounded-sm text-sm text-blue-900 flex items-start gap-3 shadow-inner">
            <Hammer className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold uppercase text-xs tracking-wider mb-1">Mastercrafting</h4>
              <p className="leading-relaxed text-xs">With a <strong>MASTER BLACKSMITH</strong> or <strong>TANNER</strong>, this item can be enhanced. Armor gains rating bonuses; weapons gain damage dice. <em className="block mt-1 opacity-70">*Requires GM Approval.</em></p>
            </div>
          </div>
          
          <div className="space-y-4 bg-white p-4 border border-stone-200 rounded-sm">
            <div className="flex items-center">
              <input type="checkbox" id="enhanced" checked={isEnhanced} onChange={(e) => handleEnhanceToggle(e.target.checked)} className="h-5 w-5 accent-[#1a472a] border-stone-300 rounded cursor-pointer" />
              <label htmlFor="enhanced" className="ml-3 block text-sm font-bold text-[#1a472a] uppercase tracking-wide cursor-pointer">Mark as Enhanced (★)</label>
            </div>
            <div>
              <label htmlFor="bonusText" className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Bonus / Modifier</label>
              <input type="text" id="bonusText" value={bonusText} onChange={(e) => setBonusText(e.target.value)} disabled={!isEnhanced} className="block w-full border border-stone-300 rounded-sm p-2 font-serif focus:ring-2 focus:ring-[#1a472a] focus:border-transparent disabled:bg-stone-100 disabled:text-stone-400" placeholder={isEnhanced ? (category === 'armor' ? "e.g., +1" : "e.g., +D4") : "Item must be enhanced first"} />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-stone-200">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Save} onClick={handleSave}>Save Notes</Button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

interface EquipmentSectionProps { character: Character; }

export function EquipmentSection({ character }: EquipmentSectionProps) {
  const { toggleDiceRoller } = useDice();
  const { updateCharacterData } = useCharacterSheetStore();
  const [editingItem, setEditingItem] = useState<{ item: GameItem; category: ItemCategory } | null>(null);

  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: 1000 * 60 * 10 });

  const findItemDetails = (itemName: string): GameItem | undefined => allItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase());
  const getNoteForItem = (item: GameItem | undefined, category: ItemCategory): ItemNote | null => { if (!item) return null; return character.item_notes?.[category]?.[item.id] || null; };
  const isItemEnhanced = (item: GameItem | undefined, category: ItemCategory): boolean => getNoteForItem(item, category)?.enhanced || false;

  // --- LOGIC: Armor Total ---
  const calculateTotalArmor = () => {
    let totalArmor = 0;
    const armor = findItemDetails(character.equipment?.equipped?.armor || '');
    const helmet = findItemDetails(character.equipment?.equipped?.helmet || '');
    if (armor) {
      const note = getNoteForItem(armor, 'armor');
      let bonus = 0; if (note?.enhanced) { bonus = parseInt(note.bonus?.match(/\d+/)?.[0] || '0'); }
      totalArmor += (Number(armor.armor_rating) || 0) + bonus;
    }
    if (helmet) {
      const note = getNoteForItem(helmet, 'armor');
      let bonus = 0; if (note?.enhanced) { bonus = parseInt(note.bonus?.match(/\d+/)?.[0] || '0'); }
      totalArmor += (Number(helmet.armor_rating) || 0) + bonus;
    }
    return totalArmor;
  };
  
  // --- LOGIC: Banes ---
  const getBaneEffects = (item: GameItem | undefined) => {
    if (!item?.effect) return null;
    const baneMatch = item.effect.match(/Bane on ([^.]+)/i);
    return baneMatch ? baneMatch[1] : null;
  };

  // --- LOGIC: Damage Roll ---
  const handleDamageRoll = (weaponName: string, damageDiceString: string) => {
    const weaponDetails = findItemDetails(weaponName);
    const note = getNoteForItem(weaponDetails, 'weapon');
    
    let dicePool: DiceType[] = []; 
    let formulaParts: string[] = [];

    // 1. Base Weapon Dice
    const baseDiceMatch = damageDiceString?.match(/(\d+)?d(\d+)/i);
    if (baseDiceMatch) {
      const num = baseDiceMatch[1] ? parseInt(baseDiceMatch[1], 10) : 1; 
      const size = `d${baseDiceMatch[2]}`;
      if (isValidDiceType(size)) { 
        dicePool.push(...Array(num).fill(size)); 
        formulaParts.push(`${num}${size}`); 
      }
    }

    // 2. Attribute Bonuses (Dynamic Check)
    const rawSkillName = parseBaseSkillName(weaponDetails?.skill);
    const skillName = rawSkillName ? rawSkillName.toLowerCase() : null; // Lowercase for map lookup
    const attr = skillName ? skillAttributeMap[skillName] : null;

    if (attr) {
      const attrValue = Number(character.attributes?.[attr] || 10);
      let attrBonusType: DiceType | null = null;
      
      if (attrValue > 16) attrBonusType = 'd6'; 
      else if (attrValue > 12) attrBonusType = 'd4';

      if (attrBonusType) { 
        dicePool.push(attrBonusType); 
        formulaParts.push(`${attrBonusType.toUpperCase()} (${attr})`); 
      }
    }
    
    // 3. Enhancement Bonuses
    if (note?.enhanced) {
      const noteBonusMatch = note?.bonus?.match(/d(\d+)/i);
      if (noteBonusMatch) {
        const size = `d${noteBonusMatch[1]}`;
        if (isValidDiceType(size)) { 
          dicePool.push(size); 
          formulaParts.push(`${size.toUpperCase()} (Enh)`); 
        }
      }
    }

    toggleDiceRoller({ 
      rollMode: 'attackDamage', 
      initialDice: dicePool, 
      description: `Damage: ${weaponName} (${formulaParts.join(' + ')})` 
    });
  };

  // --- LOGIC: Attack Roll ---
  const handleAttackRoll = (weaponName: string, skillName: string, skillValue: number, isAffected: boolean) => {
    toggleDiceRoller({ 
      initialDice: ['d20'], 
      rollMode: 'skillCheck', 
      targetValue: skillValue, 
      description: `Attack: ${weaponName} (${skillName})`, 
      requiresBane: isAffected, 
      skillName 
    });
  };
  
  const handleSaveNotes = async (notes: any) => {
    try { await updateCharacterData({ item_notes: notes }); } catch (error) { console.error("Failed to save item notes:", error); }
  };

  const totalArmorRating = calculateTotalArmor();
  const equippedWeapons = character.equipment?.equipped?.weapons || [];
  const parsedSkillLevels = parseSkillLevels(character.skill_levels);
  const bodyArmorDetails = findItemDetails(character.equipment?.equipped?.armor || '');
  const helmetDetails = findItemDetails(character.equipment?.equipped?.helmet || '');

  return (
    <div className="space-y-6">
      
      {/* ARMOR SECTION */}
      <div className="bg-[#f4f1ea] p-4 rounded-sm border border-[#1a472a]/20 shadow-sm relative">
        <h3 className="font-serif font-bold text-lg mb-3 flex items-center gap-2 text-[#1a472a] border-b border-[#1a472a]/10 pb-1">
          <Shield className="w-5 h-5 fill-current" /> Armor & Protection
        </h3>
        
        {isLoadingItems ? <LoadingSpinner size="sm" /> : errorItems ? <ErrorMessage message="Could not load item details." /> : (
          <div className="space-y-3">
            <div className="space-y-2">
              {[
                { label: 'Body', item: bodyArmorDetails },
                { label: 'Head', item: helmetDetails }
              ].map(({ label, item }) => {
                // Calculate Armor Slot Bonus
                let bonusDisplay = '';
                if (item) {
                   const note = getNoteForItem(item, 'armor');
                   if (note?.enhanced && note.bonus) {
                      const bonusVal = parseInt(note.bonus.match(/\d+/)?.[0] || '0');
                      if (bonusVal > 0) bonusDisplay = `+${bonusVal}`;
                   }
                }

                return (
                  <div key={label} className="flex flex-col gap-1 p-2 bg-white border border-stone-200 rounded-sm">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 w-10">{label}</span>
                          <button onClick={() => item && setEditingItem({ item: item, category: 'armor' })} className="font-serif font-bold text-stone-800 hover:text-[#1a472a] hover:underline disabled:cursor-default disabled:hover:no-underline text-left" disabled={!item}>
                          {item?.name || <span className="italic text-stone-400 font-normal">None Equipped</span>}
                          </button>
                          {isItemEnhanced(item, 'armor') && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      </div>
                      {item && (
                        <span className="text-xs bg-[#e8d5b5] px-1.5 py-0.5 rounded text-[#5c4d3c] font-bold flex items-center gap-0.5">
                          {item.armor_rating}
                          {/* SHOW ENHANCED BONUS IF EXISTS */}
                          {bonusDisplay && <span className="text-amber-700 font-bold">{bonusDisplay}</span>}
                          <span className="ml-0.5">AR</span>
                        </span>
                      )}
                    </div>
                    
                    {/* Bane Effect Display */}
                    {item && getBaneEffects(item) && (
                      <div className="text-[10px] text-red-600 flex items-start gap-1 ml-12">
                         <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
                         <span>Bane on {getBaneEffects(item)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2 border-t border-stone-300 pt-2">
              <span className="text-xs uppercase font-bold text-stone-500 tracking-widest">Total Rating</span>
              <div className="bg-[#1a472a] text-[#e8d5b5] px-4 py-1 rounded-sm text-lg font-serif font-bold shadow-sm border border-[#0f2e1b]">
                {totalArmorRating}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WEAPONS SECTION */}
      <div className="bg-white rounded-sm border border-stone-300 shadow-sm overflow-hidden">
        <div className="bg-[#f4f1ea] p-3 border-b border-stone-300 flex items-center justify-between">
           <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#8b2e2e]">
             <Sword className="w-5 h-5 fill-current" /> Weapons
           </h3>
        </div>

        {isLoadingItems ? <div className="p-4"><LoadingSpinner size="sm" /></div> : errorItems ? <div className="p-4"><ErrorMessage message="Could not load item details." /></div> : equippedWeapons.length === 0 ? <p className="p-6 text-sm text-stone-400 italic text-center">No weapons equipped.</p> : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-[#dcd9c6] text-[#1a472a] font-bold uppercase text-[10px] md:text-xs font-serif tracking-wider">
                <tr>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Weapon</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Grip</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Range</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Damage</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Durability</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Features</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-sans text-stone-800 divide-y divide-stone-200">
                {equippedWeapons.map((weapon, index) => {
                  const weaponDetails = findItemDetails(weapon.name);
                  const rawSkillName = parseBaseSkillName(weaponDetails?.skill);
                  const skillName = rawSkillName ? rawSkillName.toLowerCase() : '';
                  const displayName = rawSkillName || '';
                  
                  // Retrieve Mastercraft note
                  const note = getNoteForItem(weaponDetails, 'weapon');

                  let skillValue: number | null = null; 
                  let isAffected = false;

                  // --- ATTRIBUTE BONUS DISPLAY ---
                  let attributeBonus = '';
                  if (skillName && skillAttributeMap[skillName]) {
                    const attr = skillAttributeMap[skillName];
                    const val = Number(character.attributes?.[attr] || 10);
                    if (val > 16) attributeBonus = '+D6';
                    else if (val > 12) attributeBonus = '+D4';
                    
                    const attrKeyForCondition = getConditionForAttribute(attr);
                    skillValue = parsedSkillLevels?.[displayName] ?? calculateFallbackLevel(character, displayName, attr);
                    isAffected = character.conditions?.[attrKeyForCondition] ?? false;
                  }
                  
                  // --- ENHANCED BONUS DISPLAY ---
                  let enhancedBonus = '';
                  if (note?.enhanced && note.bonus) {
                    enhancedBonus = ` ${note.bonus}`;
                  }

                  return (
                    <tr key={`${weapon.name}-${index}`} className="group hover:bg-[#f9f7f2] transition-colors">
                      <td className="px-3 py-2 font-serif font-bold">
                        <button onClick={() => weaponDetails && setEditingItem({ item: weaponDetails, category: 'weapon' })} className="text-left hover:text-[#1a472a] hover:underline disabled:cursor-default flex items-center gap-1.5" disabled={!weaponDetails}>
                          {weapon.name}
                          {isItemEnhanced(weaponDetails, 'weapon') && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-stone-600 text-xs">{weapon.grip || '-'}</td>
                      <td className="px-3 py-2 text-stone-600 text-xs">{weapon.range || '-'}</td>
                      <td className="px-3 py-2 font-bold text-stone-800">
                        {weapon.damage || '-'}
                        {attributeBonus && <span className="ml-1 text-xs text-[#8b2e2e] font-bold" title="Attribute Bonus">{attributeBonus}</span>}
                        {enhancedBonus && <span className="ml-1 text-xs text-amber-600 font-bold" title="Mastercrafted Bonus">{enhancedBonus}</span>}
                      </td>
                      <td className="px-3 py-2 text-stone-600 text-xs text-center">{weaponDetails?.durability || '-'}</td>
                      <td className="px-3 py-2 text-[10px] text-stone-500 max-w-[150px]">{formatItemFeatures(weapon.features)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {weapon.damage && (
                            <button 
                              onClick={() => handleDamageRoll(weapon.name, weapon.damage!)} 
                              className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-900 rounded border border-red-200 hover:bg-red-200 active:bg-red-300 transition-colors shadow-sm touch-manipulation" 
                              title="Roll for damage"
                            >
                              <Dices className="w-4 h-4" />
                              <span className="text-xs font-bold uppercase tracking-wide">Roll</span>
                            </button>
                          )}
                          {displayName && skillValue !== null && (
                            <button 
                              onClick={() => handleAttackRoll(weapon.name, displayName, skillValue!, isAffected)} 
                              title={`Attack with ${weapon.name}`}
                              className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors shadow-sm touch-manipulation ${isAffected ? 'bg-red-50 border-red-300 text-red-700' : 'bg-[#e8d5b5] border-[#d4c5a3] text-[#5c4d3c] hover:bg-[#d4c5a3] active:bg-[#c4b593]'}`}
                            >
                              <Crosshair className="w-4 h-4" />
                              <div className="flex flex-col items-start leading-none -mt-0.5">
                                <span className="text-[9px] uppercase font-bold tracking-wider opacity-70">{displayName}</span>
                                <span className="text-sm font-bold">Roll {skillValue}</span>
                              </div>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {editingItem && <ItemNotesModal item={editingItem.item} category={editingItem.category} character={character} onClose={() => setEditingItem(null)} onSave={handleSaveNotes} />}
    </div>
  );
}