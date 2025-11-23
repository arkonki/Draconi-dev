import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../../lib/supabase'; // Make sure this path is correct
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Sparkles, AlertCircle, Info, Filter, Loader } from 'lucide-react';
import { useMagicSpells } from '../../../hooks/useMagicSpells';
import { DBSpell } from '../../../hooks/useSpells';

export function MagicSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  
  // Component State
  const [selectedTricks, setSelectedTricks] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'general' | 'school'>('all');
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  // --- NEW: State for dynamically loaded magic schools ---
  const [magicSchools, setMagicSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  
  // Check if character is a mage and has a selected school
  const isMage = character.profession?.includes("Mage");
  const magicSchoolParam = isMage && character.magicSchool ? character.magicSchool : null;
  
  // Fetch spells using the existing hook
  const { tricks, spells, loading: spellsLoading, error: spellsError } = useMagicSpells(magicSchoolParam);

  // --- NEW: useEffect to fetch magic schools from the database ---
  useEffect(() => {
    const fetchMagicSchools = async () => {
      setSchoolsLoading(true);
      setSchoolsError(null);
      
      const { data, error } = await supabase
        .from('magic_schools') // Ensure table name is correct
        .select('id, name');

      if (error) {
        console.error("Error fetching magic schools:", error);
        setSchoolsError("Failed to load magic school data. Please try refreshing.");
      } else {
        setMagicSchools(data || []);
      }
      setSchoolsLoading(false);
    };

    fetchMagicSchools();
  }, []);

  // --- NEW: Create a lookup map from the fetched schools for efficient access ---
  const schoolNameMap = useMemo(() => {
    return magicSchools.reduce((acc, school) => {
      acc[school.id] = school.name;
      return acc;
    }, {} as Record<string, string>);
  }, [magicSchools]);

  // Memoized filters for tricks and spells (logic is unchanged)
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

  // --- UPDATED: Combined loading state for both spells and schools ---
  const isLoading = spellsLoading || schoolsLoading;

  // --- Render guards ---
  if (!isMage) {
    return <div className="p-6 text-center"><p className="text-gray-600">Only mages can learn and cast spells. Continue to the next step.</p></div>;
  }
  if (magicSchoolParam === null) {
    return <div className="p-6"><div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg"><AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-amber-800">Magic School Required</h4><p className="text-sm text-amber-700">Please go back to the Profession step and select a magic school before choosing spells.</p></div></div></div>;
  }
  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader className="w-8 h-8 animate-spin text-blue-600" /><span className="ml-2 text-gray-600">Loading magic data...</span></div>;
  }
  if (spellsError || schoolsError) {
    return <div className="p-6"><div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg"><AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-red-800">Error</h4><p className="text-sm text-red-700">{spellsError || schoolsError}</p></div></div></div>;
  }

  // --- Handlers ---
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

  const handleSave = () => {
    updateCharacter({
      spells: {
        general: [...selectedTricks, ...selectedSpells.filter(spellName => spells.find(s => s.name === spellName)?.school_id === null)],
        school: {
          // --- UPDATED: Uses the dynamic schoolNameMap ---
          name: schoolNameMap[magicSchoolParam] || "Unknown School",
          spells: selectedSpells.filter(spellName => spells.find(s => s.name === spellName)?.school_id === magicSchoolParam)
        }
      }
    });
  };

  const handleMouseEnter = (e: React.MouseEvent, description: string) => { /* ... (unchanged) ... */ };
  const handleMouseLeave = () => { /* ... (unchanged) ... */ };
  const handleInfoClick = (e: React.MouseEvent, description: string) => { /* ... (unchanged) ... */ };

  const renderSpellRow = (spell: DBSpell, type: 'trick' | 'spell') => {
    const isSelected = (type === 'trick' ? selectedTricks : selectedSpells).includes(spell.name);
    const selectionCount = type === 'trick' ? selectedTricks.length : selectedSpells.length;
    const isDisabled = selectionCount >= 3 && !isSelected;
    const highlightColor = type === 'trick' ? 'purple' : 'blue';
    const spellDetails = [
      spell.description, `Range: ${spell.range}`, `Duration: ${spell.duration}`,
      (spell.requirement && spell.requirement !== "None") && `Requirement: ${spell.requirement}`
    ].filter(Boolean).join('\n');
    // --- UPDATED: Uses the dynamic schoolNameMap ---
    const schoolName = spell.magic_schools?.name || (spell.school_id ? schoolNameMap[spell.school_id] : null) || "General";

    return (
      <div key={spell.id} onClick={() => !isDisabled && handleSpellSelection(spell.name, type)} className={`...`}>
        {/* ... (rest of the row JSX is unchanged) ... */}
      </div>
    );
  };
  
  const currentSchoolName = schoolNameMap[magicSchoolParam] || "General";

  return (
    <div className="space-y-6" onClick={handleMouseLeave}>
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Select Magic</h3>
        {/* --- UPDATED: Uses dynamic school name --- */}
        <p className="text-gray-600">As a new mage, choose three rank 1 spells and three magic tricks from General Magic and your chosen school ({currentSchoolName}).</p>
      </div>

      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Your Magic School</h4>
          {/* --- UPDATED: Uses dynamic school name --- */}
          <p className="text-sm text-blue-700">{currentSchoolName}</p>
        </div>
      </div>
      
      {/* ... (Rest of the JSX is unchanged) ... */}

    </div>
  );
}
