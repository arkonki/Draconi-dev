import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Sparkles, AlertCircle, Info, Loader, CheckCircle2 } from 'lucide-react';
import { useMagicSpells } from '../../../hooks/useMagicSpells';
import { DBSpell } from '../../../hooks/useSpells';

export function MagicSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  
  // --- 1. Dynamic School Loading ---
  const [magicSchools, setMagicSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  // --- 2. Initialize Selection from Store ---
  const [selectedTricks, setSelectedTricks] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const [filter, setFilter] = useState<'all' | 'general' | 'school'>('all');
  
  // Tooltip State (Mobile Friendly)
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null); // Store spell ID/Name
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  // --- 3. Robust Mage Detection ---
  const magicSchoolParam = character.magicSchool || null;
  const isMage = !!magicSchoolParam;
  
  // Fetch spells
  const { tricks, spells, loading: spellsLoading, error: spellsError } = useMagicSpells(magicSchoolParam);

  // Load Schools
  useEffect(() => {
    supabase.from('magic_schools').select('id, name').then(({ data, error }) => {
      if (!error && data) setMagicSchools(data);
      setSchoolsLoading(false);
    });
  }, []);

  // Close tooltip on scroll
  useEffect(() => {
    const handleScroll = () => setActiveTooltip(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const schoolNameMap = useMemo(() => {
    return magicSchools.reduce((acc, school) => {
      acc[school.id] = school.name;
      return acc;
    }, {} as Record<string, string>);
  }, [magicSchools]);

  // --- 4. Initialize State from Global Store when Data is Ready ---
  useEffect(() => {
    if (!spellsLoading && tricks && spells && !isInitialized && character.spells) {
      const allSavedSpells = [
        ...(character.spells.general || []),
        ...(character.spells.school?.spells || [])
      ];

      const savedTricks = allSavedSpells.filter(name => tricks.some(t => t.name === name));
      const savedSpells = allSavedSpells.filter(name => spells.some(s => s.name === name));

      setSelectedTricks(savedTricks);
      setSelectedSpells(savedSpells);
      setIsInitialized(true);
    }
  }, [spellsLoading, tricks, spells, isInitialized, character.spells]);


  // --- 5. Auto-Sync to Store ---
  useEffect(() => {
    if (spellsLoading || schoolsLoading) return;

    const schoolName = magicSchoolParam ? schoolNameMap[magicSchoolParam] : "Unknown School";
    
    const generalSpellsAndTricks = [
      ...selectedTricks,
      ...selectedSpells.filter(name => {
        const spellObj = spells?.find(s => s.name === name);
        return spellObj && spellObj.school_id === null;
      })
    ];

    const schoolSpellsList = selectedSpells.filter(name => {
      const spellObj = spells?.find(s => s.name === name);
      return spellObj && spellObj.school_id === magicSchoolParam;
    });

    updateCharacter({
      spells: {
        general: generalSpellsAndTricks,
        school: {
          name: schoolName || "Unknown",
          spells: schoolSpellsList
        }
      }
    });
  }, [selectedTricks, selectedSpells, magicSchoolParam, schoolNameMap, spells, updateCharacter, spellsLoading, schoolsLoading]);


  const filteredTricks = useMemo(() => {
    if (spellsLoading || !tricks) return [];
    return tricks.filter(trick => trick.school_id === null || trick.school_id === magicSchoolParam);
  }, [tricks, magicSchoolParam, spellsLoading]);

  const filteredSpells = useMemo(() => {
    if (spellsLoading || !spells) return [];
    return spells.filter(spell => {
      if (filter === 'general') return spell.school_id === null;
      if (filter === 'school') return spell.school_id === magicSchoolParam;
      return spell.rank === 1;
    });
  }, [spells, filter, magicSchoolParam, spellsLoading]);


  // --- Render Guards ---
  if (!isMage) {
    return <div className="p-6 text-center"><p className="text-gray-600">Only mages can learn and cast spells. Continue to the next step.</p></div>;
  }

  if (spellsLoading || schoolsLoading) {
    return <div className="flex items-center justify-center p-8"><Loader className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  if (spellsError) {
    return <div className="p-4 bg-red-50 text-red-700 rounded border border-red-200">Error loading spells: {spellsError}</div>;
  }

  const handleSpellSelection = (spellName: string, type: 'trick' | 'spell') => {
    const selection = type === 'trick' ? selectedTricks : selectedSpells;
    const setter = type === 'trick' ? setSelectedTricks : setSelectedSpells;
    const limit = 3;

    if (selection.includes(spellName)) {
      setter(selection.filter(name => name !== spellName));
    } else if (selection.length < limit) {
      setter([...selection, spellName]);
    }
  };

  // Mobile Friendly Tooltip Handler
  const handleInfoClick = (e: React.MouseEvent, spellId: string) => {
    e.stopPropagation(); // Stop row click
    
    if (activeTooltip === spellId) {
      setActiveTooltip(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      // Ensure tooltip stays within bounds
      let leftPos = rect.left + rect.width / 2;
      if (leftPos < 140) leftPos = 140; 
      if (leftPos > window.innerWidth - 140) leftPos = window.innerWidth - 140;

      setTooltipPosition({ top: rect.top, left: leftPos });
      setActiveTooltip(spellId);
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
  
  const renderSpellRow = (spell: DBSpell, type: 'trick' | 'spell') => {
    const isSelected = (type === 'trick' ? selectedTricks : selectedSpells).includes(spell.name);
    const selectionCount = type === 'trick' ? selectedTricks.length : selectedSpells.length;
    const isDisabled = selectionCount >= 3 && !isSelected;
    const highlightColor = type === 'trick' ? 'purple' : 'blue';
    
    const schoolName = spell.magic_schools?.name || (spell.school_id ? schoolNameMap[spell.school_id] : null) || "General";

    return (
      <div 
        key={spell.id} 
        onClick={() => !isDisabled && handleSpellSelection(spell.name, type)} 
        onKeyDown={(event) => {
          if (!isDisabled) {
            handleKeyboardActivate(event, () => handleSpellSelection(spell.name, type));
          }
        }}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        className={`flex items-center justify-between p-3 border-b transition-colors last:border-b-0 
          ${isDisabled ? 'bg-gray-50 opacity-60 cursor-not-allowed' : 'cursor-pointer'} 
          ${isSelected ? `bg-${highlightColor}-50` : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-3">
          <Sparkles className={`w-5 h-5 flex-shrink-0 ${isSelected ? `text-${highlightColor}-500` : 'text-gray-300'}`} />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h5 className="font-medium text-gray-800 text-sm">{spell.name}</h5>
              
              {/* Info Button */}
              <button
                type="button"
                onClick={(e) => handleInfoClick(e, spell.id)}
                className={`p-1 -m-1 rounded-full transition-colors ${activeTooltip === spell.id ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-500'}`}
              >
                <Info size={14} />
              </button>

            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{schoolName}</span>
           {isSelected && <CheckCircle2 className={`w-4 h-4 text-${highlightColor}-600`} />}
        </div>
      </div>
    );
  };

  const currentSchoolName = magicSchoolParam ? schoolNameMap[magicSchoolParam] : "General";

  // Helper to find description
  const getActiveDescription = () => {
    if (!activeTooltip) return null;
    const spell = [...(tricks || []), ...(spells || [])].find(s => s.id === activeTooltip);
    return spell?.description;
  };

  return (
    <div className="space-y-6" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
      <div className="prose">
        <h3 className="text-xl font-bold mb-2">Select Magic</h3>
        <p className="text-gray-600 text-sm">
          Select <strong>3 Magic Tricks</strong> and <strong>3 Rank 1 Spells</strong>. 
          You may choose from General Magic or the <strong>{currentSchoolName}</strong> school.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Tricks Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200">
             <h4 className="font-semibold text-gray-700">Magic Tricks</h4>
             <span className={`text-xs font-bold px-2 py-1 rounded ${selectedTricks.length === 3 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
               {selectedTricks.length}/3
             </span>
          </div>
          <div className="border rounded-lg bg-white shadow-sm overflow-hidden h-96 overflow-y-auto" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
            {filteredTricks.map((trick) => renderSpellRow(trick, 'trick'))}
          </div>
        </div>

        {/* Spells Column */}
        <div className="space-y-3">
           <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200">
             <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-700">Rank 1 Spells</h4>
                <div className="relative">
                  <select 
                    value={filter} 
                    onChange={(e) => setFilter(e.target.value as 'all' | 'general' | 'school')} 
                    className="text-xs py-1 pl-2 pr-6 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                    onClick={(e) => e.stopPropagation()} // Prevent closing tooltip when changing filter
                  >
                    <option value="all">All</option>
                    <option value="general">General</option>
                    <option value="school">School</option>
                  </select>
                </div>
             </div>
             <span className={`text-xs font-bold px-2 py-1 rounded ${selectedSpells.length === 3 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
               {selectedSpells.length}/3
             </span>
          </div>
          <div className="border rounded-lg bg-white shadow-sm overflow-hidden h-96 overflow-y-auto" onClick={handleBackgroundClick} onKeyDown={(event) => handleKeyboardActivate(event, handleBackgroundClick)} role="button" tabIndex={0}>
            {filteredSpells.length > 0 ? (
              filteredSpells.map((spell) => renderSpellRow(spell, 'spell'))
            ) : (
              <div className="p-8 text-center text-gray-400 text-sm">No spells match this filter.</div>
            )}
          </div>
        </div>
      </div>

      {/* Completion Status Indicator */}
      <div className={`p-3 rounded-lg flex items-center gap-2 transition-colors ${
        selectedTricks.length === 3 && selectedSpells.length === 3 
          ? 'bg-green-50 border border-green-200 text-green-800' 
          : 'bg-amber-50 border border-amber-200 text-amber-800'
      }`}>
        {selectedTricks.length === 3 && selectedSpells.length === 3 ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium text-sm">Selection complete. You may proceed.</span>
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium text-sm">Please complete your selection to continue.</span>
          </>
        )}
      </div>

      {/* Tooltip Overlay */}
      {activeTooltip && tooltipPosition && (
        <div 
          style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} 
          className="fixed -translate-x-1/2 -translate-y-[calc(100%+10px)] w-64 p-3 bg-gray-900 text-white text-xs leading-relaxed rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()} // Prevent clicking the tooltip itself from closing it
          onKeyDown={(event) => handleKeyboardActivate(event, () => {})}
          role="button"
          tabIndex={0}
        >
          <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45" />
          {getActiveDescription() || "No description available."}
        </div>
      )}
    </div>
  );
}
