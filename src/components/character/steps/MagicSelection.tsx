import React, { useState, useMemo } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Sparkles, AlertCircle, Info, Filter, Loader } from 'lucide-react';
import { useMagicSpells } from '../../../hooks/useMagicSpells';
import { DBSpell } from '../../../hooks/useSpells';

const schoolNames: Record<string, string> = {
  "6d2d7686-da89-4c42-a763-6b143c1dac60": "Elementalist",
  "b500058b-543f-4c44-a097-911102245236": "Mentalist",
  "e7836c1c-517a-41f8-bd71-92ba20d9c9e1": "Animist",
};

export function MagicSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [selectedTricks, setSelectedTricks] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'general' | 'school'>('all');
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const isMage = character.profession?.includes("Mage");
  const magicSchoolParam = isMage && character.magicSchool ? character.magicSchool : null;
  const { tricks, spells, loading, error: spellsError } = useMagicSpells(magicSchoolParam);

  const filteredTricks = useMemo(() => {
    if (loading || !tricks) return [];
    return tricks.filter(trick => trick.school_id === null || trick.school_id === magicSchoolParam);
  }, [tricks, magicSchoolParam, loading]);

  // --- UPDATED: No longer needs rankFilter state ---
  const filteredSpells = useMemo(() => {
    if (loading || !spells) return [];
    return spells.filter(spell => {
      if (filter === 'general') return spell.school_id === null;
      if (filter === 'school') return spell.school_id === magicSchoolParam;
      // When filter is 'all', only show Rank 1 spells.
      return spell.rank === 1;
    });
  }, [spells, filter, magicSchoolParam, loading]);


  if (!isMage) {
    return <div className="p-6 text-center"><p className="text-gray-600">Only mages can learn and cast spells. Continue to the next step.</p></div>;
  }
  if (magicSchoolParam === null) {
    return <div className="p-6"><div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg"><AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-medium text-amber-800">Magic School Required</h4><p className="text-sm text-amber-700">Please go back to the Profession step and select a magic school before choosing spells.</p></div></div></div>;
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

  const handleSave = () => {
    updateCharacter({
      spells: {
        general: [...selectedTricks, ...selectedSpells.filter(spellName => spells.find(s => s.name === spellName)?.school_id === null)],
        school: {
          name: schoolNames[magicSchoolParam] || "Unknown",
          spells: selectedSpells.filter(spellName => spells.find(s => s.name === spellName)?.school_id === magicSchoolParam)
        }
      }
    });
  };
  
  const handleMouseEnter = (e: React.MouseEvent, description: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipContent(description); setTooltipPosition({ top: rect.top, left: rect.left + rect.width / 2 });
  };
  const handleMouseLeave = () => { setTooltipContent(null); setTooltipPosition(null); };
  const handleInfoClick = (e: React.MouseEvent, description: string) => {
    e.stopPropagation();
    if (tooltipContent === description) { handleMouseLeave(); } else { handleMouseEnter(e, description); }
  };

  const renderSpellRow = (spell: DBSpell, type: 'trick' | 'spell') => {
    const isSelected = (type === 'trick' ? selectedTricks : selectedSpells).includes(spell.name);
    const selectionCount = type === 'trick' ? selectedTricks.length : selectedSpells.length;
    const isDisabled = selectionCount >= 3 && !isSelected;
    const highlightColor = type === 'trick' ? 'purple' : 'blue';
    const spellDetails = [
      spell.description, `Range: ${spell.range}`, `Duration: ${spell.duration}`,
      (spell.requirement && spell.requirement !== "None") && `Requirement: ${spell.requirement}`
    ].filter(Boolean).join('\n');
    const schoolName = spell.magic_schools?.name || (spell.school_id ? schoolNames[spell.school_id] : null) || "General";

    return (
      <div key={spell.id} onClick={() => !isDisabled && handleSpellSelection(spell.name, type)} className={`flex items-center justify-between p-3 border-b transition-colors last:border-b-0 ${isDisabled ? 'bg-gray-50 opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? `bg-${highlightColor}-50` : 'hover:bg-gray-50'}`}>
        <div className="flex items-center gap-3">
          <Sparkles className={`w-6 h-6 flex-shrink-0 ${isSelected ? `text-${highlightColor}-500` : 'text-gray-300'}`} />
          <div className="flex items-center gap-2">
            <h5 className="font-medium text-gray-800">{spell.name}</h5>
            <div className="p-1" onClick={(e) => handleInfoClick(e, spellDetails)} onMouseEnter={(e) => handleMouseEnter(e, spellDetails)} onMouseLeave={handleMouseLeave}>
              <Info className="w-4 h-4 text-blue-500 cursor-help" />
            </div>
          </div>
        </div>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{schoolName}</span>
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6" onClick={handleMouseLeave}>
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Select Magic</h3>
        <p className="text-gray-600">As a new mage, choose three rank 1 spells and three magic tricks from General Magic and your chosen school ({schoolNames[magicSchoolParam] || "General"}).</p>
      </div>

      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Your Magic School</h4>
          <p className="text-sm text-blue-700">{schoolNames[magicSchoolParam] || "General Magic"}</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold">Magic Tricks</h4>
          <span className="text-sm font-medium text-gray-600">Selected: {selectedTricks.length}/3</span>
        </div>
        <div className="border rounded-lg bg-white shadow-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {filteredTricks.map((trick) => renderSpellRow(trick, 'trick'))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <h4 className="text-lg font-semibold">Rank 1 Spells</h4>
          {/* --- UPDATED: Simplified filter controls --- */}
          <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'general' | 'school')} className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Rank 1</option>
                <option value="general">General Magic</option>
                <option value="school">School Spells</option>
              </select>
            </div>
          <span className="text-sm font-medium text-gray-600">Selected: {selectedSpells.length}/3</span>
        </div>
        <div className="border rounded-lg bg-white shadow-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {filteredSpells.map((spell) => renderSpellRow(spell, 'spell'))}
          {filteredSpells.length === 0 && <p className="p-4 text-center text-gray-500">No Rank 1 spells match the current filter.</p>}
        </div>
      </div>

      {(selectedTricks.length < 3 || selectedSpells.length < 3) && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div><h4 className="font-medium text-amber-800">Incomplete Selection</h4><p className="text-sm text-amber-700">Please select 3 magic tricks and 3 rank 1 spells to continue.</p></div>
        </div>
      )}

      <button onClick={handleSave} disabled={selectedTricks.length < 3 || selectedSpells.length < 3} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <Sparkles className="w-5 h-5" /> Save Spell Selections
      </button>

      {tooltipContent && tooltipPosition && (
        <div style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }} className="fixed -translate-x-1/2 -translate-y-full mb-2 w-72 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-[60] pointer-events-none whitespace-pre-line">
          <p>{tooltipContent}</p>
        </div>
      )}
    </div>
  );
}
