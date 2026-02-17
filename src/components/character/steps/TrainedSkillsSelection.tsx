import React, { useState, useEffect, useMemo } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { useSkills, GameSkill } from '../../../hooks/useSkills';
import { CheckCircle2, AlertCircle, Info, Loader2, X, Dices } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';
import { AttributeName } from '../../../types/character';

const getAgeSkillBonus = (age: string) => {
  switch (age) { case 'Young': return 2; case 'Adult': return 4; case 'Old': return 6; default: return 0; }
};

const skillAttributeMap: Record<string, AttributeName> = {
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT',
    'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL',
    'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT',
    'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL',
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR',
    'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR',
    'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL'
};

// Base Chance Calculation
const getBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const combatSkillNames = ['Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'];
const magicSkillNames = ["Animism", "Elementalism", "Mentalism"];

export function TrainedSkillsSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const { skills: allSkills, loading: skillsLoading, error: skillsError } = useSkills();

  const [selectedProfessionSkillNames, setSelectedProfessionSkillNames] = useState<string[]>([]);
  const [selectedAdditionalSkillNames, setSelectedAdditionalSkillNames] = useState<string[]>([]);
  const [step, setStep] = useState<'profession' | 'additional'>('profession');
  const [loadedProfessionSkillNames, setLoadedProfessionSkillNames] = useState<string[]>([]);
  const [loadingProfessionSkills, setLoadingProfessionSkills] = useState(false);
  const [allMagicSchools, setAllMagicSchools] = useState<{id: string, name: string}[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [showInfoPane, setShowInfoPane] = useState(true);

  // --- Mobile Friendly Tooltip State ---
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const isMage = useMemo(() => character.profession?.toLowerCase().includes('mage'), [character.profession]);

  useEffect(() => {
    if (isMage) {
      setLoadingSchools(true);
      supabase.from('magic_schools').select('id, name')
        .then(({ data, error }) => { if (error) throw error; setAllMagicSchools(data || []); })
        .catch(err => console.error("Failed to fetch magic schools:", err))
        .finally(() => setLoadingSchools(false));
    }
  }, [isMage]);

  // Close tooltip on scroll
  useEffect(() => {
    const handleScroll = () => setActiveTooltip(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);
  
  const magicSchoolDisplay = useMemo(() => {
    const schoolValue = character.magicSchool;
    if (typeof schoolValue === 'object' && schoolValue !== null && 'name' in schoolValue) return schoolValue.name as string;
    if (typeof schoolValue === 'string' && allMagicSchools.length > 0) return allMagicSchools.find(s => s.id === schoolValue)?.name ?? null;
    return null;
  }, [character.magicSchool, allMagicSchools]);

  useEffect(() => {
    async function fetchProfessionSkillNames() {
      if (!character.profession) return;
      setLoadingProfessionSkills(true);
      try {
        const { data, error } = await supabase.from('professions').select('skills').eq('name', character.profession).single();
        if (error) throw error;
        setLoadedProfessionSkillNames(Array.isArray(data?.skills) ? data.skills.filter((s): s is string => typeof s === 'string') : []);
      } catch (err) { console.error('Failed to load profession skills:', err); }
      finally { setLoadingProfessionSkills(false); }
    }
    fetchProfessionSkillNames();
  }, [character.profession]);

  const availableProfessionSkillsData = useMemo(() => {
    if (skillsLoading || loadingProfessionSkills || !Array.isArray(allSkills)) return [];
    return allSkills.filter(skill => skill && loadedProfessionSkillNames.includes(skill.name));
  }, [allSkills, skillsLoading, loadingProfessionSkills, loadedProfessionSkillNames]);
  
  const availableAdditionalSkills = useMemo(() => {
    if (skillsLoading || !Array.isArray(allSkills)) return [];
    const basePool = allSkills.filter(skill => skill && !selectedProfessionSkillNames.includes(skill.name));
    if (isMage && magicSchoolDisplay) return basePool.filter(skill => !magicSkillNames.includes(skill.name) || skill.name === magicSchoolDisplay);
    return basePool.filter(skill => !magicSkillNames.includes(skill.name));
  }, [allSkills, skillsLoading, selectedProfessionSkillNames, isMage, magicSchoolDisplay]);
  
  // --- Memos to separate skills into categories ---
  const filterSkills = (skills: GameSkill[], isCombat: boolean) => skills.filter(s => combatSkillNames.includes(s.name) === isCombat);

  const professionGeneralSkills = useMemo(() => filterSkills(availableProfessionSkillsData, false), [availableProfessionSkillsData]);
  const professionCombatSkills = useMemo(() => filterSkills(availableProfessionSkillsData, true), [availableProfessionSkillsData]);

  const additionalGeneralSkills = useMemo(() => filterSkills(availableAdditionalSkills, false), [availableAdditionalSkills]);
  const additionalCombatSkills = useMemo(() => filterSkills(availableAdditionalSkills, true), [availableAdditionalSkills]);

  const handleSkillSelection = (skillName: string, type: 'profession' | 'additional') => {
    const limit = type === 'profession' ? 6 : getAgeSkillBonus(character.age || '');
    const stateSetter = type === 'profession' ? setSelectedProfessionSkillNames : setSelectedAdditionalSkillNames;
    stateSetter(prev => prev.includes(skillName) ? prev.filter(name => name !== skillName) : (prev.length < limit ? [...prev, skillName] : prev));
  };
  
  const handleContinue = () => {
    if (step === 'profession' && selectedProfessionSkillNames.length === 6) { setStep('additional'); }
    else if (step === 'additional' && selectedAdditionalSkillNames.length === getAgeSkillBonus(character.age || '')) {
      updateCharacter({ trainedSkills: [...new Set([...selectedProfessionSkillNames, ...selectedAdditionalSkillNames])] });
    }
  };

  // --- NEW: Tooltip handlers ---
  const handleInfoClick = (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation(); // Prevent triggering row selection
    if (activeTooltip === skillId) {
      setActiveTooltip(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      let leftPos = rect.left + rect.width / 2;
      
      // Boundary check to keep on screen
      if (leftPos < 140) leftPos = 140; 
      if (leftPos > window.innerWidth - 140) leftPos = window.innerWidth - 140;

      setTooltipPosition({ top: rect.top, left: leftPos });
      setActiveTooltip(skillId);
    }
  };

  const handleBackgroundClick = () => {
    setActiveTooltip(null);
  };
  const handleKeyboardActivate = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  // Helper to find description for active tooltip
  const getActiveDescription = () => {
    if (!activeTooltip) return null;
    const skill = allSkills.find(s => s.id === activeTooltip);
    return skill?.description;
  };

  // Helper to get current skill value based on selection
  const getSkillValue = (skillName: string, isSelected: boolean) => {
      const attribute = skillAttributeMap[skillName];
      const attrValue = character.attributes?.[attribute] ?? 10;
      const baseChance = getBaseChance(attrValue);
      return isSelected ? baseChance * 2 : baseChance;
  };

  const renderSkillRow = (skill: GameSkill, type: 'profession' | 'additional') => {
    if (!skill?.id || !skill.name) return null;
    const isSelected = type === 'profession' ? selectedProfessionSkillNames.includes(skill.name) : selectedAdditionalSkillNames.includes(skill.name);
    const limit = type === 'profession' ? 6 : getAgeSkillBonus(character.age || '');
    const currentCount = type === 'profession' ? selectedProfessionSkillNames.length : selectedAdditionalSkillNames.length;
    const isDisabled = currentCount >= limit && !isSelected;

    const skillValue = getSkillValue(skill.name, isSelected);

    return (
      <div
        key={skill.id}
        onClick={() => !isDisabled && handleSkillSelection(skill.name, type)}
        onKeyDown={(event) => {
          if (!isDisabled) {
            handleKeyboardActivate(event, () => handleSkillSelection(skill.name, type));
          }
        }}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        className={`flex items-center justify-between p-3 border-b transition-colors ${isDisabled ? 'bg-gray-50 opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className={`w-6 h-6 flex-shrink-0 transition-colors ${isSelected ? 'text-blue-600 fill-blue-50' : 'text-gray-300'}`} />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <h5 className="font-medium text-gray-800">{skill.name}</h5>
                {skill.description && (
                <button
                    type="button"
                    onClick={(e) => handleInfoClick(e, skill.id)}
                    className={`p-1 -m-1 rounded-full transition-colors ${activeTooltip === skill.id ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-500'}`}
                >
                    <Info size={14} />
                </button>
                )}
            </div>
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{skillAttributeMap[skill.name] || 'N/A'}</span>
          </div>
        </div>
        
        {/* Skill Value Badge */}
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm border ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {skillValue}
        </div>
      </div>
    );
  };
  
  if (skillsLoading || loadingSchools) return <LoadingSpinner size="lg" className="my-8" />;
  if (skillsError) return <ErrorMessage message={`Skills Error: ${skillsError}`} />;
  if (!character.profession || !character.age) return <div className="p-6 text-center"><p className="text-gray-600">Please select a profession and age first.</p></div>;
  if (isMage && !magicSchoolDisplay) return <div className="p-6"><div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg"><AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-amber-800">Magic School Required</h4><p className="text-sm text-amber-700">As a Mage, please select a magic school first.</p></div></div></div>;

  const profSkillsCount = selectedProfessionSkillNames.length; const addSkillsCount = selectedAdditionalSkillNames.length;
  const professionSkillLimit = 6; const additionalSkillLimit = getAgeSkillBonus(character.age);
  const canContinueProfession = profSkillsCount === professionSkillLimit; const canContinueAdditional = addSkillsCount === additionalSkillLimit;

  return (
    <div className="space-y-6" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
      {/* Header and Progress */}
      <div className="prose max-w-none">
        <h3 className="text-xl font-bold mb-2">Select Skills</h3>
        {character.profession && ( <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm"> <p className="text-indigo-800">Profession: <strong>{character.profession}</strong>{character.key_attribute && ` (Key Attribute: ${character.key_attribute})`}{isMage && magicSchoolDisplay && ` (School: ${magicSchoolDisplay})`}</p> <p className="text-indigo-700 mt-1">Age: <strong>{character.age}</strong> (Grants {additionalSkillLimit} additional skill points)</p> </div> )}
        <p className="text-gray-600 text-sm">{step === 'profession' ? `Choose ${professionSkillLimit} skills from your profession's list below.` : `Choose ${additionalSkillLimit} additional skills based on your age (${character.age}).`}</p>
      </div>

      {/* Info Pane */}
      {showInfoPane && (
          <div className="relative p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
              <Dices className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                  <p className="font-bold mb-1">How Skill Rolls Work</p>
                  <p className="leading-relaxed">
                      To succeed, you must roll <strong>equal to or lower</strong> than your Skill Level on a D20.
                      <br/>
                      <span className="text-blue-700 mt-1 block">
                          <strong>Base Chance:</strong> Derived from your attribute score. <br/>
                          <strong>Trained Skill:</strong> Doubles your base chance.
                      </span>
                  </p>
              </div>
              <button onClick={() => setShowInfoPane(false)} className="absolute top-2 right-2 text-blue-400 hover:text-blue-700"><X size={16} /></button>
          </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-gray-100 border border-gray-200 rounded-lg"> 
          <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" /> 
          <div> 
              <h4 className="font-bold text-gray-700 text-sm">Selection Progress</h4> 
              <p className="text-sm text-gray-600">{step === 'profession' ? `Professional Skills: ${profSkillsCount}/${professionSkillLimit}` : `Additional Skills: ${addSkillsCount}/${additionalSkillLimit}`}</p> 
          </div> 
      </div>

      {/* --- List-based Rendering with Separated Skill Categories --- */}
      <div className="border rounded-lg bg-white shadow-sm overflow-hidden" onClick={(e) => e.stopPropagation()} onKeyDown={(event) => handleKeyboardActivate(event, () => {})} role="button" tabIndex={0}>
        {step === 'profession' ? (
          <>
            {professionGeneralSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b text-sm uppercase tracking-wide">General Skills</h4>
                {professionGeneralSkills.map(skill => renderSkillRow(skill, 'profession'))}
              </div>
            )}
            {professionCombatSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b border-t text-sm uppercase tracking-wide">Combat Skills</h4>
                {professionCombatSkills.map(skill => renderSkillRow(skill, 'profession'))}
              </div>
            )}
          </>
        ) : (
          <>
            {additionalGeneralSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b text-sm uppercase tracking-wide">General Skills</h4>
                {additionalGeneralSkills.map(skill => renderSkillRow(skill, 'additional'))}
              </div>
            )}
            {additionalCombatSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b border-t text-sm uppercase tracking-wide">Combat Skills</h4>
                {additionalCombatSkills.map(skill => renderSkillRow(skill, 'additional'))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Continue Button and Warnings */}
      {((step === 'profession' && !canContinueProfession && profSkillsCount > 0) || (step === 'additional' && !canContinueAdditional && addSkillsCount > 0)) && ( <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"> <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /> <div> <h4 className="font-medium text-amber-800 text-sm">Incomplete Selection</h4> <p className="text-sm text-amber-700">{step === 'profession' ? `Please select ${professionSkillLimit - profSkillsCount} more skill(s).` : `Please select ${additionalSkillLimit - addSkillsCount} more skill(s).`}</p> </div> </div> )}
      <button onClick={handleContinue} disabled={(step === 'profession' && !canContinueProfession) || (step === 'additional' && !canContinueAdditional) || loadingProfessionSkills} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"> {loadingProfessionSkills ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} {step === 'profession' ? 'Continue to Additional Skills' : 'Confirm Skill Selections'} </button>
    
      {/* Tooltip Render */}
      {activeTooltip && tooltipPosition && ( 
        <div 
          style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} 
          className="fixed -translate-x-1/2 -translate-y-[calc(100%+10px)] w-72 p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl z-[60] animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
        > 
          <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
          {getActiveDescription() || "No description available."}
        </div> 
      )}
    </div>
  );
}
