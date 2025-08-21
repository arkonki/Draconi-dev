import React from 'react';

interface KinFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

// Changed 'const' to 'export const'
export const KinForm: React.FC<KinFormProps> = ({ entry, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          type="text"
          value={entry.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={entry.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Heroic Ability
        </label>
        <input
          type="text"
          value={entry.heroic_ability || ''}
          onChange={(e) => onChange('heroic_ability', e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Abilities
        </label>
        {(entry.abilities || []).map((ability: any, idx: number) => (
          <div key={idx} className="flex gap-2 items-center mb-1">
            <input
              type="text"
              placeholder="Ability Description"
              value={ability.description || ''}
              onChange={(e) => {
                const updatedAbilities = [...(entry.abilities || [])];
                updatedAbilities[idx] = { ...updatedAbilities[idx], description: e.target.value };
                onChange('abilities', updatedAbilities);
              }}
              className="border rounded-md px-2 py-1 flex-1"
            />
            <input
              type="number"
              placeholder="Willpower Points"
              value={ability.willpower_points || 0}
              onChange={(e) => {
                const updatedAbilities = [...(entry.abilities || [])];
                updatedAbilities[idx] = {
                  ...updatedAbilities[idx],
                  willpower_points: parseInt(e.target.value),
                };
                onChange('abilities', updatedAbilities);
              }}
              className="border rounded-md px-2 py-1 w-20"
              min="0"
            />
            <button
              onClick={() => {
                const updatedAbilities = [...(entry.abilities || [])];
                updatedAbilities.splice(idx, 1);
                onChange('abilities', updatedAbilities);
              }}
              className="text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const updatedAbilities = [...(entry.abilities || []), { description: '', willpower_points: 0 }];
            onChange('abilities', updatedAbilities);
          }}
          className="mt-2 text-blue-600"
        >
          Add Ability
        </button>
      </div>
    </div>
  );
};

// Removed the default export line
// export default KinForm;
