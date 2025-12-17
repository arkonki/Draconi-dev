import React, { useMemo, useState, useEffect, useRef } from 'react';
import { X, Info, CheckSquare, Target, Swords, GraduationCap, Sparkles, BookOpen } from 'lucide-react';
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
  const { character, updateCharacterData, markSkillThisSession } = useCharacterSheetStore();

  const [skillInfo, setSkillInfo] = useState<Record<string, { description: string }>>({});
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  
  // Tooltip State
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null); // Store skill name instead of just content
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  
  const [markedSkills, setMarkedSkills] = useState<Set<string>>(
    new Set(character?.marked_skills || [])
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchSkillInfo = async () => { setIsLoadingInfo(true); const { data } = await supabase.from('game_skills').select('name, description'); if (data) { const infoMap = data.reduce((acc, skill) => { acc[skill.name] = { description: skill.description }; return acc; }, {} as Record<string, { description: string }>); setSkillInfo(infoMap); } setIsLoadingInfo(false); };
    fetchSkillInfo();
  }, []);

  // Close tooltip on scroll or when clicking outside (handled by wrapper)
  useEffect(() => {
    const handleScroll = () => setActiveTooltip(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
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

  // Search Filter
  const filterSkills = (skills: { name: string, attr: AttributeName }[]) => {
    if (!searchQuery) return skills;
    return skills.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  if (!character) {
    return <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"><div className="bg-white rounded-xl p-8"><LoadingSpinner size="lg" /></div></div>;
  }

  const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => { return { 'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed', 'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened' }[attr] as keyof Character['conditions']; };
  
  const handleSkillClick = (skillName: string, skillValue: number, isAffected: boolean) => { toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: skillValue, description: `${skillName} Check`, requiresBane: isAffected, skillName, }); onClose(); };
  
  // Updated Tooltip Logic: Toggle on click
  const handleInfoClick = (e: React.MouseEvent, skillName: string) => { 
    e.stopPropagation(); // Prevent row click
    if (activeTooltip === skillName) {
        setActiveTooltip(null);
    } else {
        const rect = e.currentTarget.getBoundingClientRect(); 
        // Adjust for mobile edges if needed
        let leftPos = rect.left + rect.width / 2;
        if (leftPos < 140) leftPos = 140; // Prevent going off left edge
        if (leftPos > window.innerWidth - 140) leftPos = window.innerWidth - 140; // Prevent going off right edge

        setActiveTooltip(skillName); 
        setTooltipPosition({ top: rect.top, left: leftPos }); 
    }
  };
  
  // Close tooltip when clicking modal background
  const handleBackgroundClick = () => { setActiveTooltip(null); };
  
  const handleMarkSkill = (e: React.ChangeEvent<HTMLInputElement>, skillName: string) => {
    e.stopPropagation();
    const newMarkedSkills = new Set(markedSkills);
    
    if (e.target.checked) {
      newMarkedSkills.add(skillName);
      markSkillThisSession(skillName);
    } else {
      newMarkedSkills.delete(skillName);
    }
    
    setMarkedSkills(newMarkedSkills);
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
        className={`
            group relative flex items-center justify-between p-3 rounded-lg border transition-all duration-200 cursor-pointer select-none
            ${isAffected 
                ? 'bg-red-50 border-red-100 hover:border-red-200 hover:shadow-sm' 
                : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md hover:translate-y-[-1px]'
            }
        `}
        onClick={() => handleSkillClick(skill.name, skillValue, isAffected)}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Checkbox Area */}
          <div 
             className="relative flex items-center justify-center w-6 h-6 shrink-0"
             onClick={(e) => e.stopPropagation()} 
          >
             <input
                type="checkbox"
                checked={isMarked}
                onChange={(e) => handleMarkSkill(e, skill.name)}
                className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded bg-white checked:bg-indigo-600 checked:border-indigo-600 focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400 cursor-pointer transition-colors"
                title="Mark for advancement"
             />
             <CheckSquare size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
          </div>

          <div className="flex flex-col min-w-0">
             <div className="flex items-center gap-1.5">
                <span className={`text-sm truncate ${isTrained ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {skill.name}
                </span>
                {isTrained && <GraduationCap size={12} className="text-indigo-500 shrink-0" title="Trained Skill"/>}
                {description && (
                   // Updated Info Icon: Button behavior for touch
                   <button
                      type="button"
                      onClick={(e) => handleInfoClick(e, skill.name)}
                      className={`p-1 -m-1 rounded-full transition-colors ${activeTooltip === skill.name ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-500'}`}
                   >
                       <Info size={14} />
                   </button>
                )}
             </div>
             <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                <span>{skill.attr}</span>
                {isAffected && (
                   <span className="flex items-center gap-0.5 text-red-600 bg-red-50 px-1 rounded">
                      <Sparkles size={8} /> Bane
                   </span>
                )}
             </div>
          </div>
        </div>

        {/* Value Badge */}
        <div className={`
           flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm shrink-0 border
           ${isAffected 
              ? 'bg-red-100 text-red-700 border-red-200' 
              : 'bg-gray-50 text-gray-900 border-gray-200 group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-100'
           }
        `}>
           {skillValue}
        </div>
      </div>
    );
  };

  const filteredGeneral = filterSkills(generalSkillsForRender);
  const filteredWeapon = filterSkills(weaponSkillsForRender);
  const filteredSecondary = filterSkills(secondarySkills);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={handleBackgroundClick}>
      <div className="bg-gray-50 rounded-2xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0" onClick={handleBackgroundClick}>
          <div>
             <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                <Target className="text-indigo-600" />
                Skill Checks
             </h2>
             <p className="text-sm text-gray-500 mt-1">Select a skill to roll. Target number is your Skill Level.</p>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="relative hidden md:block">
                <input 
                   type="text" 
                   placeholder="Search skills..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="pl-3 pr-8 py-1.5 text-sm bg-gray-100 border-transparent rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all w-48"
                />
             </div>
             <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                <X size={24} />
             </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-indigo-50/50 px-6 py-2 border-b border-indigo-100 flex items-center justify-center md:justify-start gap-2 text-xs font-medium text-indigo-800" onClick={handleBackgroundClick}>
           <CheckSquare size={14} />
           <span>Rolled a 1 (Dragon) or 20 (Demon)? Check the box to mark for advancement.</span>
        </div>
        
        {/* Content Area */}
        {isLoadingInfo ? (
          <div className="flex-grow flex items-center justify-center"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="flex-grow overflow-y-auto p-6 custom-scrollbar" onClick={handleBackgroundClick}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              
              {/* General Skills Column */}
              {(filteredGeneral.length > 0) && (
                  <div className="space-y-3">
                     <h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200">
                        <BookOpen size={16} /> General
                     </h3>
                     <div className="space-y-2">
                        {filteredGeneral.map(renderSkillRow)}
                     </div>
                  </div>
              )}

              {/* Weapon & Secondary Column */}
              {(filteredWeapon.length > 0 || filteredSecondary.length > 0) && (
                  <div className="space-y-8 lg:col-span-2">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {filteredWeapon.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200">
                                    <Swords size={16} /> Weapons
                                </h3>
                                <div className="space-y-2">
                                    {filteredWeapon.map(renderSkillRow)}
                                </div>
                            </div>
                        )}
                        
                        {filteredSecondary.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200">
                                    <Sparkles size={16} /> Magic & Secondary
                                </h3>
                                <div className="space-y-2">
                                    {filteredSecondary.map(renderSkillRow)}
                                </div>
                            </div>
                        )}
                     </div>
                  </div>
              )}

              {filteredGeneral.length === 0 && filteredWeapon.length === 0 && filteredSecondary.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-400">
                      <p>No skills found matching "{searchQuery}"</p>
                  </div>
              )}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {activeTooltip && tooltipPosition && (
            <div 
               style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} 
               className="fixed -translate-x-1/2 -translate-y-[calc(100%+10px)] w-64 p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl z-[70] animate-in fade-in zoom-in-95 duration-200"
               onClick={(e) => e.stopPropagation()} // Prevent clicking tooltip from closing it immediately
            >
               <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
               {skillInfo[activeTooltip]?.description || "No description available."}
            </div>
        )}
      </div>
    </div>
  );
}
