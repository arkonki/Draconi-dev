import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Sword, Dices, Star, X, Save, Hammer, Crosshair, AlertCircle, AlertTriangle } from 'lucide-react';
import { Character, AttributeName, DiceType } from '../../types/character';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useDice } from '../dice/useDice';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';

// --- HELPER FUNCTIONS ---
const skillAttributeMap: Record<string, AttributeName> = { 
  'axes': 'STR', 'bows': 'AGL', 'brawling': 'STR', 'crossbows': 'AGL', 
  'hammers': 'STR', 'knives': 'AGL', 'slings': 'AGL', 'spears': 'STR', 
  'staves': 'AGL', 'swords': 'STR' 
};

const getBaseChance = (value: number): number => { 
  if (value <= 5) return 3; if (value <= 8) return 4; if (value <= 12) return 5; if (value <= 15) return 6; return 7; 
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

const parseSkillLevels = (skillLevelsData: unknown): Record<string, number> => { 
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
interface ItemNote { enhanced?: boolean; bonus?: string; broken?: boolean; }
type ItemCategory = 'armor' | 'weapon';

// --- MODAL COMPONENT ---
const ItemNotesModal = ({ item, category, character, onClose, onSave }: { item: GameItem; category: ItemCategory; character: Character; onClose: () => void; onSave: (notes: Character['item_notes']) => void; }) => {
  const [isEnhanced, setIsEnhanced] = useState(false);
  const [bonusText, setBonusText] = useState('');
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    const notes = character.item_notes || {};
    const itemNote = notes[category]?.[item.id];
    if (itemNote) {
      setIsEnhanced(itemNote.enhanced || false);
      setBonusText(itemNote.bonus || '');
      setIsBroken(itemNote.broken || false);
    }
  }, [item, category, character.item_notes]);

  const handleSave = () => {
    const currentNotes = JSON.parse(JSON.stringify(character.item_notes || {}));
    if (!currentNotes[category]) { currentNotes[category] = {}; }
    currentNotes[category][item.id] = { enhanced: isEnhanced, bonus: isEnhanced ? bonusText : '', broken: isBroken };
    onSave(currentNotes);
    onClose();
  };
  
  const uniqueId = `broken-${item.id}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-[#fdfbf7] border-4 border-[#1a472a] rounded-lg max-w-lg w-full p-6 shadow-2xl flex flex-col animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-4 border-b-2 border-[#1a472a]/20 pb-2">
          <h3 className="text-xl font-serif font-bold text-[#1a472a]">Manage: {item.name}</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-red-600"><X /></button>
        </div>
        <div className="space-y-6 font-serif text-stone-800">
          <div className={`p-4 border rounded-sm transition-colors ${isBroken ? 'bg-red-50 border-red-300' : 'bg-stone-50 border-stone-200'}`}>
             <h4 className="font-bold uppercase text-xs tracking-wider mb-3 flex items-center gap-2"><AlertTriangle size={14} className={isBroken ? 'text-red-600' : 'text-stone-400'}/>Condition & Durability</h4>
             <div className="flex items-center justify-between">
                <label htmlFor={uniqueId} className="text-sm font-bold text-stone-700 cursor-pointer select-none">Is the item broken?<span className="block text-[10px] font-normal text-stone-500 mt-0.5">{"Happens if Parry Damage > Durability"} ({item.durability || 'N/A'})</span></label>  
                <div className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id={uniqueId} checked={isBroken} onChange={(e) => setIsBroken(e.target.checked)} className="peer sr-only" />
                    <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600 shadow-inner"></div>
                </div>
             </div>
          </div>
          <div className="space-y-4 bg-white p-4 border border-stone-200 rounded-sm">
            <div className="flex items-center gap-2 mb-2 text-[#1a472a]"><Hammer size={16} /><h4 className="font-bold uppercase text-xs tracking-wider">Mastercrafting</h4></div>
            <div className="flex items-center"><input type="checkbox" id="enhanced" checked={isEnhanced} onChange={(e) => setIsEnhanced(e.target.checked)} className="h-5 w-5 accent-[#1a472a] border-stone-300 rounded cursor-pointer" /><label htmlFor="enhanced" className="ml-3 block text-sm font-bold text-stone-700 uppercase tracking-wide cursor-pointer">Mark as Enhanced (★)</label></div>
            <div><label htmlFor="bonusText" className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Bonus / Modifier</label><input type="text" id="bonusText" value={bonusText} onChange={(e) => setBonusText(e.target.value)} disabled={!isEnhanced} className="block w-full border border-stone-300 rounded-sm p-2 font-serif focus:ring-2 focus:ring-[#1a472a] focus:border-transparent disabled:bg-stone-100 disabled:text-stone-400" placeholder={isEnhanced ? (category === 'armor' ? "e.g., +1" : "e.g., +D4") : "Item must be enhanced first"} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-stone-200"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Save} onClick={handleSave}>Save Changes</Button></div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

export function EquipmentSection({ character }: { character: Character }) {
  const { toggleDiceRoller } = useDice();
  const { updateCharacterData } = useCharacterSheetStore();
  const [editingItem, setEditingItem] = useState<{ item: GameItem; category: ItemCategory } | null>(null);
  const { data: allItems = [], isLoading } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: Infinity });

  // --- SMART ITEM LOOKUP ---
  const resolveItem = (itemName: string | undefined): GameItem | undefined => {
    if (!itemName) return undefined;
    const lowerName = itemName.toLowerCase().trim();

    const invItem = character.equipment?.inventory?.find(i => i.name.toLowerCase().trim() === lowerName);
    const staticItem = allItems.find(i => i.name.toLowerCase().trim() === lowerName);

    if (invItem && staticItem) {
        return { ...staticItem, ...invItem } as GameItem;
    }
    
    if (invItem) {
        return { 
            id: invItem.id || `custom-${itemName}`,
            name: invItem.name,
            category: invItem.category || 'LOOT',
            cost: (invItem.cost as string) || '0',
            weight: invItem.weight || 0,
            ...invItem 
        } as GameItem;
    }

    return staticItem;
  };

  const getNoteForItem = (item: GameItem | undefined, category: ItemCategory): ItemNote | null => { 
    if (!item || !item.id) return null; 
    return character.item_notes?.[category]?.[item.id] || null; 
  };
  
  const isItemBroken = (item: GameItem | undefined, category: ItemCategory) => getNoteForItem(item, category)?.broken || false;
  const isItemEnhanced = (item: GameItem | undefined, category: ItemCategory) => getNoteForItem(item, category)?.enhanced || false;

  const calculateTotalArmor = () => {
    const armor = resolveItem(character.equipment?.equipped?.armor);
    const helmet = resolveItem(character.equipment?.equipped?.helmet);
    
    const calc = (item: GameItem | undefined) => {
        if (!item) return 0;
        const note = getNoteForItem(item, 'armor');
        if (note?.broken) return 0;
        let val = Number(item.armor_rating) || 0;
        if (note?.enhanced) val += parseInt(note.bonus?.match(/\d+/)?.[0] || '0');
        return val;
    };
    return calc(armor) + calc(helmet);
  };
  
  const getBaneEffects = (item: GameItem | undefined) => {
    if (!item?.effect) return null;
    const match = item.effect.match(/Bane on ([^.]+)/i);
    return match ? match[1] : null;
  };

  const handleDamageRoll = (weaponName: string, damageDiceString: string) => {
    const weaponDetails = resolveItem(weaponName);
    const note = getNoteForItem(weaponDetails, 'weapon');
    const dicePool: DiceType[] = []; const formulaParts: string[] = [];
    
    // 1. Base Damage
    const baseMatch = damageDiceString?.match(/(\d+)?d(\d+)/i);
    if (baseMatch) {
      const num = baseMatch[1] ? parseInt(baseMatch[1]) : 1;
      const size = `d${baseMatch[2]}`;
      if (isValidDiceType(size)) { dicePool.push(...Array(num).fill(size)); formulaParts.push(`${num}${size}`); }
    }

    // 2. Check for "NO DAMAGE BONUS" Feature
    const features = weaponDetails?.features;
    // Normalize features to string (it can be array or string)
    const featuresStr = Array.isArray(features) ? features.join(' ') : (features || '');
    const hasNoDamageBonus = featuresStr.toUpperCase().includes('NO DAMAGE BONUS');

    // 3. Attribute Bonus Logic
    const rawSkill = parseBaseSkillName(weaponDetails?.skill);
    const skill = rawSkill ? rawSkill.toLowerCase() : null;
    const attr = skill ? skillAttributeMap[skill] : null;
    
    // Only apply attribute bonus if weapon doesn't have 'NO DAMAGE BONUS' feature
    if (attr && !hasNoDamageBonus) {
      const val = Number(character.attributes?.[attr] || 10);
      let bonus: DiceType | null = null;
      if (val > 16) bonus = 'd6'; else if (val > 12) bonus = 'd4';
      if (bonus) { dicePool.push(bonus); formulaParts.push(`${bonus.toUpperCase()} (${attr})`); }
    }

    // 4. Enhanced Bonus Logic
    if (note?.enhanced) {
      const match = note.bonus?.match(/d(\d+)/i);
      if (match && isValidDiceType(`d${match[1]}`)) {
        const size = `d${match[1]}` as DiceType;
        dicePool.push(size); formulaParts.push(`${size.toUpperCase()} (Enh)`);
      }
    }
    toggleDiceRoller({ rollMode: 'attackDamage', initialDice: dicePool, description: `Damage: ${weaponName} (${formulaParts.join(' + ')})` });
  };

  const handleAttackRoll = (weaponName: string, skillName: string, skillValue: number, isAffected: boolean) => {
    toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: skillValue, description: `Attack: ${weaponName} (${skillName})`, requiresBane: isAffected, skillName });
  };
  
  const handleSaveNotes = async (notes: Character['item_notes']) => {
    try { await updateCharacterData({ item_notes: notes }); } catch (error) { console.error(error); }
  };

  const totalArmorRating = calculateTotalArmor();
  const equippedWeapons = character.equipment?.equipped?.weapons || [];
  const parsedSkillLevels = parseSkillLevels(character.skill_levels);
  const bodyArmor = resolveItem(character.equipment?.equipped?.armor);
  const helmet = resolveItem(character.equipment?.equipped?.helmet);

  return (
    <div className="space-y-6">
      <div className="bg-[#f4f1ea] p-4 rounded-sm border border-[#1a472a]/20 shadow-sm relative">
        <h3 className="font-serif font-bold text-lg mb-3 flex items-center gap-2 text-[#1a472a] border-b border-[#1a472a]/10 pb-1"><Shield className="w-5 h-5 fill-current" /> Armor & Protection</h3>
        {isLoading ? <LoadingSpinner size="sm" /> : (
          <div className="space-y-3">
            <div className="space-y-2">
              {[{ label: 'Body', item: bodyArmor }, { label: 'Head', item: helmet }].map(({ label, item }) => {
                const isBroken = isItemBroken(item, 'armor');
                const note = getNoteForItem(item, 'armor');
                let bonusDisplay = '';
                if (item && note?.enhanced && note.bonus) { const b = parseInt(note.bonus.match(/\d+/)?.[0] || '0'); if (b > 0) bonusDisplay = `+${b}`; }
                
                return (
                  <div key={label} className={`flex flex-col gap-1 p-2 border rounded-sm transition-all ${isBroken ? 'bg-red-50 border-red-200 opacity-90' : 'bg-white border-stone-200'}`}>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 w-10">{label}</span>
                          <button onClick={() => item && setEditingItem({ item, category: 'armor' })} className={`font-serif font-bold text-left hover:underline disabled:cursor-default ${isBroken ? 'text-red-700 line-through decoration-2' : 'text-stone-800 hover:text-[#1a472a]'}`} disabled={!item}>
                            {item?.name || <span className="italic text-stone-400 font-normal no-underline">None Equipped</span>}
                          </button>
                          {isBroken && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1 rounded border border-red-200">BROKEN</span>}
                          {!isBroken && isItemEnhanced(item, 'armor') && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      </div>
                      {item && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${isBroken ? 'bg-red-200 text-red-800' : 'bg-[#e8d5b5] text-[#5c4d3c]'}`}>
                          {isBroken ? '0' : item.armor_rating || 0}
                          {!isBroken && bonusDisplay && <span className="text-amber-700 font-bold">{bonusDisplay}</span>}
                          <span className="ml-0.5">AR</span>
                        </span>
                      )}
                    </div>
                    {item && getBaneEffects(item) && !isBroken && (<div className="text-[10px] text-red-600 flex items-start gap-1 ml-12"><AlertCircle size={10} className="mt-0.5 flex-shrink-0" /><span>Bane on {getBaneEffects(item)}</span></div>)}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-3 mt-2 border-t border-stone-300 pt-2"><span className="text-xs uppercase font-bold text-stone-500 tracking-widest">Total Rating</span><div className="bg-[#1a472a] text-[#e8d5b5] px-4 py-1 rounded-sm text-lg font-serif font-bold shadow-sm border border-[#0f2e1b]">{totalArmorRating}</div></div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-sm border border-stone-300 shadow-sm overflow-hidden">
        <div className="bg-[#f4f1ea] p-3 border-b border-stone-300 flex items-center justify-between"><h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#8b2e2e]"><Sword className="w-5 h-5 fill-current" /> Weapons</h3></div>
        {isLoading ? <div className="p-4"><LoadingSpinner size="sm" /></div> : equippedWeapons.length === 0 ? <p className="p-6 text-sm text-stone-400 italic text-center">No weapons equipped.</p> : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-[#dcd9c6] text-[#1a472a] font-bold uppercase text-[10px] md:text-xs font-serif tracking-wider">
                <tr>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Weapon</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Grip</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Range</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Damage</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20 text-center">Durability</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20">Features</th>
                  <th className="px-3 py-2 border-b border-[#1a472a]/20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-sans text-stone-800 divide-y divide-stone-200">
                {equippedWeapons.map((weapon, index) => {
                  const weaponDetails = resolveItem(weapon.name);
                  const rawSkillName = parseBaseSkillName(weaponDetails?.skill);
                  const skillName = rawSkillName ? rawSkillName.toLowerCase() : '';
                  const displayName = rawSkillName || '';
                  const note = getNoteForItem(weaponDetails, 'weapon');
                  const isBroken = note?.broken || false;
                  let skillValue: number | null = null; 
                  let isAffected = false;
                  let attributeBonus = '';
                  
                  // Check for NO DAMAGE BONUS flag
                  const features = weaponDetails?.features;
                  const featuresStr = Array.isArray(features) ? features.join(' ') : (features || '');
                  const hasNoDamageBonus = featuresStr.toUpperCase().includes('NO DAMAGE BONUS');

                  if (skillName && skillAttributeMap[skillName]) {
                    const attr = skillAttributeMap[skillName];
                    const val = Number(character.attributes?.[attr] || 10);
                    
                    // Only calculate visual bonus if NOT "NO DAMAGE BONUS"
                    if (!hasNoDamageBonus) {
                        if (val > 16) attributeBonus = '+D6'; 
                        else if (val > 12) attributeBonus = '+D4';
                    }

                    const attrKey = getConditionForAttribute(attr);
                    skillValue = parsedSkillLevels?.[displayName] ?? calculateFallbackLevel(character, displayName, attr);
                    isAffected = character.conditions?.[attrKey] ?? false;
                  }
                  
                  let enhancedBonus = '';
                  if (note?.enhanced && note.bonus) enhancedBonus = ` ${note.bonus}`;

                  return (
                    <tr key={`${weapon.name}-${index}`} className={`group transition-colors ${isBroken ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-[#f9f7f2]'}`}>
                      <td className="px-3 py-2 font-serif font-bold">
                        <button onClick={() => weaponDetails && setEditingItem({ item: weaponDetails, category: 'weapon' })} className={`text-left hover:underline disabled:cursor-default flex items-center gap-1.5 ${isBroken ? 'text-red-800 decoration-red-800 line-through' : 'hover:text-[#1a472a]'}`} disabled={!weaponDetails}>
                          {weapon.name}
                          {!isBroken && isItemEnhanced(weaponDetails, 'weapon') && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        </button>
                        {isBroken && <span className="text-[9px] block text-red-600 font-bold tracking-wider mt-0.5">BROKEN</span>}
                      </td>
                      <td className="px-3 py-2 text-stone-600 text-xs">{weapon.grip || weaponDetails?.grip || '-'}</td>
                      <td className="px-3 py-2 text-stone-600 text-xs">{weapon.range || weaponDetails?.range || '-'}</td>
                      <td className="px-3 py-2 font-bold text-stone-800">
                        {isBroken ? <span className="text-red-400">-</span> : (
                            <>{weapon.damage || weaponDetails?.damage || '-'}{attributeBonus && <span className="ml-1 text-xs text-[#8b2e2e] font-bold">{attributeBonus}</span>}{enhancedBonus && <span className="ml-1 text-xs text-amber-600 font-bold">{enhancedBonus}</span>}</>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{isBroken ? <AlertTriangle size={14} className="text-red-500 mx-auto"/> : <span className="text-stone-600 text-xs">{weaponDetails?.durability || '-'}</span>}</td>
                      <td className="px-3 py-2 text-[10px] text-stone-500 max-w-[150px]">{formatItemFeatures(weaponDetails?.features)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {displayName && skillValue !== null && !isBroken && (
                            <button onClick={() => handleAttackRoll(weapon.name, displayName, skillValue!, isAffected)} className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors shadow-sm touch-manipulation ${isAffected ? 'bg-red-50 border-red-300 text-red-700' : 'bg-[#e8d5b5] border-[#d4c5a3] text-[#5c4d3c] hover:bg-[#d4c5a3] active:bg-[#c4b593]'}`}>
                              <Crosshair className="w-4 h-4" /><div className="flex flex-col items-start leading-none -mt-0.5"><span className="text-[9px] uppercase font-bold tracking-wider opacity-70">{displayName}</span><span className="text-sm font-bold">Roll {skillValue}</span></div>
                            </button>
                          )}
                          {(weapon.damage || weaponDetails?.damage) && !isBroken && (
                            <button onClick={() => handleDamageRoll(weapon.name, (weapon.damage || weaponDetails?.damage)!)} className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-900 rounded border border-red-200 hover:bg-red-200 active:bg-red-300 transition-colors shadow-sm touch-manipulation"><Dices className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-wide">Damage</span></button>
                          )}
                          {isBroken && <span className="text-xs italic text-red-400">Unusable</span>}
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
