import React from 'react';

// Assuming GameDataEntry can represent a skill structure
import { GameDataEntry } from '../hooks/useGameData';

interface SkillFormProps {
  entry: Partial<GameDataEntry>; // Use Partial for creation/editing flexibility
  onChange: (field: string, value: unknown) => void;
}

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

      {/* --- NEW FIELD START --- */}
      <div className="flex items-center gap-3 pt-2">
        <input
          id="is_magic_skill"
          type="checkbox"
          checked={entry.is_magic || false} // Bind to the 'is_magic' field, default to false
          onChange={(e) => onChange('is_magic', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
            <label htmlFor="is_magic_skill" className="text-sm font-medium text-gray-900">
                Is this a magic skill?
            </label>
            <p className="text-xs text-gray-500">Check if this skill is related to magic or spellcasting.</p>
        </div>
      </div>
      {/* --- NEW FIELD END --- */}

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
          placeholder="e.g., STR, AGL, WIL..."
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
