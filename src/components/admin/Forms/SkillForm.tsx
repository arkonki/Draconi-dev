import React from 'react';

// Assuming GameDataEntry can represent a skill structure
import { GameDataEntry } from '../hooks/useGameData';

interface SkillFormProps {
  entry: Partial<GameDataEntry>; // Use Partial for creation/editing flexibility
  onChange: (field: string, value: any) => void;
}

// Define common attributes or allow free text? Start with free text.
// const attributes = ['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'];

export const SkillForm: React.FC<SkillFormProps> = ({ entry, onChange }) => {
  return (
    <div className="space-y-4">
      {/* Name Input */}
      <div>
        <label htmlFor="skill-name" className="block text-sm font-medium text-gray-700 mb-1">
          Skill Name
        </label>
        <input
          id="skill-name"
          type="text"
          value={entry.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      {/* Description Textarea */}
      <div>
        <label htmlFor="skill-description" className="block text-sm font-medium text-gray-700 mb-1">
          Description (Optional)
        </label>
        <textarea
          id="skill-description"
          value={entry.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Attribute Input */}
      <div>
        <label htmlFor="skill-attribute" className="block text-sm font-medium text-gray-700 mb-1">
          Key Attribute (Optional)
        </label>
        <input
          id="skill-attribute"
          type="text"
          value={entry.attribute || ''}
          onChange={(e) => onChange('attribute', e.target.value || null)} // Store null if empty
          placeholder="e.g., STR, AGL, INT..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
         <p className="mt-1 text-xs text-gray-500">The primary attribute associated with this skill.</p>
      </div>

       {/* Display created_at if available (read-only) */}
       {entry.created_at && (
         <div className="mt-4 pt-2 border-t border-gray-200">
             <p className="text-xs text-gray-500">Created: {new Date(entry.created_at).toLocaleString()}</p>
         </div>
       )}
    </div>
  );
};
