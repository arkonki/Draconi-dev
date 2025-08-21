import React, { useState, useEffect, useMemo } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { useSkills, GameSkill } from '../../../hooks/useSkills'; // Import useSkills and GameSkill
import { CheckCircle2, AlertCircle, Info, Filter, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';

const getAgeSkillBonus = (age: string) => {
  switch (age) {
    case 'Young': return 2;
    case 'Adult': return 4;
    case 'Old': return 6;
    default: return 0;
  }
};

// Define skill names for filtering (ensure these match names in game_skills table)
const magicSkillNames = ["Animism", "Elementalism", "Mentalism"];
const combatSkillNames = ['Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'];

export function TrainedSkillsSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const { skills: allSkills, loading: skillsLoading, error: skillsError } = useSkills();

  // --- State Management: Explicitly use skill NAMES (string[]) ---
  const [selectedProfessionSkillNames, setSelectedProfessionSkillNames] = useState<string[]>([]);
  const [selectedAdditionalSkillNames, setSelectedAdditionalSkillNames] = useState<string[]>([]);
  // --- End State Management ---

  const [step, setStep] = useState<'profession' | 'additional'>('profession');
  const [skillFilter, setSkillFilter] = useState<'all' | 'combat' | 'general' | 'magic'>('all');
  const [loadedProfessionSkillNames, setLoadedProfessionSkillNames] = useState<string[]>([]); // Store names from profession data
  const [loadingProfessionSkills, setLoadingProfessionSkills] = useState(false);
  const [professionSkillsError, setProfessionSkillsError] = useState<string | null>(null);

  const isMage = useMemo(() => character.profession?.toLowerCase().includes('mage'), [character.profession]);

  // Helper to safely get the magic school display value
  const getMagicSchoolDisplay = (school: unknown): string | null => {
    if (typeof school === 'string') return school;
    if (typeof school === 'object' && school !== null) {
      if ('name' in school && typeof school.name === 'string') return school.name;
      if ('id' in school && typeof school.id === 'string') return school.id;
    }
    return null;
  };
  const magicSchoolDisplay = getMagicSchoolDisplay(character.magicSchool);

  // Load profession-specific skill NAMES
  useEffect(() => {
    async function fetchProfessionSkillNames() {
      if (!character.profession) {
        setLoadedProfessionSkillNames([]);
        return;
      }
      setLoadingProfessionSkills(true);
      setProfessionSkillsError(null);
      try {
        const { data, error } = await supabase
          .from('professions')
          .select('skills')
          .eq('name', character.profession)
          .single();

        if (error) throw new Error(`Failed to load skills for profession: ${character.profession}. ${error.message}`);

        const professionSkillNameList = Array.isArray(data?.skills)
          ? data.skills.filter((s): s is string => typeof s === 'string')
          : [];
        setLoadedProfessionSkillNames(professionSkillNameList);

      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred loading profession skills.';
        setProfessionSkillsError(message);
        setLoadedProfessionSkillNames([]);
      } finally {
        setLoadingProfessionSkills(false);
      }
    }
    fetchProfessionSkillNames();
  }, [character.profession]);

  // Filter available profession skills (returns GameSkill[])
  const availableProfessionSkillsData: GameSkill[] = useMemo(() => {
    if (skillsLoading || loadingProfessionSkills || !Array.isArray(allSkills) || !Array.isArray(loadedProfessionSkillNames)) return [];
    return allSkills.filter(skill =>
        skill && typeof skill.name === 'string' && loadedProfessionSkillNames.includes(skill.name)
    );
  }, [allSkills, skillsLoading, loadingProfessionSkills, loadedProfessionSkillNames]);

  // Get remaining skills for additional selection (returns GameSkill[])
  const remainingSkillsData: GameSkill[] = useMemo(() => {
    if (skillsLoading || !Array.isArray(allSkills)) return [];

    // Start with all skills, then filter down
    let available = allSkills.filter(skill => {
      if (!skill || typeof skill.name !== 'string') return false; // Basic skill validation

      // Exclude skills already selected in the 'profession' step from the 'additional' step's pool
      if (selectedProfessionSkillNames.includes(skill.name)) {
        // If this skill is also selected as an additional skill (edge case, shouldn't happen if UI logic is correct),
        // do not filter it out here, let it be handled by selection logic.
        // However, generally, profession skills are not re-selectable as additional.
        return false;
      }
      return true;
    });

    // Filter out magic skills if not a mage (applies to the remaining pool)
    if (!isMage) {
      available = available.filter(skill => !magicSkillNames.includes(skill.name));
    }

    // Apply category filter (applies to the remaining pool)
    switch (skillFilter) {
      case 'combat':
        return available.filter(skill => combatSkillNames.includes(skill.name));
      case 'general':
        return available.filter(skill => !combatSkillNames.includes(skill.name) && !magicSkillNames.includes(skill.name));
      case 'magic':
        // Only return magic skills if mage
        return isMage ? available.filter(skill => magicSkillNames.includes(skill.name)) : [];
      case 'all':
      default:
        return available;
    }
  }, [allSkills, skillsLoading, selectedProfessionSkillNames, skillFilter, isMage]);


  // Check character.trainedSkills integrity (ensure it's string[])
  useEffect(() => {
    if (character.trainedSkills && !Array.isArray(character.trainedSkills)) {
      console.error("CRITICAL: character.trainedSkills in store is not an array!", character.trainedSkills);
    } else if (character.trainedSkills) {
      const nonStrings = character.trainedSkills.filter(item => typeof item !== 'string');
      if (nonStrings.length > 0) {
        console.error("CRITICAL: character.trainedSkills in store contains non-string items!", nonStrings);
      }
    }
  }, [character.trainedSkills]);


  // --- Skill Selection Logic: Operates on skill NAMES ---
  const handleSkillSelection = (skillName: string, type: 'profession' | 'additional') => {
     if (typeof skillName !== 'string' || !skillName) {
       console.error("Invalid skillName passed to handleSkillSelection:", skillName);
       return;
     }

    if (type === 'profession') {
      const limit = 6;
      if (selectedProfessionSkillNames.includes(skillName)) {
        setSelectedProfessionSkillNames(prev => prev.filter(name => name !== skillName));
      } else if (selectedProfessionSkillNames.length < limit) {
        setSelectedProfessionSkillNames(prev => [...prev, skillName]);
      }
    } else { // type === 'additional'
      const limit = getAgeSkillBonus(character.age || '');
      if (selectedAdditionalSkillNames.includes(skillName)) {
        setSelectedAdditionalSkillNames(prev => prev.filter(name => name !== skillName));
      } else if (selectedAdditionalSkillNames.length < limit) {
        setSelectedAdditionalSkillNames(prev => [...prev, skillName]);
      }
    }
  };
  // --- End Skill Selection Logic ---

  // --- Continue/Save Logic: Saves skill NAMES ---
  const handleContinue = () => {
    if (step === 'profession' && selectedProfessionSkillNames.length === 6) {
      setStep('additional');
    } else if (step === 'additional' && selectedAdditionalSkillNames.length === getAgeSkillBonus(character.age || '')) {
      const finalSkillNames = [...new Set([...selectedProfessionSkillNames, ...selectedAdditionalSkillNames])];
      if (finalSkillNames.every(s => typeof s === 'string')) {
        updateCharacter({ trainedSkills: finalSkillNames });
        console.log("Skills saved to character state (names):", finalSkillNames);
      } else {
         console.error("CRITICAL: Attempted to save non-string skills to character state!", finalSkillNames);
      }
    }
  };
  // --- End Continue/Save Logic ---

  // Render Skill Card: Takes GameSkill, checks selection using skill.name
  const renderSkillCard = (skill: GameSkill, type: 'profession' | 'additional') => {
    if (!skill || typeof skill !== 'object' || typeof skill.id !== 'string' || typeof skill.name !== 'string') {
      console.error("Invalid skill object passed to renderSkillCard:", skill);
      return <div className="p-4 border border-red-500 rounded-lg bg-red-50 text-red-700">Invalid Skill Data</div>;
    }

    const skillName = skill.name;
    const description = (typeof skill.description === 'string') ? skill.description : null;
    const attribute = (typeof skill.attribute === 'string') ? skill.attribute : null;

    const isSelected = type === 'profession'
        ? selectedProfessionSkillNames.includes(skillName)
        : selectedAdditionalSkillNames.includes(skillName);

    const profLimitReached = selectedProfessionSkillNames.length >= 6;
    const addLimitReached = selectedAdditionalSkillNames.length >= getAgeSkillBonus(character.age || '');
    const isDisabled =
        (type === 'profession' && profLimitReached && !isSelected) ||
        (type === 'additional' && addLimitReached && !isSelected);

    return (
      <div
        key={skill.id}
        onClick={() => !isDisabled && handleSkillSelection(skillName, type)}
        className={`p-4 border rounded-lg transition-all ${
          isDisabled ? 'bg-gray-100 opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${
          isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
          <div className="flex-grow">
            <h5 className="font-medium">{skillName}</h5>
            {attribute && (
              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {attribute}
              </span>
            )}
          </div>
        </div>
        {description && (
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        )}
      </div>
    );
  };

  // --- Loading and Error States ---
  if (skillsLoading) return <LoadingSpinner size="lg" className="my-8" />;
  if (skillsError) return <ErrorMessage message={`Skills Error: ${skillsError}`} onClose={() => { /* Optional */ }} />;
  if (!character.profession || !character.age) {
    return <div className="p-6 text-center"><p className="text-gray-600">Please select a profession and age first.</p></div>;
  }
  if (isMage && !character.magicSchool) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div><h4 className="font-medium text-amber-800">Magic School Required</h4><p className="text-sm text-amber-700">As a Mage, please select a magic school first.</p></div>
        </div>
      </div>
    );
  }

  const profSkillsCount = selectedProfessionSkillNames.length;
  const addSkillsCount = selectedAdditionalSkillNames.length;
  const professionSkillLimit = 6;
  const additionalSkillLimit = getAgeSkillBonus(character.age);
  const canContinueProfession = profSkillsCount === professionSkillLimit;
  const canContinueAdditional = addSkillsCount === additionalSkillLimit;

  return (
    <div className="space-y-6">
      {/* Header & Instructions */}
      <div className="prose max-w-none">
        <h3 className="text-xl font-bold mb-2">Select Skills</h3>
        {character.profession && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
            <p className="text-indigo-800">
              Profession: <strong>{character.profession}</strong>
              {character.key_attribute && ` (Key Attribute: ${character.key_attribute})`}
              {isMage && magicSchoolDisplay && ` (School: ${magicSchoolDisplay})`}
            </p>
            <p className="text-indigo-700 mt-1">
              Age: <strong>{character.age}</strong> (Grants {additionalSkillLimit} additional skill points)
            </p>
          </div>
        )}
        <p className="text-gray-600 text-sm">
          {step === 'profession'
            ? `Choose ${professionSkillLimit} skills from your profession's list below.`
            : `Choose ${additionalSkillLimit} additional skills based on your age (${character.age}).`
          }
          {isMage && step === 'additional' && " Magic skills are now available."}
          {!isMage && step === 'additional' && " Magic skills are not available for your profession."}
        </p>
      </div>

      {/* Selection Progress */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800 text-sm">Selection Progress</h4>
          <p className="text-sm text-blue-700">
            {step === 'profession'
              ? `Professional Skills: ${profSkillsCount}/${professionSkillLimit}`
              : `Additional Skills: ${addSkillsCount}/${additionalSkillLimit}`
            }
          </p>
        </div>
      </div>

      {/* Skill Filter (only for additional skills step) */}
      {step === 'additional' && (
        <div className="flex items-center gap-2 pt-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <label htmlFor="skillFilter" className="text-sm font-medium text-gray-700">Filter:</label>
          <select
            id="skillFilter"
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value as 'all' | 'combat' | 'general' | 'magic')}
            className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Available</option>
            <option value="combat">Combat</option>
            <option value="general">General</option>
            {isMage && <option value="magic">Magic</option>}
          </select>
        </div>
      )}

      {/* Loading/Error for Profession Skills */}
       {step === 'profession' && loadingProfessionSkills && (
         <LoadingSpinner size="md" className="my-4" />
       )}
       {step === 'profession' && professionSkillsError && (
         <ErrorMessage message={`Profession Skills Error: ${professionSkillsError}`} onClose={() => setProfessionSkillsError(null)} />
       )}

      {/* Skills Grid */}
      {!loadingProfessionSkills && !professionSkillsError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {step === 'profession' && (() => {
              if (!Array.isArray(availableProfessionSkillsData)) {
                  console.error("Error: availableProfessionSkillsData is not an array!", availableProfessionSkillsData);
                  return <p className="text-red-600 md:col-span-2 lg:col-span-3">Error: Profession skills data is not an array.</p>;
              }
              return availableProfessionSkillsData.map((skill) => {
                  return renderSkillCard(skill, 'profession');
              });
          })()}

          {step === 'additional' && (() => {
               if (!Array.isArray(remainingSkillsData)) {
                  console.error("Error: remainingSkillsData is not an array!", remainingSkillsData);
                  return <p className="text-red-600 md:col-span-2 lg:col-span-3">Error: Remaining skills data is not an array.</p>;
              }
              return remainingSkillsData.map((skill) => {
                  return renderSkillCard(skill, 'additional');
              });
          })()}

          {/* Empty state message */}
          {step === 'profession' && availableProfessionSkillsData.length === 0 && !loadingProfessionSkills && !professionSkillsError && (
            <p className="text-gray-500 md:col-span-2 lg:col-span-3">No specific skills found for the selected profession, or skills failed to load.</p>
          )}
           {step === 'additional' && remainingSkillsData.length === 0 && (
            <p className="text-gray-500 md:col-span-2 lg:col-span-3">No skills match the current filter or selection.</p>
          )}
        </div>
      )}


      {/* Selection Warning */}
      {((step === 'profession' && !canContinueProfession && profSkillsCount > 0) ||
        (step === 'additional' && !canContinueAdditional && addSkillsCount > 0)) && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800 text-sm">Incomplete Selection</h4>
            <p className="text-sm text-amber-700">
              {step === 'profession'
                ? `Please select ${professionSkillLimit - profSkillsCount} more professional skill(s).`
                : `Please select ${additionalSkillLimit - addSkillsCount} more additional skill(s).`
              }
            </p>
          </div>
        </div>
      )}

      {/* Continue/Save Button */}
      <button
        onClick={handleContinue}
        disabled={
          (step === 'profession' && !canContinueProfession) ||
          (step === 'additional' && !canContinueAdditional) ||
          loadingProfessionSkills
        }
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {loadingProfessionSkills ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-5 h-5" />
        )}
        {step === 'profession' ? 'Continue to Additional Skills' : 'Confirm Skill Selections'}
      </button>
    </div>
  );
}
