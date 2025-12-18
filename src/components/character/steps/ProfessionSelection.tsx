import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { fetchProfessionList, fetchHeroicAbilitiesByProfession, Profession } from '../../../lib/api/professions';
import { fetchMagicSchools, MagicSchool } from '../../../lib/api/magic';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { ErrorMessage } from '../../shared/ErrorMessage';
import { CharacterCreationData } from '../../../types/character';
import { Info, CheckCircle2, ChevronRight, ArrowLeft, Search, AlertCircle } from 'lucide-react';

type HeroicAbility = {
  id: number;
  name: string;
  description: string;
  willpower_cost: number;
  profession: string;
  created_at: string;
  requirement: string;
};

export function ProfessionSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedProfession, setSelectedProfession] = useState<Profession | null>(null);
  const [heroicAbilities, setHeroicAbilities] = useState<HeroicAbility[]>([]);
  const [selectedHeroicAbility, setSelectedHeroicAbility] = useState<HeroicAbility | null>(null);
  const [haLoading, setHaLoading] = useState<boolean>(false);
  const [haError, setHaError] = useState<string | null>(null);
  
  // Mobile View State
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);

  // Tooltip State
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const { data: professionList = [], isLoading: loadingProfessions, error: errorProfessions } = useQuery<Profession[], Error>({
    queryKey: ['professions'],
    queryFn: fetchProfessionList,
  });

  const { data: magicSchools = [], isLoading: loadingSchools, error: errorSchools } = useQuery<MagicSchool[], Error>({
    queryKey: ['magicSchools'],
    queryFn: fetchMagicSchools,
  });

  useEffect(() => {
    const handleScroll = () => setActiveTooltip(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // Initial Sync from Store
  useEffect(() => {
    if (character.profession && professionList.length > 0) {
      const currentProfession = professionList.find(p => p.name === character.profession);
      if (currentProfession) {
        setSelectedProfession(currentProfession);
        // If non-mage, load abilities
        if (currentProfession.magic_school_id === null) {
          fetchHeroicAbilities(currentProfession.name, character.professionHeroicAbilityName);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.profession, professionList]); 

  const fetchHeroicAbilities = async (professionName: string, preselectAbilityName?: string | null) => {
     setHaLoading(true);
     setHaError(null);
     try {
       const data = await fetchHeroicAbilitiesByProfession(professionName);
       const abilities = data as HeroicAbility[];
       setHeroicAbilities(abilities);

       // --- AUTO-SELECTION LOGIC ---
       if (abilities.length === 1) {
           // If only one option, select it automatically
           const autoSelect = abilities[0];
           setSelectedHeroicAbility(autoSelect);
           updateCharacter({ professionHeroicAbilityName: autoSelect.name });
       } else if (preselectAbilityName) {
           // If multiple, check if one was previously selected
           const preSelected = abilities.find(ha => ha.name === preselectAbilityName);
           if (preSelected) setSelectedHeroicAbility(preSelected);
           else setSelectedHeroicAbility(null);
       } else {
           // Multiple options and no previous selection -> Force user choice
           setSelectedHeroicAbility(null);
           updateCharacter({ professionHeroicAbilityName: null }); // Clear store to block next step
       }
     } catch (err) {
       setHaError(err instanceof Error ? err.message : 'Failed to load heroic abilities');
       setHeroicAbilities([]);
       setSelectedHeroicAbility(null);
     } finally {
       setHaLoading(false);
     }
  };

  const handleProfessionSelect = (profession: Profession) => {
    setSelectedProfession(profession);
    setIsMobileDetailView(true); // Switch to detail view on mobile
    
    // Reset state for new profession
    setHeroicAbilities([]);
    setSelectedHeroicAbility(null);

    const updates: Partial<CharacterCreationData> = {
        profession: profession.name,
        key_attribute: profession.key_attribute,
        magicSchool: profession.magic_school_id ?? null,
        professionHeroicAbilityName: null // Resetability on change
    };
    updateCharacter(updates);

    // If non-mage, fetch abilities (which triggers auto-select logic)
    if (profession.magic_school_id === null) {
      fetchHeroicAbilities(profession.name);
    }
  };

  const handleBackToList = () => {
    setIsMobileDetailView(false);
  };

  const handleHeroicAbilitySelect = (ability: HeroicAbility) => {
      setSelectedHeroicAbility(ability);
      updateCharacter({ professionHeroicAbilityName: ability.name });
  };

  const getMagicSchoolName = (schoolId: number | null): string | null => {
    if (schoolId === null || magicSchools.length === 0) return null;
    return magicSchools.find(ms => ms.id === schoolId)?.name ?? `ID: ${schoolId}`; 
  };

  const handleInfoClick = (e: React.MouseEvent, id: string, text: string) => {
    e.stopPropagation();
    if (activeTooltip === id) {
      setActiveTooltip(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      let leftPos = rect.left + rect.width / 2;
      if (leftPos < 140) leftPos = 140; 
      if (leftPos > window.innerWidth - 140) leftPos = window.innerWidth - 140;

      setTooltipPosition({ top: rect.top, left: leftPos });
      setActiveTooltip(id);
    }
  };

  const renderStringList = (items: string[] | null | undefined, title: string): React.ReactNode => {
    if (!Array.isArray(items) || items.length === 0) return <p className="text-sm text-gray-500 italic">None</p>;
    const validItems = items.filter(item => typeof item === 'string');
    if (validItems.length === 0) return <p className="text-sm text-gray-500 italic">None</p>;
    
    return (
      <div className="flex flex-wrap gap-2">
        {validItems.map((item, index) => (
          <span key={index} className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-700 border border-gray-200">
            {item}
          </span>
        ))}
      </div>
    );
  };

  if (loadingProfessions || loadingSchools) return <LoadingSpinner size="lg" />;
  if (errorProfessions || errorSchools) return <ErrorMessage message="Failed to load professions." />;

  return (
    <div className="flex flex-col md:flex-row h-[75vh] md:h-[600px] gap-6" onClick={() => setActiveTooltip(null)}>
      
      {/* Left Column: List */}
      <div className={`w-full md:w-1/3 flex flex-col border rounded-lg bg-white shadow-sm overflow-hidden h-full ${isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
        <div className="bg-gray-50 p-3 border-b font-bold text-gray-700 sticky top-0 flex justify-between items-center">
            <span>Professions</span>
            <span className="text-xs font-normal text-gray-400">{professionList.length} available</span>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {professionList.map((profession) => (
            <button
              key={profession.id}
              className={`w-full text-left px-3 py-3 md:py-2 rounded-md text-sm transition-colors flex justify-between items-center border border-transparent ${
                selectedProfession?.id === profession.id
                  ? 'bg-blue-50 text-blue-800 font-semibold border-blue-200'
                  : 'hover:bg-gray-50 text-gray-700 border-b-gray-50'
              }`}
              onClick={() => handleProfessionSelect(profession)}
            >
              <div className="flex flex-col items-start">
                  <span>{profession.name}</span>
                  {profession.magic_school_id !== null && <span className="text-[10px] text-purple-600 font-normal">Mage</span>}
              </div>
              <ChevronRight size={16} className={`text-gray-300 ${selectedProfession?.id === profession.id ? 'text-blue-500' : ''}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Right Column: Details */}
      <div className={`w-full md:w-2/3 flex flex-col h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm relative ${!isMobileDetailView ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Mobile Back Button */}
        <div className="md:hidden bg-gray-50 p-2 border-b flex items-center gap-2">
            <button onClick={handleBackToList} className="p-2 hover:bg-gray-200 rounded-full text-gray-600">
                <ArrowLeft size={20} />
            </button>
            <span className="font-bold text-gray-700">Back to List</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
            {selectedProfession ? (
            <div className="space-y-6">
                <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    {selectedProfession.name}
                    {selectedProfession.magic_school_id !== null && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full border border-purple-200">Mage</span>}
                </h2>
                <p className="text-gray-600 mt-2 text-sm leading-relaxed">{selectedProfession.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded border border-gray-200">
                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Key Attribute</span>
                    <span className="font-bold text-lg text-gray-800">{selectedProfession.key_attribute}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-200">
                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Type</span>
                    <span className="font-medium text-gray-700">{selectedProfession.magic_school_id ? 'Magic User' : 'Non-Magic User'}</span>
                </div>
                </div>

                <div>
                <h4 className="font-bold text-sm text-gray-700 mb-2 uppercase tracking-wide">Skills</h4>
                {renderStringList(selectedProfession.skills, 'Skills')}
                </div>

                {selectedProfession.starting_equipment && (
                <div>
                    <h4 className="font-bold text-sm text-gray-700 mb-2 uppercase tracking-wide">Starting Gear</h4>
                    {renderStringList(selectedProfession.starting_equipment, 'Gear')}
                </div>
                )}

                <div className="pt-4 border-t border-gray-100">
                <h4 className="font-bold text-sm text-gray-700 mb-3 uppercase tracking-wide">Heroic Ability / Magic</h4>
                
                {selectedProfession.magic_school_id !== null ? (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                    <p><strong>Magic School:</strong> {getMagicSchoolName(selectedProfession.magic_school_id)}</p>
                    <p className="mt-1">Mages start with magic spells instead of a Heroic Ability.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                    {haLoading && <LoadingSpinner size="sm"/>}
                    
                    {/* Prompt for Multiple Options */}
                    {!haLoading && heroicAbilities.length > 1 && !selectedHeroicAbility && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-800 animate-in fade-in">
                            <AlertCircle size={16} />
                            <span>This profession has multiple options. Please select one below.</span>
                        </div>
                    )}

                    {!haLoading && heroicAbilities.map((ability) => (
                        <div
                        key={ability.id}
                        onClick={() => handleHeroicAbilitySelect(ability)}
                        className={`relative p-4 rounded-lg border cursor-pointer transition-all ${
                            selectedHeroicAbility?.id === ability.id 
                            ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400' 
                            : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                        }`}
                        >
                        <div className="flex justify-between items-start mb-1">
                            <h5 className="font-bold text-gray-900">{ability.name}</h5>
                            {selectedHeroicAbility?.id === ability.id && <CheckCircle2 size={18} className="text-blue-600" />}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{ability.description}</p>
                        
                        {/* Info Button */}
                        <button 
                            onClick={(e) => handleInfoClick(e, `ha-${ability.id}`, ability.description)}
                            className="absolute bottom-3 right-3 text-gray-400 hover:text-blue-500"
                        >
                            <Info size={16} />
                        </button>

                        <div className="mt-2 flex gap-2 text-xs">
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600 font-medium">WP: {ability.willpower_cost ?? 0}</span>
                        </div>

                        {/* Tooltip */}
                        {activeTooltip === `ha-${ability.id}` && tooltipPosition && (
                            <div 
                            style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} 
                            className="fixed -translate-x-1/2 -translate-y-full mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded shadow-xl z-[100] animate-in fade-in zoom-in-95 pointer-events-none"
                            >
                            <p>{ability.description}</p>
                            <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
                            </div>
                        )}
                        </div>
                    ))}
                    {!haLoading && heroicAbilities.length === 0 && <p className="text-sm text-gray-500 italic">No abilities available.</p>}
                    </div>
                )}
                </div>
            </div>
            ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                <Search size={48} className="opacity-20 mb-4"/>
                <p className="text-lg font-medium">Select a Profession</p>
                <p className="text-sm mt-1">Choose a profession from the list to view its abilities, skills, and gear.</p>
            </div>
            )}
        </div>
      </div>
    </div>
  );
}