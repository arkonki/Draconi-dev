import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Sword, Dices, ListChecks, Star, X, Save, Hammer } from 'lucide-react';
import { Character, AttributeName, DiceType } from '../../types/character';
import { GameItem, fetchItems } from '../../lib/api/items';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { useDice } from '../dice/DiceContext';
import { Button } from '../shared/Button';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';

// --- (Helper functions are unchanged) ---
const skillAttributeMap: Record<string, AttributeName> = { 'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR' };
const getBaseChance = (value: number): number => { if (value <= 5) return 3; if (value <= 8) return 4; if (value <= 12) return 5; if (value <= 15) return 6; return 7; };
const calculateFallbackLevel = (character: Character, skillName: string, attribute: AttributeName): number => { const isTrained = character.trainedSkills?.includes(skillName) ?? false; const baseValue = character.attributes?.[attribute] ?? 10; const baseChance = getBaseChance(baseValue); return isTrained ? baseChance * 2 : baseChance; };
const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => { return { 'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed', 'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened' }[attr] as keyof Character['conditions']; };
const parseSkillLevels = (skillLevelsData: any): Record<string, number> => { if (typeof skillLevelsData === 'object' && skillLevelsData !== null) {return skillLevelsData;} return {}; };
const parseBaseSkillName = (skillNameWithAttr: string | null | undefined): string | null => { if (!skillNameWithAttr) return null; return skillNameWithAttr.split('(')[0].trim(); };
const isValidDiceType = (s: string): s is DiceType => { return ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(s); };
const formatItemFeatures = (features: string | string[] | undefined): string => { if (!features) return '-'; if (Array.isArray(features)) return features.join(', '); return features; };
// --- End Helper Functions ---

interface ItemNote { enhanced?: boolean; bonus?: string; }
type ItemCategory = 'armor' | 'weapon';

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
    if (!checked) {
      setBonusText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h3 className="text-lg font-semibold">Notes for {item.name}</h3>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-500 hover:text-gray-800" /></button>
        </div>
        <div className="space-y-6">
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800 flex items-start gap-3">
            <Hammer className="w-6 h-6 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold">Enhancement Opportunity</h4>
              <p className="mt-1">With the help of a <strong>MASTER BLACKSMITH</strong>, this item can be enhanced. Armor can gain a bonus to its rating (e.g., +1), while weapons can gain a damage bonus (e.g., +D4). This requires GM approval.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center">
              <input type="checkbox" id="enhanced" checked={isEnhanced} onChange={(e) => handleEnhanceToggle(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <label htmlFor="enhanced" className="ml-2 block text-sm font-medium text-gray-700">Mark as Enhanced (★)</label>
            </div>
            <div>
              <label htmlFor="bonusText" className="block text-sm font-medium text-gray-700">Bonus / Modifier</label>
              <input type="text" id="bonusText" value={bonusText} onChange={(e) => setBonusText(e.target.value)} disabled={!isEnhanced} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed" placeholder={isEnhanced ? (category === 'armor' ? "e.g., +1" : "e.g., +D4") : "Must be enhanced first"} />
              <p className="text-xs text-gray-500 mt-1">Record the GM-approved bonus here.</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Save} onClick={handleSave}>Save Notes</Button>
        </div>
      </div>
    </div>
  );
};

interface EquipmentSectionProps { character: Character; }

export function EquipmentSection({ character }: EquipmentSectionProps) {
  const { toggleDiceRoller } = useDice();
  const { updateCharacterData } = useCharacterSheetStore();
  const [editingItem, setEditingItem] = useState<{ item: GameItem; category: ItemCategory } | null>(null);

  const { data: allItems = [], isLoading: isLoadingItems, error: errorItems } = useQuery<GameItem[], Error>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: 1000 * 60 * 10 });

  const findItemDetails = (itemName: string): GameItem | undefined => allItems.find(item => item.name?.toLowerCase() === itemName.toLowerCase());
  const getNoteForItem = (item: GameItem | undefined, category: ItemCategory): ItemNote | null => { if (!item) return null; return character.item_notes?.[category]?.[item.id] || null; };
  const isItemEnhanced = (item: GameItem | undefined, category: ItemCategory): boolean => getNoteForItem(item, category)?.enhanced || false;

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
  
  const handleDamageRoll = (weaponName: string, damageDiceString: string) => {
    const weaponDetails = findItemDetails(weaponName);
    const note = getNoteForItem(weaponDetails, 'weapon');
    let dicePool: DiceType[] = []; let formulaParts: string[] = [];
    const baseDiceMatch = damageDiceString?.match(/(\d+)?d(\d+)/i);
    if (baseDiceMatch) {
      const num = baseDiceMatch[1] ? parseInt(baseDiceMatch[1], 10) : 1; const size = `d${baseDiceMatch[2]}`;
      if (isValidDiceType(size)) { dicePool.push(...Array(num).fill(size)); formulaParts.push(`${num}d${baseDiceMatch[2]}`); }
    }
    const skillName = parseBaseSkillName(weaponDetails?.skill);
    const attr = skillName ? skillAttributeMap[skillName] : null;
    let attrBonusType: DiceType | null = null;
    if (attr === 'STR' && character.attributes.STR > 15) attrBonusType = 'd6'; else if (attr === 'STR' && character.attributes.STR > 12) attrBonusType = 'd4';
    if (attr === 'AGL' && character.attributes.AGL > 15) attrBonusType = 'd6'; else if (attr === 'AGL' && character.attributes.AGL > 12) attrBonusType = 'd4';
    if (attrBonusType) { dicePool.push(attrBonusType); formulaParts.push(attrBonusType.toUpperCase()); }
    
    if (note?.enhanced) {
      const noteBonusMatch = note?.bonus?.match(/d(\d+)/i);
      if (noteBonusMatch) {
        const size = `d${noteBonusMatch[1]}`;
        if (isValidDiceType(size)) { dicePool.push(size); formulaParts.push(size.toUpperCase()); }
      }
    }
    toggleDiceRoller({ rollMode: 'attackDamage', initialDice: dicePool, description: `Damage for ${weaponName} (${formulaParts.join(' + ')})` });
  };

  const handleSkillRoll = (skillName: string, skillValue: number, isAffected: boolean) => {
    toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: skillValue, description: `${skillName} Check`, requiresBane: isAffected, skillName });
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
    <div className="space-y-4">
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700"><Shield className="w-5 h-5 text-blue-600" /> Armor</h3>
        {isLoadingItems ? <LoadingSpinner size="sm" /> : errorItems ? <ErrorMessage message="Could not load item details." /> : (
          <div className="space-y-3">
            <div className="text-sm space-y-2">
              <div><button onClick={() => bodyArmorDetails && setEditingItem({ item: bodyArmorDetails, category: 'armor' })} className="text-left font-medium disabled:cursor-default" disabled={!bodyArmorDetails}>Body: {bodyArmorDetails?.name || <span className="italic text-gray-500 font-normal">None</span>} {isItemEnhanced(bodyArmorDetails, 'armor') && <Star className="w-3 h-3 inline text-yellow-500 fill-current" />}</button></div>
              <div><button onClick={() => helmetDetails && setEditingItem({ item: helmetDetails, category: 'armor' })} className="text-left font-medium disabled:cursor-default" disabled={!helmetDetails}>Helmet: {helmetDetails?.name || <span className="italic text-gray-500 font-normal">None</span>} {isItemEnhanced(helmetDetails, 'armor') && <Star className="w-3 h-3 inline text-yellow-500 fill-current" />}</button></div>
            </div>
            <div className="flex items-center justify-end gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-md text-sm font-medium mt-2"><Shield className="w-4 h-4" /><span>Total Armor Rating: {totalArmorRating}</span></div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700"><Sword className="w-5 h-5 text-red-600" /> Weapons</h3>
        {isLoadingItems ? <LoadingSpinner size="sm" /> : errorItems ? <ErrorMessage message="Could not load item details." /> : equippedWeapons.length === 0 ? <p className="text-sm text-gray-500 italic">No weapons equipped.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                <tr>
                  <th className="px-4 py-2">Weapon / Shield</th>
                  <th className="px-4 py-2">Grip</th>
                  <th className="px-4 py-2">Range</th>
                  <th className="px-4 py-2">Damage</th>
                  {/* --- NEW: Durability Header --- */}
                  <th className="px-4 py-2">Durability</th>
                  <th className="px-4 py-2">Features</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {equippedWeapons.map((weapon, index) => {
                  const weaponDetails = findItemDetails(weapon.name);
                  const skillName = parseBaseSkillName(weaponDetails?.skill);
                  let skillValue: number | null = null; let isAffected = false;
                  if (skillName && skillAttributeMap[skillName]) {
                    const attr = skillAttributeMap[skillName]; skillValue = parsedSkillLevels?.[skillName] ?? calculateFallbackLevel(character, skillName, attr);
                    isAffected = character.conditions?.[getConditionForAttribute(attr)] ?? false;
                  }
                  return (
                    <tr key={`${weapon.name}-${index}`} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium"><button onClick={() => weaponDetails && setEditingItem({ item: weaponDetails, category: 'weapon' })} className="text-left disabled:cursor-default" disabled={!weaponDetails}>{weapon.name} {isItemEnhanced(weaponDetails, 'weapon') && <Star className="w-3 h-3 inline text-yellow-500 fill-current" />}</button></td>
                      <td className="px-4 py-2">{weapon.grip || '-'}</td>
                      <td className="px-4 py-2">{weapon.range || '-'}</td>
                      <td className="px-4 py-2">{weapon.damage || '-'}</td>
                      {/* --- NEW: Durability Cell --- */}
                      <td className="px-4 py-2">{weaponDetails?.durability || '-'}</td>
                      <td className="px-4 py-2">{formatItemFeatures(weapon.features)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {weapon.damage && <Button variant="link" size="xs" onClick={() => handleDamageRoll(weapon.name, weapon.damage!)} className="text-red-600 p-0 flex items-center gap-1" title={`Roll damage`}><Dices className="w-3 h-3" />Damage</Button>}
                          {skillName && skillValue !== null && <Button variant="link" size="xs" onClick={() => handleSkillRoll(skillName, skillValue!, isAffected)} className={`${isAffected ? 'text-red-600' : 'text-indigo-600'} p-0 flex items-center gap-1`} title={`Roll ${skillName}`}><Dices className="w-3 h-3" />{skillName}: {skillValue}</Button>}
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