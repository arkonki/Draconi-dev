import React, { useState, useEffect } from 'react';
import { GameDataEntry } from '../../../hooks/useGameData';
import { SpellPrerequisite } from '../../../types/magic';

interface SpellFormProps {
  entry: GameDataEntry; // entry.prerequisite and entry.requirement will be string | null
  onChange: (field: string, value: any) => void;
  magicSchools?: { id:string; name: string }[];
}

function isValidPrerequisiteJSON(obj: any): obj is SpellPrerequisite {
  if (typeof obj !== 'object' || obj === null) return false;
  if (!obj.type) return false;

  if (obj.type === "logical") {
    return (obj.operator === "AND" || obj.operator === "OR") && Array.isArray(obj.conditions) && obj.conditions.every(isValidPrerequisiteJSON);
  }
  if (["spell", "school", "skill", "attribute"].includes(obj.type)) {
    return typeof obj.name === "string";
  }
  if (obj.type === "anySchool") {
    return true;
  }
  return false;
}

export function SpellForm({ entry, onChange, magicSchools = [] }: SpellFormProps) {
  const [prerequisiteInput, setPrerequisiteInput] = useState<string>('');
  const [prerequisiteError, setPrerequisiteError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize prerequisite textarea from entry.prerequisite
    if (entry.prerequisite) {
      try {
        if (typeof entry.prerequisite === 'object' && entry.prerequisite !== null) {
          setPrerequisiteInput(JSON.stringify(entry.prerequisite, null, 2));
        } else if (typeof entry.prerequisite === 'string') {
          JSON.parse(entry.prerequisite); // Validate and pretty print
          setPrerequisiteInput(JSON.stringify(JSON.parse(entry.prerequisite), null, 2));
        }
      } catch (e) {
        setPrerequisiteInput(entry.prerequisite as string); // Not valid JSON, display as is
      }
    } else {
      setPrerequisiteInput('');
    }
  }, [entry.prerequisite]);

  const handlePrerequisiteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrerequisiteInput(val);

    if (val.trim() === '') {
      onChange('prerequisite', null);
      setPrerequisiteError(null);
      return;
    }

    try {
      const parsed = JSON.parse(val);
      if (isValidPrerequisiteJSON(parsed)) {
        onChange('prerequisite', JSON.stringify(parsed)); // Store as stringified JSON
        setPrerequisiteError(null);
      } else {
        setPrerequisiteError('Invalid prerequisite JSON structure. Please check the format.');
      }
    } catch (error) {
      setPrerequisiteError('Invalid JSON. Please ensure correct JSON syntax.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let processedValue: string | number | null = value;

    if (type === 'number' && e.target instanceof HTMLInputElement) {
      processedValue = value === '' ? null : parseInt(value, 10);
      if (isNaN(processedValue as number)) {
        processedValue = null;
      }
    }
    
    if (name === 'school_id' && value === '') {
        processedValue = null;
    }
    onChange(name, processedValue);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
        <input
          type="text"
          name="name"
          id="name"
          value={entry.name || ''}
          onChange={handleInputChange}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          name="description"
          id="description"
          rows={3}
          value={entry.description || ''}
          onChange={handleInputChange}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="school_id" className="block text-sm font-medium text-gray-700">Magic School</label>
          <select
            name="school_id"
            id="school_id"
            value={entry.school_id || ''}
            onChange={handleInputChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
          >
            <option value="">General</option>
            {magicSchools.map(school => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rank" className="block text-sm font-medium text-gray-700">Rank (0 for Trick)</label>
          <input
            type="number"
            name="rank"
            id="rank"
            min="0"
            max="5"
            value={entry.rank ?? 0}
            onChange={handleInputChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="casting_time" className="block text-sm font-medium text-gray-700">Casting Time</label>
          <input
            type="text"
            name="casting_time"
            id="casting_time"
            value={entry.casting_time || ''}
            onChange={handleInputChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="range" className="block text-sm font-medium text-gray-700">Range</label>
          <input
            type="text"
            name="range"
            id="range"
            value={entry.range || ''}
            onChange={handleInputChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="duration" className="block text-sm font-medium text-gray-700">Duration</label>
          <input
            type="text"
            name="duration"
            id="duration"
            value={entry.duration || ''}
            onChange={handleInputChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div>
           <label htmlFor="willpower_cost" className="block text-sm font-medium text-gray-700">Willpower Cost</label>
           <input
             type="number"
             name="willpower_cost"
             id="willpower_cost"
             min="0"
             value={entry.willpower_cost ?? 0}
             onChange={handleInputChange}
             className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
           />
         </div>
      </div>

      <div>
        <label htmlFor="prerequisite" className="block text-sm font-medium text-gray-700">
          Learning Prerequisite (JSON or leave empty)
        </label>
        <textarea
          name="prerequisite"
          id="prerequisite"
          rows={6}
          value={prerequisiteInput}
          onChange={handlePrerequisiteChange}
          placeholder='JSON for learning, e.g., {"type": "spell", "name": "Light"}. Leave empty for no prerequisite.'
          className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm ${prerequisiteError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
        />
        {prerequisiteError && <p className="mt-2 text-sm text-red-600">{prerequisiteError}</p>}
        <p className="mt-1 text-xs text-gray-500">
          Use JSON format for learning prerequisites. Examples: <br />
          <code>{`{"type": "anySchool"}`}</code> <br />
          <code>{`{"type": "spell", "name": "Example Spell"}`}</code> <br />
          <code>{`{"type": "logical", "operator": "AND", "conditions": [...]}`}</code>
        </p>
      </div>

      <div>
        <label htmlFor="requirement" className="block text-sm font-medium text-gray-700">
          Casting Requirement (Text or leave empty)
        </label>
        <textarea
          name="requirement"
          id="requirement"
          rows={3}
          value={entry.requirement || ''}
          onChange={handleInputChange}
          placeholder="e.g., Requires a free hand, or Verbal component only. Leave empty if none."
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Describe any requirements for casting the spell (e.g., components, conditions).
        </p>
      </div>
    </div>
  );
}
