import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase'; // Adjust the import path
import { Plus, X, Save } from 'lucide-react';
import { Button } from '../../shared/Button'; // Assuming a Button component /src/components/shared/Button.tsx

// --- Interfaces for Type Safety ---
interface Skill {
  id: number;
  name: string;
  is_magic: boolean;
}

interface MagicSchool {
  id: string;
  name: string;
}

interface NewMagicSchoolData {
  name: string;
  description: string;
  key_attribute: string;
  base_skills: string[];
}

interface ProfessionFormEntry {
  name?: string;
  description?: string;
  is_magic?: boolean;
  associated_skill?: string | null;
  key_attribute?: string;
  heroic_ability?: string;
  magic_school_id?: string | null;
  skills?: string[];
  starting_equipment?: string[];
  equipment_description?: string[];
  [key: string]: unknown;
}

interface ProfessionFormProps {
  entry: ProfessionFormEntry;
  onChange: (field: string, value: unknown) => void;
}

// --- Reusable Modal Component for Creating a New Magic School ---
const NewMagicSchoolModal: React.FC<{
  onClose: () => void;
  onSave: (newSchool: NewMagicSchoolData) => Promise<void>;
  loading: boolean;
  error: string | null;
}> = ({ onClose, onSave, loading, error }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keyAttribute, setKeyAttribute] = useState('');
  const [baseSkills, setBaseSkills] = useState(''); // Handled as a comma-separated string in UI

  const handleSave = () => {
    if (!name || !keyAttribute) {
      alert("School Name and Key Attribute are required.");
      return;
    }
    const newSchoolData: NewMagicSchoolData = {
      name,
      description,
      key_attribute: keyAttribute,
      base_skills: baseSkills.split(',').map(s => s.trim()).filter(Boolean),
    };
    onSave(newSchoolData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-lg font-semibold">Create New Magic School</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button>
        </div>
        
        {error && <p className="text-red-600 bg-red-100 p-2 rounded-md">{error}</p>}
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Key Attribute</label>
          <input type="text" value={keyAttribute} onChange={(e) => setKeyAttribute(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base Skills (comma-separated)</label>
          <input type="text" value={baseSkills} onChange={(e) => setBaseSkills(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="e.g., Awareness, Myths & Legends" />
        </div>

        <div className="flex justify-end gap-4 mt-4 border-t pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" icon={Save} onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save School'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- Updated Profession Form ---
export const ProfessionForm: React.FC<ProfessionFormProps> = ({ entry, onChange }) => {
  const [activeTab, setActiveTab] = useState<'skills' | 'startingEquipment'>('skills');
  
  // State for skills
  const [allSkillsFromDB, setAllSkillsFromDB] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  // State for magic schools
  const [magicSchools, setMagicSchools] = useState<MagicSchool[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  
  // State for creating a new magic school via modal
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [createSchoolLoading, setCreateSchoolLoading] = useState(false);
  const [createSchoolError, setCreateSchoolError] = useState<string | null>(null);

  // Fetching logic for skills and schools
  const fetchSkills = useCallback(async () => {
    setSkillsLoading(true);
    setSkillsError(null);
    const { data, error } = await supabase.from('game_skills').select('id, name, is_magic').order('name');
    if (error) {
      console.error("Error fetching skills:", error);
      setSkillsError("Failed to load skills.");
    } else {
      setAllSkillsFromDB(data || []);
    }
    setSkillsLoading(false);
  }, []);

  const fetchMagicSchools = useCallback(async () => {
    setSchoolsLoading(true);
    setSchoolsError(null);
    const { data, error } = await supabase.from('magic_schools').select('id, name').order('name');
    if (error) {
      console.error("Error fetching magic schools:", error);
      setSchoolsError("Failed to load magic schools.");
    } else {
      setMagicSchools(data || []);
    }
    setSchoolsLoading(false);
  }, []);

  useEffect(() => {
    fetchSkills();
    fetchMagicSchools();
  }, [fetchSkills, fetchMagicSchools]);

  // Handler for saving a new magic school from the modal
  const handleSaveNewSchool = async (newSchoolData: NewMagicSchoolData) => {
    setCreateSchoolLoading(true);
    setCreateSchoolError(null);
    const { data, error } = await supabase
      .from('magic_schools')
      .insert([newSchoolData])
      .select('id')
      .single();

    setCreateSchoolLoading(false);

    if (error) {
      console.error("Error creating magic school:", error);
      setCreateSchoolError(`Failed to save: ${error.message}`);
    } else {
      setIsCreatingSchool(false);
      await fetchMagicSchools();
      if (data?.id) {
          onChange('magic_school_id', data.id); // Auto-select the new school
      }
    }
  };

  const magicSkills = useMemo(() => {
    return allSkillsFromDB.filter(skill => skill.is_magic);
  }, [allSkillsFromDB]);

  // Equipment change handlers (unchanged)
  const startingEquipment: string[] = entry.starting_equipment || ['', '', ''];
  const equipmentDescription: string[] = entry.equipment_description || ['', '', ''];

  const handleEquipmentChange = (index: number, field: 'equipment' | 'description', value: string) => {
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
    <>
      {isCreatingSchool && (
        <NewMagicSchoolModal
          onClose={() => setIsCreatingSchool(false)}
          onSave={handleSaveNewSchool}
          loading={createSchoolLoading}
          error={createSchoolError}
        />
      )}

      <div className="space-y-4">
        {/* General fields (unchanged) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={entry.name || ''} onChange={(e) => onChange('name', e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={entry.description || ''} onChange={(e) => onChange('description', e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md" />
        </div>
        
        {/* Magic Profession section (unchanged) */}
        <div className="space-y-4 p-4 border rounded-md bg-gray-50">
          <div className="flex items-center gap-2">
              <input id="is_magic" type="checkbox" checked={entry.is_magic || false} onChange={(e) => handleIsMagicChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <label htmlFor="is_magic" className="text-sm font-medium text-gray-900">Is this a magic profession?</label>
          </div>
          <div>
              <label htmlFor="associated_skill" className="block text-sm font-medium text-gray-700 mb-1">Associated Magic Skill</label>
              <select id="associated_skill" value={entry.associated_skill || ''} onChange={(e) => onChange('associated_skill', e.target.value || null)} className="w-full px-3 py-2 border rounded-md disabled:bg-gray-200" disabled={!entry.is_magic || skillsLoading || !!skillsError}>
                {skillsLoading ? <option>Loading...</option> : <><option value="">None</option>{magicSkills.map((skill) => (<option key={skill.id} value={skill.name}>{skill.name}</option>))}</>}
              </select>
          </div>
        </div>

        {/* Other fields (unchanged) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Key Attribute</label>
          <input type="text" value={entry.key_attribute || ''} onChange={(e) => onChange('key_attribute', e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Heroic Ability</label>
          <input type="text" value={entry.heroic_ability || ''} onChange={(e) => onChange('heroic_ability', e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>

        {/* --- UPDATED MAGIC SCHOOL SECTION --- */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Magic School</label>
          <div className="flex items-center gap-2">
            <select
              value={entry.magic_school_id || ""}
              onChange={(e) => onChange('magic_school_id', e.target.value || null)}
              className="flex-grow w-full px-3 py-2 border rounded-md"
              disabled={schoolsLoading}
            >
              <option value="">None</option>
              {schoolsLoading && <option disabled>Loading schools...</option>}
              {schoolsError && <option disabled>{schoolsError}</option>}
              {!schoolsLoading && !schoolsError && (
                magicSchools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))
              )}
            </select>
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => {
                setCreateSchoolError(null);
                setIsCreatingSchool(true);
              }}
              disabled={schoolsLoading}
            >
              Create
            </Button>
          </div>
        </div>

        {/* Tabbed content (unchanged) */}
        <div className="mt-4">
          <div className="flex border-b">
            <button type="button" onClick={() => setActiveTab('skills')} className={`px-4 py-2 -mb-px font-medium ${activeTab === 'skills' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Skills</button>
            <button type="button" onClick={() => setActiveTab('startingEquipment')} className={`px-4 py-2 -mb-px font-medium ${activeTab === 'startingEquipment' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Starting Equipment</button>
          </div>
          {activeTab === 'skills' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
              {skillsLoading ? <p>Loading...</p> : skillsError ? <p className="text-red-500">{skillsError}</p> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {allSkillsFromDB.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={entry.skills?.includes(skill.name) ?? false} onChange={(e) => {
                        const skills = new Set(entry.skills || []);
                        e.target.checked ? skills.add(skill.name) : skills.delete(skill.name);
                        onChange('skills', Array.from(skills));
                      }}/>
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
                <div key={index} className="border p-3 rounded-md bg-gray-50">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Option {index + 1}</label>
                  <input type="text" placeholder="e.g., Horn or Flute, knife, torch" value={startingEquipment[index] || ''} onChange={(e) => handleEquipmentChange(index, 'equipment', e.target.value)} className="w-full px-3 py-2 border rounded-md mb-2" />
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea placeholder="e.g., D6 food rations, D8 silver" value={equipmentDescription[index] || ''} onChange={(e) => handleEquipmentChange(index, 'description', e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
