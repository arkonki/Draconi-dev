import React, { useEffect, useRef, useState } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Dices, RefreshCw, HelpCircle, Heart, Zap, Footprints } from 'lucide-react';
import { Button } from '../../shared/Button';

interface AttributeScore {
  value: number;
  baseChance: number;
}

// --- RULES LOGIC (Page 25) ---

const calculateBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const calculateDamageBonus = (value: number): string => {
  if (value <= 12) return '-';
  if (value <= 16) return '+D4';
  return '+D6';
};

const getKinMovementBase = (kin: string): number => {
  switch (kin) {
    case 'Wolfkin': return 12;
    case 'Human':
    case 'Elf': return 10;
    case 'Halfling':
    case 'Dwarf':
    case 'Mallard': return 8;
    default: return 10;
  }
};

const getAgilityMovementMod = (agl: number): number => {
  if (agl <= 6) return -4;
  if (agl <= 9) return -2;
  if (agl <= 12) return 0;
  if (agl <= 15) return 2;
  return 4;
};

const rollAttribute = (): number => {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a);
  return rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0);
};

const rollAllAttributes = () => {
  return {
    STR: rollAttribute(), CON: rollAttribute(), AGL: rollAttribute(),
    INT: rollAttribute(), WIL: rollAttribute(), CHA: rollAttribute(),
  };
};

const ageModifiers = {
  Young: { STR: 0, CON: +1, AGL: +1, INT: 0, WIL: 0, CHA: 0 },
  Adult: { STR: 0, CON: 0, AGL: 0, INT: 0, WIL: 0, CHA: 0 },
  Old: { STR: -2, CON: -2, AGL: -2, INT: +1, WIL: +1, CHA: 0 },
};

// --- TOOLTIP CONTENT (Page 25 & 26) ---
const tooltips: Record<string, string> = {
  STR: "Raw muscle power. Used for melee combat and heavy lifting.",
  CON: "Physical fitness and resilience. Determines your Hit Points (HP).",
  AGL: "Body control, speed, and fine motor skills. Affects Movement and ranged attacks.",
  INT: "Mental acuity, intellect, and reasoning skills. Used for Magic.",
  WIL: "Self-discipline and focus. Determines your Willpower Points (WP).",
  CHA: "Force of personality and empathy. Used for persuasion and bartering.",
  HP: "Hit Points. Determines how much damage you can take. Max HP equals your Constitution (CON).",
  WP: "Willpower Points. Used for magic and heroic abilities. Max WP equals your Willpower (WIL).",
  Movement: "How many meters you can run in a combat round. Based on Kin, modified by Agility (AGL).",
  DmgBonus: "Increases damage on attacks. STR for melee, AGL for ranged. (13-16: +D4, 17+: +D6).",
};

export function AttributesSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [attributes, setAttributes] = useState<Record<string, AttributeScore>>({
    STR: { value: character.attributes?.STR || 0, baseChance: 0 },
    CON: { value: character.attributes?.CON || 0, baseChance: 0 },
    AGL: { value: character.attributes?.AGL || 0, baseChance: 0 },
    INT: { value: character.attributes?.INT || 0, baseChance: 0 },
    WIL: { value: character.attributes?.WIL || 0, baseChance: 0 },
    CHA: { value: character.attributes?.CHA || 0, baseChance: 0 },
  });

  const [isRolling, setIsRolling] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState<string>('');
  const modalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAttribute) modalInputRef.current?.focus();
  }, [editingAttribute]);

  const getAgeModifier = (attr: string) => {
    if (!character.age) return 0;
    return ageModifiers[character.age][attr as keyof typeof ageModifiers.Adult];
  };

  const getFinalValue = (attr: string, baseValue: number) => {
    return baseValue + getAgeModifier(attr);
  };
  
  // Updates global state after local changes
  const syncCharacter = (newAttrs: Record<string, { value: number }>) => {
    // Calculate finals for storage
    const finalSTR = getFinalValue('STR', newAttrs.STR.value);
    const finalCON = getFinalValue('CON', newAttrs.CON.value);
    const finalAGL = getFinalValue('AGL', newAttrs.AGL.value);
    const finalINT = getFinalValue('INT', newAttrs.INT.value);
    const finalWIL = getFinalValue('WIL', newAttrs.WIL.value);
    const finalCHA = getFinalValue('CHA', newAttrs.CHA.value);

    updateCharacter({
      attributes: {
        STR: finalSTR, CON: finalCON, AGL: finalAGL,
        INT: finalINT, WIL: finalWIL, CHA: finalCHA
      },
      // Page 25: Max HP = CON, Max WP = WIL
      current_hp: finalCON,
      max_hp: finalCON,
      current_wp: finalWIL,
      max_wp: finalWIL,
      magic_school: character.magicSchool ?? null,
    });
  };

  const handleRollAll = () => {
    setIsRolling(true);
    const rolled = rollAllAttributes();
    
    // Update local state with chances
    const newAttributesWithChances = Object.entries(rolled).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: { value, baseChance: calculateBaseChance(getFinalValue(key, value)) },
      }), {}
    );
    setAttributes(newAttributesWithChances);
    
    // Update Global Store
    const simpleRolledObj = Object.entries(rolled).reduce<Record<string, { value: number }>>(
      (acc, [k, v]) => ({ ...acc, [k]: { value: v } }),
      {}
    );
    syncCharacter(simpleRolledObj);

    setIsRolling(false);
  };

  const handleManualEntry = (attr: string, numValue: number) => {
    const finalValue = getFinalValue(attr, numValue);
    const newAttributes = {
      ...attributes,
      [attr]: { value: numValue, baseChance: calculateBaseChance(finalValue) },
    };
    setAttributes(newAttributes);
    syncCharacter(newAttributes);
  };

  // Modal handlers
  const handleOpenModal = (attr: string, currentValue: number) => {
    setEditingAttribute(attr);
    setModalValue(currentValue > 0 ? currentValue.toString() : '');
  };
  const handleCloseModal = () => { setEditingAttribute(null); setModalValue(''); };
  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttribute) return;
    const validatedValue = Math.max(3, Math.min(18, parseInt(modalValue, 10) || 3));
    handleManualEntry(editingAttribute, validatedValue);
    handleCloseModal();
  };

  // Derived Calculations for Display
  const finalSTR = getFinalValue('STR', attributes.STR.value);
  const finalCON = getFinalValue('CON', attributes.CON.value);
  const finalAGL = getFinalValue('AGL', attributes.AGL.value);
  const finalWIL = getFinalValue('WIL', attributes.WIL.value);
  
  const moveBase = getKinMovementBase(character.kin || 'Human');
  const moveMod = getAgilityMovementMod(finalAGL);
  const totalMovement = moveBase + moveMod;

  // Helper for rendering tooltips
  const RenderTooltip = ({ text }: { text: string }) => (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-center">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="prose">
          <h3 className="text-xl font-bold text-gray-800">Assign Attributes</h3>
          <p className="text-sm text-gray-500">
            Scores range from 3 to 18. Age modifiers are applied automatically.
          </p>
        </div>
        <button
          onClick={handleRollAll} disabled={isRolling}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-bold shadow-sm"
        >
          {isRolling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
          Roll Attributes
        </button>
      </div>

      {/* Main Attributes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(attributes).map(([attr, { value }]) => {
          const modifier = getAgeModifier(attr);
          const finalValue = getFinalValue(attr, value);
          const isKey = character.key_attribute === attr;

          return (
            <div key={attr} className={`p-4 border rounded-lg shadow-sm bg-white relative ${isKey ? 'ring-2 ring-yellow-400 border-yellow-400 bg-yellow-50' : ''}`}>
              {isKey && <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">KEY</div>}
              
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-1.5 group relative">
                  <label className="text-lg font-bold text-gray-800">{attr}</label>
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                  <RenderTooltip text={tooltips[attr]} />
                </div>
                <div className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  Base Chance: <strong>{calculateBaseChance(finalValue)}</strong>
                </div>
              </div>

              <input
                type="text"
                readOnly
                value={value > 0 ? value : ''}
                onClick={() => handleOpenModal(attr, value)}
                placeholder="-"
                className="w-full py-2 border rounded cursor-pointer text-center font-mono text-2xl font-bold focus:ring-2 focus:ring-blue-500 hover:bg-gray-50 text-blue-600 bg-white"
              />
              
              <div className="mt-2 flex justify-between text-xs text-gray-500 h-4">
                {modifier !== 0 && (
                  <>
                    <span>Age Mod:</span>
                    <span className={modifier > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {modifier > 0 ? `+${modifier}` : modifier}
                    </span>
                  </>
                )}
                {modifier !== 0 && <span>= <strong>{finalValue}</strong></span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* DERIVED RATINGS SECTION (Page 25) */}
      {character.kin && Object.values(attributes).every(a => a.value > 0) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            Derived Ratings <span className="text-[10px] font-normal normal-case bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">Page 25</span>
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Hit Points */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center group relative">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                HP <HelpCircle size={10} className="cursor-help"/>
              </div>
              <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
                <Heart size={20} className="fill-current"/> {finalCON}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Based on CON</div>
              <RenderTooltip text={tooltips.HP} />
            </div>

            {/* Willpower Points */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center group relative">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                WP <HelpCircle size={10} className="cursor-help"/>
              </div>
              <div className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                <Zap size={20} className="fill-current"/> {finalWIL}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Based on WIL</div>
              <RenderTooltip text={tooltips.WP} />
            </div>

            {/* Movement */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center group relative">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                Movement <HelpCircle size={10} className="cursor-help"/>
              </div>
              <div className="text-2xl font-bold text-green-700 flex items-center gap-2">
                <Footprints size={20}/> {totalMovement}
              </div>
              <div className="text-[10px] text-gray-400 mt-1 text-center">
                {character.kin} ({moveBase}) {moveMod !== 0 ? `${moveMod > 0 ? '+' : ''}${moveMod} AGL` : ''}
              </div>
              <RenderTooltip text={tooltips.Movement} />
            </div>

            {/* Damage Bonuses */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center group relative">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                Dmg Bonus <HelpCircle size={10} className="cursor-help"/>
              </div>
              <div className="flex flex-col w-full px-2 gap-1 mt-1">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-600">STR</span>
                  <span className="font-bold text-indigo-600">{calculateDamageBonus(finalSTR)}</span>
                </div>
                <div className="w-full h-px bg-gray-100"></div>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-600">AGL</span>
                  <span className="font-bold text-indigo-600">{calculateDamageBonus(finalAGL)}</span>
                </div>
              </div>
              <RenderTooltip text={tooltips.DmgBonus} />
            </div>

          </div>
        </div>
      )}

      {/* Modals */}
      {editingAttribute && (
        <div className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseModal}
            aria-label="Close attribute editor"
          />
          <div className="relative bg-white p-6 rounded-lg shadow-xl w-full max-w-xs animate-in zoom-in-95">
            <h3 className="text-lg font-bold mb-4 text-center">Set {editingAttribute} Score</h3>
            <form onSubmit={handleModalSubmit}>
              <input
                ref={modalInputRef}
                type="number"
                min="3"
                max="18"
                value={modalValue}
                onChange={(e) => setModalValue(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-md text-2xl font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="mt-6 flex gap-2">
                <Button type="button" variant="ghost" onClick={handleCloseModal} className="flex-1">Cancel</Button>
                <Button type="submit" variant="primary" className="flex-1">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
