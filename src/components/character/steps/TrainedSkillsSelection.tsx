import React, { useState, useEffect, useMemo } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { useSkills, GameSkill } from '../../../hooks/useSkills';
import { CheckCircle2, AlertCircle, Info, Filter, Loader2 } from 'lucide-react';
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

const combatSkillNames = ['Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'];
const magicSkillNames = ["Animism", "Elementalism", "Mentalism"];

export function TrainedSkillsSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const { skills: allSkills, loading: skillsLoading, error: skillsError } = useSkills();

  const [selectedProfessionSkillNames, setSelectedProfessionSkillNames] = useState<string[]>([]);
  const [selectedAdditionalSkillNames, setSelectedAdditionalSkillNames] = useState<string[]>([]);
  const [step, setStep] = useState<'profession' | 'additional'>('profession');
  const [skillFilter, setSkillFilter] = useState<'all' | 'general' | 'combat' | 'magic'>('all');
  const [loadedProfessionSkillNames, setLoadedProfessionSkillNames] = useState<string[]>([]);
  const [loadingProfessionSkills, setLoadingProfessionSkills] = useState(false);
  const [professionSkillsError, setProfessionSkillsError] = useState<string | null>(null);
  const [allMagicSchools, setAllMagicSchools] = useState<{id: string, name: string}[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // --- NEW: State for the info tooltip ---
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
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
      setProfessionSkillsError(null);
      try {
        const { data, error } = await supabase.from('professions').select('skills').eq('name', character.profession).single();
        if (error) throw error;
        setLoadedProfessionSkillNames(Array.isArray(data?.skills) ? data.skills.filter((s): s is string => typeof s === 'string') : []);
      } catch (err) { setProfessionSkillsError(err instanceof Error ? err.message : 'Failed to load skills.'); }
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
  
  // --- NEW: Memos to separate skills into categories ---
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
  const handleMouseEnter = (e: React.MouseEvent, description: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipContent(description); setTooltipPosition({ top: rect.top, left: rect.left + rect.width / 2 });
  };
  const handleMouseLeave = () => { setTooltipContent(null); setTooltipPosition(null); };
  const handleInfoClick = (e: React.MouseEvent, description: string) => {
    e.stopPropagation();
    if (tooltipContent === description) { handleMouseLeave(); } else { handleMouseEnter(e, description); }
  };

  const renderSkillRow = (skill: GameSkill, type: 'profession' | 'additional') => {
    if (!skill?.id || !skill.name) return null;
    const isSelected = type === 'profession' ? selectedProfessionSkillNames.includes(skill.name) : selectedAdditionalSkillNames.includes(skill.name);
    const limit = type === 'profession' ? 6 : getAgeSkillBonus(character.age || '');
    const currentCount = type === 'profession' ? selectedProfessionSkillNames.length : selectedAdditionalSkillNames.length;
    const isDisabled = currentCount >= limit && !isSelected;

    return (
      <div key={skill.id} onClick={() => !isDisabled && handleSkillSelection(skill.name, type)} className={`flex items-center justify-between p-3 border-b transition-colors ${isDisabled ? 'bg-gray-50 opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
        <div className="flex items-center gap-3">
          <CheckCircle2 className={`w-6 h-6 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`} />
          <div className="flex items-center gap-2">
            <h5 className="font-medium text-gray-800">{skill.name}</h5>
            {skill.description && (
              <div className="p-1" onClick={(e) => handleInfoClick(e, skill.description!)} onMouseEnter={(e) => handleMouseEnter(e, skill.description!)} onMouseLeave={handleMouseLeave}>
                <Info className="w-4 h-4 text-blue-500 cursor-help" />
              </div>
            )}
          </div>
        </div>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{skillAttributeMap[skill.name] || 'N/A'}</span>
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
    <div className="space-y-6" onClick={handleMouseLeave}>
      {/* Header and Progress (largely unchanged) */}
      <div className="prose max-w-none">
        <h3 className="text-xl font-bold mb-2">Select Skills</h3>
        {character.profession && ( <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm"> <p className="text-indigo-800">Profession: <strong>{character.profession}</strong>{character.key_attribute && ` (Key Attribute: ${character.key_attribute})`}{isMage && magicSchoolDisplay && ` (School: ${magicSchoolDisplay})`}</p> <p className="text-indigo-700 mt-1">Age: <strong>{character.age}</strong> (Grants {additionalSkillLimit} additional skill points)</p> </div> )}
        <p className="text-gray-600 text-sm">{step === 'profession' ? `Choose ${professionSkillLimit} skills from your profession's list below.` : `Choose ${additionalSkillLimit} additional skills based on your age (${character.age}).`}</p>
      </div>
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg"> <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" /> <div> <h4 className="font-medium text-blue-800 text-sm">Selection Progress</h4> <p className="text-sm text-blue-700">{step === 'profession' ? `Professional Skills: ${profSkillsCount}/${professionSkillLimit}` : `Additional Skills: ${addSkillsCount}/${additionalSkillLimit}`}</p> </div> </div>

      {/* --- NEW: List-based Rendering with Separated Skill Categories --- */}
      <div className="border rounded-lg bg-white shadow-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {step === 'profession' ? (
          <>
            {professionGeneralSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b">General Skills</h4>
                {professionGeneralSkills.map(skill => renderSkillRow(skill, 'profession'))}
              </div>
            )}
            {professionCombatSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b border-t">Combat Skills</h4>
                {professionCombatSkills.map(skill => renderSkillRow(skill, 'profession'))}
              </div>
            )}
          </>
        ) : (
          <>
            {additionalGeneralSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b">General Skills</h4>
                {additionalGeneralSkills.map(skill => renderSkillRow(skill, 'additional'))}
              </div>
            )}
            {additionalCombatSkills.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 p-3 bg-gray-50 border-b border-t">Combat Skills</h4>
                {additionalCombatSkills.map(skill => renderSkillRow(skill, 'additional'))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Continue Button and Warnings (Unchanged) */}
      {((step === 'profession' && !canContinueProfession && profSkillsCount > 0) || (step === 'additional' && !canContinueAdditional && addSkillsCount > 0)) && ( <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"> <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /> <div> <h4 className="font-medium text-amber-800 text-sm">Incomplete Selection</h4> <p className="text-sm text-amber-700">{step === 'profession' ? `Please select ${professionSkillLimit - profSkillsCount} more skill(s).` : `Please select ${additionalSkillLimit - addSkillsCount} more skill(s).`}</p> </div> </div> )}
      <button onClick={handleContinue} disabled={(step === 'profession' && !canContinueProfession) || (step === 'additional' && !canContinueAdditional) || loadingProfessionSkills} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"> {loadingProfessionSkills ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} {step === 'profession' ? 'Continue to Additional Skills' : 'Confirm Skill Selections'} </button>
    
      {/* Tooltip Render */}
      {tooltipContent && tooltipPosition && ( <div style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px`, }} className="fixed -translate-x-1/2 -translate-y-full mb-2 w-72 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-[60] pointer-events-none"> <p>{tooltipContent}</p> </div> )}
    </div>
  );
}
