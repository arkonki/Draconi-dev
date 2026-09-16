import React, { useMemo, useState, useEffect } from 'react';
import { Info, CheckSquare, Target, Swords, GraduationCap, Sparkles, BookOpen, ShieldAlert } from 'lucide-react';
import { Character, AttributeName } from '../../../types/character';
import { useDice } from '../../dice/useDice';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { supabase } from '../../../lib/supabase';
import { fetchItems, GameItem } from '../../../lib/api/items';
import { useQuery } from '@tanstack/react-query';
import { AccessibleDialog } from '../../shared/AccessibleDialog';

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
            group relative flex min-h-14 items-center gap-2 rounded-lg border p-2 transition-all duration-200
            ${isAffected 
                ? 'bg-red-50 border-red-200 hover:border-red-300 hover:shadow-sm' 
                : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md hover:translate-y-[-1px]'
            }
        `}
      >
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
             <input type="checkbox" checked={isMarked} onChange={(e) => handleMarkSkill(e, skill.name)} className="peer h-6 w-6 cursor-pointer appearance-none rounded border-2 border-gray-300 bg-white transition-colors checked:border-indigo-600 checked:bg-indigo-600 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1" aria-label={`Mark ${skill.name} for advancement`}/>
             <CheckSquare size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
          </div>

        <button type="button" onClick={() => handleSkillClick(skill.name, skillValue, isAffected)} className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <div className="flex min-w-0 flex-col">
             <div className="flex items-center gap-1.5">
                <span className={`text-sm truncate ${isTrained ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{skill.name}</span>
                {isTrained && <GraduationCap size={12} className="text-indigo-500 shrink-0" title="Trained Skill"/>}
             </div>
             <div className="flex flex-wrap items-center gap-2 text-xs uppercase font-bold tracking-wider text-gray-500">
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
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${isAffected ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-50 text-gray-900 border-gray-200 group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-100'}`}>
           {skillValue}
          </div>
        </button>
        {description && (
          <button type="button" onClick={(e) => handleInfoClick(e, skill.name)} aria-label={`About ${skill.name}`} aria-expanded={activeTooltip === skill.name} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${activeTooltip === skill.name ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}><Info size={17} /></button>
        )}
      </div>
    );
  };

  const filteredGeneral = filterSkills(generalSkillsForRender);
  const filteredWeapon = filterSkills(weaponSkillsForRender);
  const filteredSecondary = filterSkills(secondarySkills);

  return (
    <AccessibleDialog
      onClose={onClose}
      title="Skill Checks"
      description="Select a skill to roll. The target number is your skill level."
      icon={<Target className="h-6 w-6 text-indigo-600" />}
      size="xl"
      fullScreenMobile
      panelClassName="sm:h-[88dvh] border border-gray-200 bg-gray-50"
      bodyClassName="flex flex-col bg-gray-50"
      actions={(
        <input
          type="search"
          aria-label="Search skills"
          placeholder="Search skills…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="h-11 w-32 rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm outline-none transition-all focus:w-48 focus:bg-white focus:ring-2 focus:ring-indigo-500 sm:w-48"
        />
      )}
    >
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-indigo-100 bg-indigo-50/70 px-4 py-2 text-xs font-medium text-indigo-800 sm:justify-start sm:px-6">
        <CheckSquare size={14} /><span>Use the checkbox to mark a Dragon or Demon for advancement.</span>
      </div>
      {isLoadingInfo ? (
        <div className="flex flex-1 items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="flex-1 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
            {filteredGeneral.length > 0 && <div className="space-y-3"><h3 className="flex items-center gap-2 border-b border-gray-200 pb-2 text-sm font-bold uppercase tracking-widest text-gray-500"><BookOpen size={16} /> General</h3><div className="space-y-2">{filteredGeneral.map(renderSkillRow)}</div></div>}
            {(filteredWeapon.length > 0 || filteredSecondary.length > 0) && <div className="space-y-6 xl:col-span-2"><div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">{filteredWeapon.length > 0 && <div className="space-y-3"><h3 className="flex items-center gap-2 border-b border-gray-200 pb-2 text-sm font-bold uppercase tracking-widest text-gray-500"><Swords size={16} /> Weapons</h3><div className="space-y-2">{filteredWeapon.map(renderSkillRow)}</div></div>}{filteredSecondary.length > 0 && <div className="space-y-3"><h3 className="flex items-center gap-2 border-b border-gray-200 pb-2 text-sm font-bold uppercase tracking-widest text-gray-500"><Sparkles size={16} /> Magic & Secondary</h3><div className="space-y-2">{filteredSecondary.map(renderSkillRow)}</div></div>}</div></div>}
            {filteredGeneral.length === 0 && filteredWeapon.length === 0 && filteredSecondary.length === 0 && <div className="col-span-full py-12 text-center text-gray-500"><p>No skills found matching “{searchQuery}”.</p></div>}
          </div>
        </div>
      )}
      {activeTooltip && tooltipPosition && (
        <div role="tooltip" style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} className={`fixed z-[110] w-64 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-y-auto rounded-lg bg-gray-900 p-3 text-sm leading-relaxed text-white shadow-xl ${tooltipPosition.placement === 'top' ? '-translate-y-[calc(100%+10px)]' : 'translate-y-[10px]'}`}>
          {skillInfo[activeTooltip]?.description || 'No description available.'}
        </div>
      )}
    </AccessibleDialog>
  );
}
