import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase'; // Adjust the import path to your supabase client

interface Skill {
  id: number;
  name: string;
  is_magic: boolean;
}

interface ProfessionFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

export const ProfessionForm: React.FC<ProfessionFormProps> = ({ entry, onChange }) => {
  const [activeTab, setActiveTab] = useState<'skills' | 'startingEquipment'>('skills');
  
  const [allSkillsFromDB, setAllSkillsFromDB] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSkills = async () => {
      setSkillsLoading(true);
      setSkillsError(null);
      
      const { data, error } = await supabase
        .from('game_skills') // CHANGED: Table name is now correct
        .select('id, name, is_magic')
        .order('name', { ascending: true });

      if (error) {
        console.error("Error fetching skills:", error);
        setSkillsError("Failed to load skills from the database.");
      } else {
        setAllSkillsFromDB(data || []);
      }
      setSkillsLoading(false);
    };

    fetchSkills();
  }, []);

  const magicSkills = useMemo(() => {
    return allSkillsFromDB.filter(skill => skill.is_magic === true);
  }, [allSkillsFromDB]);

  const startingEquipment: string[] = entry.starting_equipment || ['', '', ''];
  const equipmentDescription: string[] = entry.equipment_description || ['', '', ''];

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
  
  const handleIsMagicChange = (isChecked: boolean) => {
    onChange('is_magic', isChecked);
    if (!isChecked) {
      onChange('associated_skill', null);
    }
  };

  return (
    <div className="space-y-4">
      {/* General fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input type="text" value={entry.name || ''} onChange={(e) => onChange('name', e.target.value)} className="w-full px-3 py-2 border rounded-md" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea value={entry.description || ''} onChange={(e) => onChange('description', e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md" />
      </div>
      
      <div className="space-y-4 p-4 border rounded-md bg-gray-50">
        <div className="flex items-center gap-2">
            <input id="is_magic" type="checkbox" checked={entry.is_magic || false} onChange={(e) => handleIsMagicChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="is_magic" className="text-sm font-medium text-gray-900">Is this a magic profession?</label>
        </div>
        <div>
            <label htmlFor="associated_skill" className="block text-sm font-medium text-gray-700 mb-1">Associated Magic Skill</label>
            <select
                id="associated_skill"
                value={entry.associated_skill || ''}
                onChange={(e) => onChange('associated_skill', e.target.value || null)}
                className="w-full px-3 py-2 border rounded-md disabled:bg-gray-200 disabled:cursor-not-allowed"
                disabled={!entry.is_magic || skillsLoading || !!skillsError}
            >
              {skillsLoading && <option>Loading magic skills...</option>}
              {skillsError && <option>Error loading skills</option>}
              {!skillsLoading && !skillsError && (
                <>
                  <option value="">None</option>
                  {magicSkills.length > 0 ? (
                    magicSkills.map((skill) => (
                      <option key={skill.id} value={skill.name}>
                        {skill.name}
                      </option>
                    ))
                  ) : (
                    <option disabled>No skills marked as magic were found</option>
                  )}
                </>
              )}
            </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Key Attribute</label>
        <input type="text" value={entry.key_attribute || ''} onChange={(e) => onChange('key_attribute', e.target.value)} className="w-full px-3 py-2 border rounded-md" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heroic Ability</label>
        <input type="text" value={entry.heroic_ability || ''} onChange={(e) => onChange('heroic_ability', e.target.value)} className="w-full px-3 py-2 border rounded-md" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Magic School</label>
        <select value={entry.magic_school_id || ""} onChange={(e) => onChange('magic_school_id', e.target.value)} className="w-full px-3 py-2 border rounded-md">
          <option value="">None</option>
          <option value="Animist">Animist</option>
          <option value="Elementalist">Elementalist</option>
          <option value="Mentalist">Mentalist</option>
        </select>
      </div>

      <div className="mt-4">
        <div className="flex border-b">
          <button type="button" onClick={() => setActiveTab('skills')} className={`px-4 py-2 -mb-px font-medium ${activeTab === 'skills' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Skills</button>
          <button type="button" onClick={() => setActiveTab('startingEquipment')} className={`px-4 py-2 -mb-px font-medium ${activeTab === 'startingEquipment' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Starting Equipment</button>
        </div>

        {activeTab === 'skills' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
            {skillsLoading && <p className="text-sm text-gray-500">Loading skills...</p>}
            {skillsError && <p className="text-sm text-red-600">{skillsError}</p>}
            {!skillsLoading && !skillsError && (
              <div className="grid grid-cols-3 gap-2">
                {allSkillsFromDB.map((skill) => (
                  <label key={skill.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={entry.skills ? entry.skills.includes(skill.name) : false}
                      onChange={(e) => {
                        let skills = entry.skills ? [...entry.skills] : [];
                        if (e.target.checked) {
                          skills.push(skill.name);
                        } else {
                          skills = skills.filter((s) => s !== skill.name);
                        }
                        onChange('skills', skills);
                      }}
                    />
                    <span className="text-sm">{skill.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'startingEquipment' && (
          <div className="mt-4 space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="border p-2 rounded-md">
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Option {index + 1}</label>
                <input type="text" placeholder="Enter equipment (e.g., Horn or Flute, knife, torch)" value={startingEquipment[index] || ''} onChange={(e) => handleEquipmentChange(index, 'equipment', e.target.value)} className="w-full px-3 py-2 border rounded-md mb-2" />
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea placeholder="Enter description (e.g., D6 food rations, D8 silver)" value={equipmentDescription[index] || ''} onChange={(e) => handleEquipmentChange(index, 'description', e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
