import React, { useState } from 'react';

interface ProfessionFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

const allSkills: string[] = [
  'Acrobatics',
  'Animism',
  'Awareness',
  'Axes',
  'Bartering',
  'Beast Lore',
  'Bluffing',
  'Bows',
  'Brawling',
  'Bushcraft',
  'Crossbows',
  'Crafting',
  'Evade',
  'Elementalism',
  'Healing',
  'Hammers',
  'Hunting & Fishing',
  'Knives',
  'Languages',
  'Mentalism',
  'Myths & Legends',
  'Performance',
  'Persuasion',
  'Riding',
  'Seamanship',
  'Sleight of Hand',
  'Sneaking',
  'Slings',
  'Spears',
  'Spot Hidden',
  'Staves',
  'Swords',
  'Swimming'
].sort();

// Changed 'const' to 'export const'
export const ProfessionForm: React.FC<ProfessionFormProps> = ({ entry, onChange }) => {
  // Local state to track which tab is active
  const [activeTab, setActiveTab] = useState<'skills' | 'startingEquipment'>('skills');

  // Ensure the JSONB fields have default values if undefined
  const startingEquipment: string[] = entry.starting_equipment || ['', '', ''];
  const equipmentDescription: string[] = entry.equipment_description || ['', '', ''];

  // Handle updates for the equipment inputs
  const handleEquipmentChange = (
    index: number,
    field: 'equipment' | 'description',
    value: string
  ) => {
    if (field === 'equipment') {
      const newEquip = [...startingEquipment];
      newEquip[index] = value;
      onChange('starting_equipment', newEquip);
    } else {
      const newDesc = [...equipmentDescription];
      newDesc[index] = value;
      onChange('equipment_description', newDesc);
    }
  };

  return (
    <div className="space-y-4">
      {/* General fields */}
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
          Key Attribute
        </label>
        <input
          type="text"
          value={entry.key_attribute || ''}
          onChange={(e) => onChange('key_attribute', e.target.value)}
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
          Magic School
        </label>
        <select
          value={entry.magic_school_id || ""}
          onChange={(e) => onChange('magic_school_id', e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">None</option>
          <option value="Animist">Animist</option>
          <option value="Elementalist">Elementalist</option>
          <option value="Mentalist">Mentalist</option>
        </select>
      </div>

      {/* Tab Navigation */}
      <div className="mt-4">
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setActiveTab('skills')}
            className={`px-4 py-2 -mb-px font-medium ${
              activeTab === 'skills'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600'
            }`}
          >
            Skills
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('startingEquipment')}
            className={`px-4 py-2 -mb-px font-medium ${
              activeTab === 'startingEquipment'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600'
            }`}
          >
            Starting Equipment
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'skills' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills
            </label>
            <div className="grid grid-cols-3 gap-2">
              {allSkills.map((skill) => (
                <label key={skill} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={entry.skills ? entry.skills.includes(skill) : false}
                    onChange={(e) => {
                      let skills = entry.skills ? [...entry.skills] : [];
                      if (e.target.checked) {
                        skills.push(skill);
                      } else {
                        skills = skills.filter((s) => s !== skill);
                      }
                      onChange('skills', skills);
                    }}
                  />
                  <span className="text-sm">{skill}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'startingEquipment' && (
          <div className="mt-4 space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="border p-2 rounded-md">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment Option {index + 1}
                </label>
                <input
                  type="text"
                  placeholder="Enter equipment (e.g., Horn or Flute, knife, torch)"
                  value={startingEquipment[index] || ''}
                  onChange={(e) =>
                    handleEquipmentChange(index, 'equipment', e.target.value)
                  }
                  className="w-full px-3 py-2 border rounded-md mb-2"
                />
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Enter description (e.g., D6 food rations, D8 silver)"
                  value={equipmentDescription[index] || ''}
                  onChange={(e) =>
                    handleEquipmentChange(index, 'description', e.target.value)
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Removed the default export line
// export default ProfessionForm;
