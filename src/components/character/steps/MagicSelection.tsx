import React, { useState } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { Sparkles, AlertCircle, Info, Filter, Loader } from 'lucide-react';
import { useMagicSpells } from '../../../hooks/useMagicSpells';
import { DBSpell } from '../../../hooks/useSpells';

// Mapping: keys are magic school UUIDs.
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
  const [rankFilter, setRankFilter] = useState<number>(1);

  // Check if the profession name contains "Mage"
  const isMage = character.profession?.includes("Mage");
  // Use the stored magic school if available.
  const magicSchoolParam = isMage && character.magicSchool ? character.magicSchool : null;


  if (!isMage) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">
          Only mages can learn and cast spells. Continue to the next step.
        </p>
      </div>
    );
  }

  if (magicSchoolParam === null) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Magic School Required</h4>
            <p className="text-sm text-amber-700">
              Please go back to the Profession step and select a magic school before choosing spells.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pass magicSchoolParam to our custom hook.
  const { tricks, spells, loading, error: spellsError } = useMagicSpells(magicSchoolParam);

  const handleSpellSelection = (spellName: string, type: 'trick' | 'spell') => {
    if (type === 'trick') {
      if (selectedTricks.includes(spellName)) {
        setSelectedTricks(selectedTricks.filter(name => name !== spellName));
      } else if (selectedTricks.length < 3) {
        setSelectedTricks([...selectedTricks, spellName]);
      }
    } else {
      if (selectedSpells.includes(spellName)) {
        setSelectedSpells(selectedSpells.filter(name => name !== spellName));
      } else if (selectedSpells.length < 3) {
        setSelectedSpells([...selectedSpells, spellName]);
      }
    }
  };

  // Filter spells based on the selected filters:
  // - If filter is 'general', show spells with a null school_id.
  // - If 'school', show spells matching the magicSchoolParam.
  // - Otherwise, show spells matching the rank filter.
  const filteredSpells = spells.filter(spell => {
    if (filter === 'general') return spell.school_id === null;
    if (filter === 'school') return spell.school_id === magicSchoolParam;
    return spell.rank === rankFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleSave = () => {
    updateCharacter({
      spells: {
        general: [
          ...selectedTricks,
          ...selectedSpells.filter(spellName =>
            spells.find(s => s.name === spellName)?.school_id === null
          )
        ],
        school: {
          name: schoolNames[magicSchoolParam] || "Unknown",
          spells: selectedSpells.filter(spellName =>
            spells.find(s => s.name === spellName)?.school_id === magicSchoolParam
          )
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Select Magic</h3>
        <p className="text-gray-600">
          As a newly created mage, you may choose three rank 1 spells and three magic tricks.
          You can select spells from both General Magic and your chosen school of magic (
          {schoolNames[magicSchoolParam] || "General"}).
        </p>
      </div>

      {/* Magic School Notice */}
      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Your Magic School</h4>
          <p className="text-sm text-blue-700">
            {schoolNames[magicSchoolParam] || "General Magic"}
          </p>
        </div>
      </div>

      {/* Magic Tricks Selection */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold">Magic Tricks</h4>
          <span className="text-sm text-gray-600">
            Selected: {selectedTricks.length}/3
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tricks.map((trick) => (
            <div
              key={trick.name}
              onClick={() => handleSpellSelection(trick.name, 'trick')}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedTricks.includes(trick.name)
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles
                  className={`w-5 h-5 ${
                    selectedTricks.includes(trick.name) ? 'text-purple-500' : 'text-gray-400'
                  }`}
                />
                <div>
                  <h5 className="font-medium">{trick.name}</h5>
                  <span className="text-xs text-gray-500">
                    {trick.magic_schools?.name || "General Magic"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">{trick.description}</p>
              <div className="mt-2 text-xs text-gray-500">
                <p>Range: {trick.casting_time}</p>
                <p>Duration: {trick.duration}</p>
                {trick.requirement && <p>Requirement: {trick.requirement}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rank 1 Spells Selection */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h4 className="text-lg font-semibold">Rank 1 Spells</h4>
            <div className="flex items-center gap-2">
              <select
                value={rankFilter}
                onChange={(e) => setRankFilter(parseInt(e.target.value))}
                className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Rank {i + 1}
                  </option>
                ))}
              </select>
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | 'general' | 'school')}
                className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Spells</option>
                <option value="general">General Magic</option>
                <option value="school">School Spells</option>
              </select>
            </div>
          </div>
          <span className="text-sm text-gray-600">
            Selected: {selectedSpells.length}/3
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSpells.map((spell) => (
            <div
              key={spell.name}
              onClick={() => handleSpellSelection(spell.name, 'spell')}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedSpells.includes(spell.name)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles
                  className={`w-5 h-5 ${
                    selectedSpells.includes(spell.name) ? 'text-blue-500' : 'text-gray-400'
                  }`}
                />
                <div>
                  <h5 className="font-medium">{spell.name}</h5>
                  <span className="text-xs text-gray-500">
                    {spell.magic_schools?.name || "General Magic"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">{spell.description}</p>
              <div className="mt-2 text-xs text-gray-500">
                <p>Range: {spell.range}</p>
                <p>Duration: {spell.duration}</p>
                {spell.requirement !== "None" && <p>Requirement: {spell.requirement}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {(selectedTricks.length < 3 || selectedSpells.length < 3) && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Incomplete Selection</h4>
            <p className="text-sm text-amber-700">
              Please select 3 magic tricks and 3 rank 1 spells to continue.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={selectedTricks.length < 3 || selectedSpells.length < 3}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Sparkles className="w-5 h-5" />
        Save Spell Selections
      </button>
    </div>
  );
}
