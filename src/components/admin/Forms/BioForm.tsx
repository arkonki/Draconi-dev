import React from 'react';
import { Button } from '../../shared/Button';
import { Plus, Trash2 } from 'lucide-react';
import { BioData } from '../../../types/gameData'; // It's best to use a specific type

interface BioFormProps {
  // Use a more specific type than 'any' if available
  entry: BioData; 
  onChange: (field: string, value: any) => void;
}

// A reusable component for editing a dynamic list of strings.
// This is now a self-contained, well-structured component.
const DynamicListEditor: React.FC<{
  title: string;
  items: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, value: string) => void;
}> = ({ title, items, onAdd, onRemove, onUpdate }) => (
  <div className="space-y-3">
    <label className="block text-sm font-medium text-gray-700">{title}</label>
    {items.map((item, index) => (
      // FIX: Added a container with a unique `key` for each list item.
      <div key={index} className="flex items-center gap-2">
        <input
          type="text"
          value={item}
          // FIX: Correctly wired the `onUpdate` function to the `onChange` event.
          onChange={(e) => onUpdate(index, e.target.value)}
          className="w-full px-3 py-2 border rounded-md flex-grow"
          placeholder={`Enter ${title.replace(/s$/, '').toLowerCase()}...`}
        />
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          // FIX: Correctly wired the `onRemove` function to the `onClick` event.
          onClick={() => onRemove(index)}
          aria-label={`Remove ${title.slice(0, -1)}`}
        />
      </div>
    ))}
    {/* FIX: The "Add" action is now a proper button. */}
    <Button variant="secondary" size="sm" icon={Plus} onClick={onAdd}>
      Add {title.replace(/s$/, '')}
    </Button>
  </div>
);

// FIX: Correctly applied the BioFormProps type.
export const BioForm: React.FC<BioFormProps> = ({ entry, onChange }) => {
  
  // This handler function is well-written and requires no changes.
  const handleListChange = (
    field: 'appearance' | 'mementos' | 'flaws',
    action: 'add' | 'remove' | 'update',
    index?: number,
    value?: string
  ) => {
    const currentList = [...(entry[field] || [])];

    switch (action) {
      case 'add':
        currentList.push('');
        break;
      case 'remove':
        if (index !== undefined) {
          currentList.splice(index, 1);
        }
        break;
      case 'update':
        if (index !== undefined && value !== undefined) {
          currentList[index] = value;
        }
        break;
    }
    onChange(field, currentList);
  };

  // FIX: Wrapped the entire return statement in a single parent div.
  return (
    <div className="space-y-6">
      {/* FIX: Structured the name input with a label and helper text for clarity. */}
      <div>
        <label htmlFor="bio-name" className="block text-sm font-medium text-gray-700">Set Name</label>
        <input
          id="bio-name"
          type="text"
          value={entry.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          className="mt-1 w-full px-3 py-2 border rounded-md"
          placeholder="e.g., General, Human Commoner, Elven Ranger"
        />
        <p className="mt-2 text-sm text-gray-500">
          A unique name for this collection of bio options.
        </p>
      </div>

      <DynamicListEditor
        title="Appearance Options"
        items={entry.appearance || []}
        onAdd={() => handleListChange('appearance', 'add')}
        onRemove={(index) => handleListChange('appearance', 'remove', index)}
        onUpdate={(index, value) => handleListChange('appearance', 'update', index, value)}
      />

      <DynamicListEditor
        title="Mementos"
        items={entry.mementos || []}
        onAdd={() => handleListChange('mementos', 'add')}
        onRemove={(index) => handleListChange('mementos', 'remove', index)}
        onUpdate={(index, value) => handleListChange('mementos', 'update', index, value)}
      />

      <DynamicListEditor
        title="Flaws / Weak Spots"
        items={entry.flaws || []}
        onAdd={() => handleListChange('flaws', 'add')}
        onRemove={(index) => handleListChange('flaws', 'remove', index)}
        onUpdate={(index, value) => handleListChange('flaws', 'update', index, value)}
      />
    </div>
  );
};
