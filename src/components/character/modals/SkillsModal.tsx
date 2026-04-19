import React, { useMemo, useState, useEffect } from 'react';
import { X, Info, CheckSquare, Target, Swords, GraduationCap, Sparkles, BookOpen, ShieldAlert } from 'lucide-react';
import { Character, AttributeName } from '../../../types/character';
import { useDice } from '../../dice/useDice';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { supabase } from '../../../lib/supabase';
import { fetchItems, GameItem } from '../../../lib/api/items';
import { useQuery } from '@tanstack/react-query';

interface SkillsModalProps {
  onClose: () => void;
}

// --- Constants ---
const skillAttributeMap: Record<string, AttributeName> = { 'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT', 'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL', 'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT', 'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT', 'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL', 'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR', 'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL', };
const baseSkills = [ 'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft', 'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 'Spot Hidden', 'Swimming' ];
const weaponSkillsList = [ 'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords' ];
const getBaseChance = (value: number): number => { if (value <= 5) return 3; if (value <= 8) return 4; if (value <= 12) return 5; if (value <= 15) return 6; return 7; };
const calculateFallbackLevel = (character: Character, skillName: string, attribute: AttributeName): number => { const isTrained = character.trainedSkills?.includes(skillName) ?? false; const baseValue = character.attributes?.[attribute] ?? 10; const baseChance = getBaseChance(baseValue); return isTrained ? baseChance * 2 : baseChance; };

// --- HELPER: Parse Equipment Banes ---
const getEquipmentBanes = (character: Character, allItems: GameItem[]): string[] => {
    const banes: Set<string> = new Set();
    const equipped = character.equipment?.equipped;
    if (!equipped) return [];

    const checkItem = (itemName: string | undefined) => {
        if (!itemName) return;
        // Find item details (fuzzy match to handle "Plate Armor" vs "Plate Armor (Heavy)")
        const item = allItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
        if (item?.effect) {
            const effectUpper = item.effect.toUpperCase();
            // Regex to find "BANE ON [SKILL1], [SKILL2]..."
            // It looks for the phrase "BANE ON" and then grabs the following text
            if (effectUpper.includes("BANE ON")) {
                // Check against every known skill to see if it's mentioned in the effect text
                Object.keys(skillAttributeMap).forEach(skill => {
                    if (effectUpper.includes(skill.toUpperCase())) {
                        banes.add(skill);
                    }
                });
                
                // Handle "ALL RANGED ATTACKS" -> Bows, Crossbows, Slings
                if (effectUpper.includes("ALL RANGED ATTACKS") || effectUpper.includes("RANGED COMBAT")) {
                    banes.add("Bows");
                    banes.add("Crossbows");
                    banes.add("Slings");
                }
            }
        }
    };

    checkItem(equipped.armor);
    checkItem(equipped.helmet);

    return Array.from(banes);
};

export function SkillsModal({ onClose }: SkillsModalProps) {
  const { toggleDiceRoller } = useDice();
  const { character, updateCharacterData, markSkillThisSession } = useCharacterSheetStore();

  const [skillInfo, setSkillInfo] = useState<Record<string, { description: string }>>({});
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);
  
  const [markedSkills, setMarkedSkills] = useState<Set<string>>(new Set(character?.marked_skills || []));
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Items for Bane calculation
  const { data: allItems = [] } = useQuery<GameItem[]>({ queryKey: ['gameItems'], queryFn: fetchItems, staleTime: Infinity });

  // Calculate Equipment Banes
  const equipmentBanes = useMemo(() => {
      if (!character || allItems.length === 0) return [];
      return getEquipmentBanes(character, allItems);
  }, [character, allItems]);

  useEffect(() => {
    const fetchSkillInfo = async () => { setIsLoadingInfo(true); const { data } = await supabase.from('game_skills').select('name, description'); if (data) { const infoMap = data.reduce((acc, skill) => { acc[skill.name] = { description: skill.description }; return acc; }, {} as Record<string, { description: string }>); setSkillInfo(infoMap); } setIsLoadingInfo(false); };
    fetchSkillInfo();
  }, []);

  useEffect(() => {
    const handleScroll = () => setActiveTooltip(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // --- DERIVED SKILL LISTS ---
  const generalSkillsForRender = useMemo(() => baseSkills.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name)), []);
  const weaponSkillsForRender = useMemo(() => weaponSkillsList.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name)), []);
  const secondarySkills = useMemo(() => {
    if (!character?.skill_levels) return [];
    const skillNames = Object.keys(character.skill_levels);
    const secondarySkillNames = skillNames.filter(name => !baseSkills.includes(name) && !weaponSkillsList.includes(name));
    return secondarySkillNames.map(name => ({ name, attr: skillAttributeMap[name] })).sort((a, b) => a.name.localeCompare(b.name));
  }, [character?.skill_levels]);

  const filterSkills = (skills: { name: string, attr: AttributeName }[]) => {
    if (!searchQuery) return skills;
    return skills.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  if (!character) return <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"><div className="bg-white rounded-xl p-8"><LoadingSpinner size="lg" /></div></div>;

  const getConditionForAttribute = (attr: AttributeName): keyof Character['conditions'] => { return { 'STR': 'exhausted', 'CON': 'sickly', 'AGL': 'dazed', 'INT': 'angry', 'WIL': 'scared', 'CHA': 'disheartened' }[attr] as keyof Character['conditions']; };
  
  const handleSkillClick = (skillName: string, skillValue: number, isAffected: boolean) => { toggleDiceRoller({ initialDice: ['d20'], rollMode: 'skillCheck', targetValue: skillValue, description: `${skillName} Check`, requiresBane: isAffected, skillName, }); onClose(); };
  
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

  const handleInfoClick = (e: React.MouseEvent, skillName: string) => { 
    e.stopPropagation();
    if (activeTooltip === skillName) {
        setActiveTooltip(null);
    } else {
        const layout = getTooltipLayout(e.currentTarget);
        if (!layout) return;
        setActiveTooltip(skillName); 
        setTooltipPosition(layout); 
    }
  };
  
  const handleBackgroundClick = () => { setActiveTooltip(null); };
  const handleKeyboardActivate = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
  
  const handleMarkSkill = (e: React.ChangeEvent<HTMLInputElement>, skillName: string) => {
    e.stopPropagation();
    const newMarkedSkills = new Set(markedSkills);
    if (e.target.checked) { newMarkedSkills.add(skillName); markSkillThisSession(skillName); } 
    else { newMarkedSkills.delete(skillName); }
    setMarkedSkills(newMarkedSkills);
    updateCharacterData({ marked_skills: Array.from(newMarkedSkills) });
  };

  const renderSkillRow = (skill: { name: string; attr: AttributeName }) => {
    const isTrained = character.trainedSkills?.includes(skill.name) ?? false;
    const skillValue = character.skill_levels?.[skill.name] ?? calculateFallbackLevel(character, skill.name, skill.attr);
    
    // Check Condition Bane
    const condition = getConditionForAttribute(skill.attr);
    const hasConditionBane = character.conditions?.[condition] ?? false;
    
    // Check Equipment Bane
    const hasEquipmentBane = equipmentBanes.includes(skill.name);
    
    const isAffected = hasConditionBane || hasEquipmentBane;
    const description = skillInfo[skill.name]?.description;
    const isMarked = markedSkills.has(skill.name);

    return (
      <div
        key={skill.name}
        className={`
            group relative flex items-center justify-between p-3 rounded-lg border transition-all duration-200 cursor-pointer select-none
            ${isAffected 
                ? 'bg-red-50 border-red-200 hover:border-red-300 hover:shadow-sm' 
                : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md hover:translate-y-[-1px]'
            }
        `}
        onClick={() => handleSkillClick(skill.name, skillValue, isAffected)}
        onKeyDown={(event) => handleKeyboardActivate(event, () => handleSkillClick(skill.name, skillValue, isAffected))}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
             <input type="checkbox" checked={isMarked} onClick={(event) => event.stopPropagation()} onChange={(e) => handleMarkSkill(e, skill.name)} className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded bg-white checked:bg-indigo-600 checked:border-indigo-600 focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400 cursor-pointer transition-colors" title="Mark for advancement"/>
             <CheckSquare size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
          </div>

          <div className="flex flex-col min-w-0">
             <div className="flex items-center gap-1.5">
                <span className={`text-sm truncate ${isTrained ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{skill.name}</span>
                {isTrained && <GraduationCap size={12} className="text-indigo-500 shrink-0" title="Trained Skill"/>}
                {description && (
                   <button type="button" onClick={(e) => handleInfoClick(e, skill.name)} className={`p-1 -m-1 rounded-full transition-colors ${activeTooltip === skill.name ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-500'}`}><Info size={14} /></button>
                )}
             </div>
             <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                <span>{skill.attr}</span>
                {/* Visual Indicators for Bane Source */}
                {hasConditionBane && (
                   <span className="flex items-center gap-0.5 text-red-600 bg-red-100 px-1 rounded border border-red-200" title={`Bane from ${condition} condition`}>
                      <Sparkles size={8} /> Condition
                   </span>
                )}
                {hasEquipmentBane && (
                   <span className="flex items-center gap-0.5 text-orange-700 bg-orange-100 px-1 rounded border border-orange-200" title="Bane from Armor/Helmet">
                      <ShieldAlert size={8} /> Armor
                   </span>
                )}
             </div>
          </div>
        </div>

        <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm shrink-0 border ${isAffected ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-50 text-gray-900 border-gray-200 group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-100'}`}>
           {skillValue}
        </div>
      </div>
    );
  };

  const filteredGeneral = filterSkills(generalSkillsForRender);
  const filteredWeapon = filterSkills(weaponSkillsForRender);
  const filteredSecondary = filterSkills(secondarySkills);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
      <div className="skills-modal-shell bg-gray-50 rounded-2xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200" onClick={(e) => e.stopPropagation()} onKeyDown={(event) => handleKeyboardActivate(event, () => {})} role="button" tabIndex={0}>
        <div className="skills-modal-header px-6 py-4 bg-white border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
          <div className="skills-modal-heading"><h2 className="text-xl font-black text-gray-800 flex items-center gap-2"><Target className="text-indigo-600" />Skill Checks</h2><p className="text-sm text-gray-500 mt-1">Select a skill to roll. Target number is your Skill Level.</p></div>
          <div className="skills-modal-toolbar flex items-center gap-3">
             <div className="relative hidden md:block"><input type="text" placeholder="Search skills..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-3 pr-8 py-1.5 text-sm bg-gray-100 border-transparent rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all w-48"/></div>
             <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
          </div>
        </div>
        <div className="skills-modal-banner bg-indigo-50/50 px-6 py-2 border-b border-indigo-100 flex items-center justify-center md:justify-start gap-2 text-xs font-medium text-indigo-800" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}><CheckSquare size={14} /><span>Rolled a 1 (Dragon) or 20 (Demon)? Check the box to mark for advancement.</span></div>
        
        {isLoadingInfo ? <div className="flex-grow flex items-center justify-center"><LoadingSpinner size="lg" /></div> : (
          <div className="skills-modal-body flex-grow overflow-y-auto p-6 custom-scrollbar" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
            <div className="skills-modal-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {(filteredGeneral.length > 0) && (<div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200"><BookOpen size={16} /> General</h3><div className="space-y-2">{filteredGeneral.map(renderSkillRow)}</div></div>)}
              {(filteredWeapon.length > 0 || filteredSecondary.length > 0) && (<div className="space-y-8 lg:col-span-2"><div className="grid grid-cols-1 lg:grid-cols-2 gap-8">{filteredWeapon.length > 0 && (<div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200"><Swords size={16} /> Weapons</h3><div className="space-y-2">{filteredWeapon.map(renderSkillRow)}</div></div>)}{filteredSecondary.length > 0 && (<div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200"><Sparkles size={16} /> Magic & Secondary</h3><div className="space-y-2">{filteredSecondary.map(renderSkillRow)}</div></div>)}</div></div>)}
              {filteredGeneral.length === 0 && filteredWeapon.length === 0 && filteredSecondary.length === 0 && (<div className="col-span-full text-center py-12 text-gray-400"><p>No skills found matching "{searchQuery}"</p></div>)}
            </div>
          </div>
        )}
        {activeTooltip && tooltipPosition && (<div style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} className={`fixed -translate-x-1/2 w-64 max-w-[calc(100vw-1.5rem)] max-h-[min(18rem,calc(100vh-1.5rem))] overflow-y-auto p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl z-[70] animate-in fade-in zoom-in-95 duration-200 ${tooltipPosition.placement === 'top' ? '-translate-y-[calc(100%+10px)]' : 'translate-y-[10px]'}`} onClick={(e) => e.stopPropagation()} onKeyDown={(event) => handleKeyboardActivate(event, () => {})} role="button" tabIndex={0}>{tooltipPosition.placement === 'top' ? <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" /> : <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />}{skillInfo[activeTooltip]?.description || "No description available."}</div>)}
      </div>
      <style>{`
        @media (orientation: landscape) and (max-width: 932px) and (max-height: 540px) {
          .skills-modal-shell {
            height: 100vh;
            max-width: 100vw;
            border-radius: 0;
            border-width: 0;
          }

          .skills-modal-header {
            padding: 0.75rem 0.9rem;
            gap: 0.65rem;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: start;
          }

          .skills-modal-heading h2 {
            font-size: 1rem;
            line-height: 1.1;
          }

          .skills-modal-heading p {
            margin-top: 0.25rem;
            font-size: 0.72rem;
            line-height: 1.2;
          }

          .skills-modal-toolbar {
            gap: 0.4rem;
            align-self: start;
          }

          .skills-modal-toolbar .hidden.md\\:block {
            display: block;
          }

          .skills-modal-toolbar input {
            width: 10rem;
            padding-top: 0.45rem;
            padding-bottom: 0.45rem;
            font-size: 0.75rem;
          }

          .skills-modal-banner {
            padding: 0.45rem 0.9rem;
            font-size: 0.68rem;
            line-height: 1.2;
          }

          .skills-modal-body {
            padding: 0.9rem;
          }

          .skills-modal-grid {
            gap: 0.85rem;
          }

          .skills-modal-grid h3 {
            font-size: 0.65rem;
            padding-bottom: 0.35rem;
          }

          .skills-modal-grid .space-y-2 > div[role="button"] {
            padding: 0.55rem 0.65rem;
            gap: 0.5rem;
          }

          .skills-modal-grid .space-y-2 > div[role="button"] .text-sm {
            font-size: 0.78rem;
            line-height: 1.05rem;
          }

          .skills-modal-grid .space-y-2 > div[role="button"] .w-8.h-8 {
            width: 1.8rem;
            height: 1.8rem;
            font-size: 0.72rem;
          }

          .skills-modal-grid .space-y-2 > div[role="button"] .w-5.h-5 {
            width: 1rem;
            height: 1rem;
          }

          .skills-modal-grid .space-y-2 > div[role="button"] .text-\\[10px\\] {
            font-size: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
