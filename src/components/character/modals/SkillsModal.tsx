import React, { useMemo, useState, useEffect } from 'react';
import { X, Info, CheckSquare } from 'lucide-react';
import { Character, AttributeName } from '../../../types/character';
import { useDice } from '../../dice/DiceContext';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { Button } from '../../shared/Button';
import { supabase } from '../../../lib/supabase';

interface SkillsModalProps {
  onClose: () => void;
}

// --- Constants ---
const skillAttributeMap: Record<string, AttributeName> = { 'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT', 'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL', 'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT', 'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT', 'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL', 'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR', 'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL', };
const baseSkills = [ 'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft', 'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 'Spot Hidden', 'Swimming' ];
const weaponSkillsList = [ 'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords' ];
const getBaseChance = (value: number): number => { if (value <= 5) return 3; if (value <= 8) return 4; if (value <= 12) return 5; if (value <= 15) return 6; return 7; };
const calculateFallbackLevel = (character: Character, skillName: string, attribute: AttributeName): number => { const isTrained = character.trainedSkills?.includes(skillName) ?? false; const baseValue = character.attributes?.[attribute] ?? 10; const baseChance = getBaseChance(baseValue); return isTrained ? baseChance * 2 : baseChance; };
// --- End Constants ---

export function SkillsModal({ onClose }: SkillsModalProps) {
  const { toggleDiceRoller } = useDice();
  // FIX 1: Destructure the correct function name 'markSkillThisSession'
  const { character, updateCharacterData, markSkillThisSession } = useCharacterSheetStore();

  const [skillInfo, setSkillInfo] = useState<Record<string, { description: string }>>({});
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [markedSkills, setMarkedSkills] = useState<Set<string>>(
    new Set(character?.marked_skills || [])
  );

  useEffect(() => {
    const fetchSkillInfo = async () => { setIsLoadingInfo(true); const { data } = await supabase.from('game_skills').select('name, description'); if (data) { const infoMap = data.reduce((acc, skill) => { acc[skill.name] = { description: skill.description }; return acc; }, {} as Record<string, { description: string }>); setSkillInfo(infoMap); } setIsLoadingInfo(false); };
    fetchSkillInfo();
  }, []);

  // --- DERIVED SKILL LISTS ---
  const generalSkillsForRender = useMemo(() => 
    baseSkills.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const weaponSkillsForRender = useMemo(() => 
    weaponSkillsList.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const secondarySkills = useMemo(() => {
    if (!character?.skill_levels) {
      return [];
    }
    const skillNames = Object.keys(character.skill_levels);
    const secondarySkillNames = skillNames.filter(name => 
      !baseSkills.includes(name) && !weaponSkillsList.includes(name)
    );
    
    return secondarySkillNames
      .map(name => ({ name, attr: skillAttributeMap[name] }))
      .sort((a, b) => a.name.localeCompare(b.name));

  }, [character?.skill_levels]);


  if (!character) {
    return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6"><LoadingSpinner /></div></div>;
  }

  const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => { return { 'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed', 'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened' }[attr] as keyof Character['conditions']; };
  
  const handleSkillClick = (skillName: string, skillValue: number, isAffected: boolean) => { toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: skillValue, description: `${skillName} Check`, requiresBane: isAffected, skillName, }); onClose(); };
  
  const handleMouseEnter = (e: React.MouseEvent, description: string) => { const rect = e.currentTarget.getBoundingClientRect(); setTooltipContent(description); setTooltipPosition({ top: rect.top, left: rect.left + rect.width / 2 }); };
  
  const handleMouseLeave = () => { setTooltipContent(null); setTooltipPosition(null); };
  
  const handleInfoClick = (e: React.MouseEvent, description: string) => { e.stopPropagation(); if (tooltipContent === description) { handleMouseLeave(); } else { handleMouseEnter(e, description); } };

  // FIX 2: Updated handler to use the correct store function
  const handleMarkSkill = (e: React.ChangeEvent<HTMLInputElement>, skillName: string) => {
    e.stopPropagation();
    const newMarkedSkills = new Set(markedSkills);
    
    if (e.target.checked) {
      newMarkedSkills.add(skillName);
      // Also update the session store so the Advancement System sees the Star icon
      markSkillThisSession(skillName);
    } else {
      newMarkedSkills.delete(skillName);
    }
    
    setMarkedSkills(newMarkedSkills);
    // Persist to database
    updateCharacterData({ marked_skills: Array.from(newMarkedSkills) });
  };

  const renderSkillRow = (skill: { name: string; attr: AttributeName }) => {
    const isTrained = character.trainedSkills?.includes(skill.name) ?? false;
    const skillValue = character.skill_levels?.[skill.name] ?? calculateFallbackLevel(character, skill.name, skill.attr);
    const condition = getConditionForAttribute(skill.attr);
    const isAffected = character.conditions?.[condition] ?? false;
    const description = skillInfo[skill.name]?.description;
    const isMarked = markedSkills.has(skill.name);

    return (
      <div
        key={skill.name}
        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${ isAffected ? 'bg-red-50 hover:bg-red-100 ring-1 ring-red-200' : 'hover:bg-gray-100' }`}
        onClick={() => handleSkillClick(skill.name, skillValue, isAffected)}
        title={`Click to roll ${skill.name} (Target ≤ ${skillValue}${isAffected ? ', Bane' : ''})`}
      >
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isMarked}
            onChange={(e) => handleMarkSkill(e, skill.name)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            title="Mark this skill for advancement"
          />
          <div className="flex items-center">
            <span className={`${isTrained ? 'font-bold' : ''} ${isAffected ? 'text-red-700' : 'text-gray-800'}`}>{skill.name}</span>
            {description && (
              <div className="flex items-center ml-2 p-1" onClick={(e) => handleInfoClick(e, description)} onMouseEnter={(e) => handleMouseEnter(e, description)} onMouseLeave={handleMouseLeave}>
                <Info className="w-4 h-4 text-blue-500" />
              </div>
            )}
            <span className="text-sm text-gray-500 ml-2">({skill.attr})</span>
            {isAffected && <span className="text-xs text-red-600 font-semibold ml-2">(Bane)</span>}
          </div>
        </div>
        <span className={`font-medium text-sm ${isAffected ? 'text-red-700' : 'text-gray-600'}`}>Target: {skillValue}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={handleMouseLeave}>
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-white flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Skills (D20 Check)</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button>
          </div>
          <p className="text-sm text-gray-600 mt-1">Click a skill to roll a D20 check. Roll ≤ Skill Level for success. Trained skills are bolded.</p>
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
            <CheckSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>When you have rolled a Dragon (1) or a Demon (20) when using a skill, tick the checkbox next to that skill.</p>
          </div>
        </div>
        
        {isLoadingInfo ? (
          <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 p-4 pt-2 overflow-y-auto flex-grow">
            <div>
              <h3 className="font-bold mb-0 text-gray-700 sticky top-0 bg-white">General Skills</h3>
              <div className="space-y-0.5">{generalSkillsForRender.map(renderSkillRow)}</div>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="font-bold mb-0 text-gray-700 sticky top-0 bg-white">Weapon Skills</h3>
                <div className="space-y-0.5">{weaponSkillsForRender.map(renderSkillRow)}</div>
              </div>
              
              {secondarySkills.length > 0 && (
                <div>
                  <h3 className="font-bold mb-0 text-gray-700 sticky top-0 bg-white">Secondary Skills</h3>
                  <div className="space-y-0.5">{secondarySkills.map(renderSkillRow)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-4 border-t bg-white flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
      {tooltipContent && tooltipPosition && (
          <div style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} className="fixed -translate-x-1/2 -translate-y-full mb-2 w-72 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-[60] pointer-events-none"><p>{tooltipContent}</p></div>
      )}
    </div>
  );
}
