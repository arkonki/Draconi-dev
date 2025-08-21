import React, { useState, useCallback, useEffect } from 'react';
    import { supabase } from '../../lib/supabase';
    import {
      Wand2,
      Sword,
      Shield,
      Search,
      Filter,
      Plus,
      Save,
      X,
      Edit2,
      Trash2,
      Users,
      Briefcase,
      Scroll,
      Skull, // Icon for Monsters
    } from 'lucide-react';
    import { Button } from '../shared/Button';
    // Import specific forms
    import { ItemForm } from './Forms/ItemForm';
    import { KinForm } from './Forms/KinForm';
    import { ProfessionForm } from './Forms/ProfessionForm';
    import { AbilityForm } from './Forms/AbilityForm';
    import { SpellForm } from './Forms/SpellForm';
    import { SkillForm } from './Forms/SkillForm';
    import { MonsterForm } from './Forms/MonsterForm'; // Import MonsterForm

    import { useGameData, DataCategory, GameDataEntry } from '../../hooks/useGameData';
    import { ErrorMessage } from '../shared/ErrorMessage';
    import { isSkillNameRequirement } from '../../types/character';
    import { MonsterData, MONSTER_SIZES } from '../../types/bestiary'; // Import MonsterData types

    // Define the categories and their display properties
    const CATEGORIES: { id: DataCategory; label: string; icon: React.ElementType }[] = [
      { id: 'items', label: 'Items', icon: Sword },
      { id: 'spells', label: 'Spells', icon: Wand2 },
      { id: 'abilities', label: 'Abilities', icon: Shield },
      { id: 'kin', label: 'Kin', icon: Users },
      { id: 'profession', label: 'Professions', icon: Briefcase },
      { id: 'skills', label: 'Skills', icon: Scroll },
      { id: 'monsters', label: 'Monsters', icon: Skull }, // Monsters tab after Skills
    ];

    // Helper function to format ability requirements for display - GUARANTEED TO RETURN STRING
    const formatAbilityRequirement = (requirement: any): string => {
      try {
        if (isSkillNameRequirement(requirement)) {
          const skills = Object.entries(requirement);
          if (skills.length === 0) return 'None';
          return skills
            .map(([name, level]) => `${name}${level !== null ? ` (Lvl ${level})` : ''}`)
            .join(', ') || 'None';
        }
        if (typeof requirement === 'string' && requirement) {
          return requirement;
        }
        if (typeof requirement === 'object' && requirement !== null) {
           const keys = Object.keys(requirement);
           if (keys.length > 0) {
              if (/^[0-9a-fA-F]{8}-/.test(keys[0])) {
                  return `${keys.length} skill(s) (Legacy UUIDs)`;
              }
              if (keys.length === 1 && typeof requirement[keys[0]] === 'object') {
                 return `Requirement: ${keys[0]} (Invalid Format)`;
              }
              return `${keys.length} requirement(s) (Unknown format)`;
           }
        }
        return 'None';
      } catch (error) {
          console.error("Error formatting requirement:", requirement, error);
          return "Error: Invalid Format";
      }
    };


    export function GameDataManager() {
      const [editingEntry, setEditingEntry] = useState<GameDataEntry | null>(null);
      const [searchTerm, setSearchTerm] = useState('');
      const [saveError, setSaveError] = useState<string | null>(null);
      const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
      const [itemCategories, setItemCategories] = useState<string[]>([]);
      const [magicSchools, setMagicSchools] = useState<{ id: string; name: string }[]>([]);
      const [monsterCategories, setMonsterCategories] = useState<string[]>([]); // For monster category filter

      const {
        entries,
        loading,
        error: loadError,
        handleSave: saveData,
        handleDelete: deleteData,
        switchCategory,
        activeCategory
      } = useGameData('items');

      const fetchItemCategories = useCallback(async () => {
        const { data, error } = await supabase
          .from('game_items')
          .select('category', { count: 'exact', head: false });
        if (error) console.error("Error fetching item categories:", error);
        else if (data) setItemCategories([...new Set(data.map(item => item.category).filter(Boolean))] as string[]);
      }, []);

      const fetchMagicSchools = useCallback(async () => {
        const { data, error } = await supabase.from('magic_schools').select('id, name').order('name');
        if (error) console.error("Error fetching magic schools:", error);
        else if (data) setMagicSchools(data);
      }, []);

      const fetchMonsterCategories = useCallback(async () => {
        const { data, error } = await supabase
          .from('monsters')
          .select('category', { count: 'exact', head: false });
        if (error) console.error("Error fetching monster categories:", error);
        else if (data) setMonsterCategories([...new Set(data.map(item => item.category).filter(Boolean))] as string[]);
      }, []);


      useEffect(() => {
        setSelectedSubCategory('');
        if (activeCategory === 'items') {
          fetchItemCategories();
          setMagicSchools([]);
          setMonsterCategories([]);
        } else if (activeCategory === 'spells') {
          fetchMagicSchools();
          setItemCategories([]);
          setMonsterCategories([]);
        } else if (activeCategory === 'monsters') {
          fetchMonsterCategories();
          setItemCategories([]);
          setMagicSchools([]);
        } else {
          setItemCategories([]);
          setMagicSchools([]);
          setMonsterCategories([]);
        }
      }, [activeCategory, fetchItemCategories, fetchMagicSchools, fetchMonsterCategories]);


      const handleSaveSuccess = useCallback((savedEntry: GameDataEntry) => {
        console.log('Save successful, closing modal for:', savedEntry);
        setEditingEntry(null);
        setSaveError(null);
        if (activeCategory === 'items') fetchItemCategories();
        if (activeCategory === 'monsters') fetchMonsterCategories();
      }, [activeCategory, fetchItemCategories, fetchMonsterCategories]);


      const handleSave = useCallback(async () => {
        if (!editingEntry) return;
        console.log(`Calling hook's handleSave for category: ${activeCategory}`);
        await saveData(activeCategory, editingEntry, handleSaveSuccess, setSaveError);
      }, [editingEntry, activeCategory, saveData, handleSaveSuccess]);


      const handleDelete = useCallback(async (id: string) => {
        if (!id) return;
        console.log(`Calling hook's handleDelete for category: ${activeCategory}, ID: ${id}`);
        await deleteData(activeCategory, id);
        if (activeCategory === 'items') fetchItemCategories();
        if (activeCategory === 'monsters') fetchMonsterCategories();
      }, [activeCategory, deleteData, fetchItemCategories, fetchMonsterCategories]);


      const handleFieldChange = useCallback((field: string, value: any) => {
        setEditingEntry(prev => prev ? ({ ...prev, [field]: value }) : null);
      }, []);

      const createNewEntry = useCallback(() => {
        setSaveError(null);
        let newEntry: GameDataEntry = { name: '' }; // Base for all
        console.log(`Creating new entry for category: ${activeCategory}`);
        switch (activeCategory) {
          case 'spells':
            newEntry = { ...newEntry, description: '', rank: 1, school_id: null, casting_time: '', range: '', duration: '', willpower_cost: 0 };
            break;
          case 'items':
            newEntry = { ...newEntry, description: '', category: '', cost: 0, weight: 0 };
            break;
          case 'abilities':
            newEntry = { ...newEntry, description: '', willpower_cost: null, requirement: {}, profession: null, kin: null };
            break;
          case 'kin':
            newEntry = { ...newEntry, description: '', key_attribute: '', typical_profession: '', kin_abilities: [] };
            break;
          case 'profession':
            newEntry = { ...newEntry, description: '', key_attribute: '', skills: [] };
            break;
          case 'skills':
            newEntry = { ...newEntry, description: '', attribute: null };
            break;
          case 'monsters': // Added case for monsters
            newEntry = {
              name: '',
              description: '',
              category: '',
              stats: { FEROCITY: 0, SIZE: 'Normal', MOVEMENT: 0, ARMOR: 0, HP: 10 },
              attacks: [],
            } as MonsterData; // Type assertion
            break;
        }
        setEditingEntry(newEntry);
      }, [activeCategory]);

      const renderForm = useCallback(() => {
        if (!editingEntry) return null;

        switch (activeCategory) {
          case 'spells':
            return <SpellForm entry={editingEntry as any} onChange={handleFieldChange} magicSchools={magicSchools} />;
          case 'items':
            return <ItemForm entry={editingEntry as any} onChange={handleFieldChange} />;
          case 'abilities':
            return <AbilityForm entry={editingEntry as any} onChange={handleFieldChange} />;
          case 'kin':
            return <KinForm entry={editingEntry as any} onChange={handleFieldChange} />;
          case 'profession':
            return <ProfessionForm entry={editingEntry as any} onChange={handleFieldChange} />;
          case 'skills':
            return <SkillForm entry={editingEntry as any} onChange={handleFieldChange} />;
          case 'monsters': // Added case for monsters
            return <MonsterForm entry={editingEntry as MonsterData} onChange={handleFieldChange} />;
          default:
            return <p>No form available for this category.</p>;
        }
      }, [editingEntry, activeCategory, handleFieldChange, magicSchools]);

      const filteredEntries = entries.filter(entry => {
        const nameMatch = entry.name?.toLowerCase().includes(searchTerm.toLowerCase());
        let categoryMatch = true;

        if (selectedSubCategory) {
          if (activeCategory === 'items') {
            categoryMatch = (entry as any).category?.toLowerCase() === selectedSubCategory.toLowerCase();
          } else if (activeCategory === 'spells') {
            const schoolName = (entry as any).magic_schools;
            if (selectedSubCategory === 'General') categoryMatch = !schoolName;
            else categoryMatch = schoolName?.toLowerCase() === selectedSubCategory.toLowerCase();
          } else if (activeCategory === 'monsters') {
            categoryMatch = (entry as MonsterData).category?.toLowerCase() === selectedSubCategory.toLowerCase();
          }
        }
        return nameMatch && categoryMatch;
      });

      const closeModal = useCallback(() => {
        setEditingEntry(null);
        setSaveError(null);
      }, []);

      const currentSubCategories = activeCategory === 'items'
        ? itemCategories
        : activeCategory === 'spells'
          ? ['General', ...magicSchools.map(s => s.name)].sort()
          : activeCategory === 'monsters'
            ? monsterCategories.sort()
            : [];

      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Game Data Management</h2>
            <Button variant="primary" icon={Plus} onClick={createNewEntry} disabled={loading}>
              Add Entry
            </Button>
          </div>

          {loadError && <ErrorMessage message={`Error loading data: ${loadError}`} />}

          <div className="flex gap-4 border-b overflow-x-auto pb-2">
            {CATEGORIES.map(({ id: cat, label, icon: Icon }) => (
              <button
                key={cat}
                onClick={() => switchCategory(cat)}
                className={`px-4 py-2 font-medium flex items-center gap-2 whitespace-nowrap ${
                  activeCategory === cat ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
                }`}
                disabled={loading}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={`Search ${activeCategory}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
                disabled={loading}
              />
            </div>

            {(activeCategory === 'items' || activeCategory === 'spells' || activeCategory === 'monsters') && currentSubCategories.length > 0 && (
              <div className="relative flex-1 sm:flex-none sm:w-48">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <select
                  value={selectedSubCategory}
                  onChange={(e) => setSelectedSubCategory(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none bg-white"
                  disabled={loading}
                >
                  <option value="">All {
                    activeCategory === 'items' ? 'Categories' :
                    activeCategory === 'spells' ? 'Schools' :
                    activeCategory === 'monsters' ? 'Categories' : ''
                  }</option>
                  {currentSubCategories.map(subCat => (
                    <option key={subCat} value={subCat}>{subCat}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            )}
          </div>

          {loading && !entries.length ? (
            <p className="text-center py-4">Loading {activeCategory}...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Name</th>
                    {activeCategory === 'spells' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">School</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Rank</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">WP Cost</th>
                    </>)}
                    {activeCategory === 'items' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Category</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Cost</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Weight</th>
                    </>)}
                    {activeCategory === 'abilities' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">WP Cost</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Requirement</th>
                    </>)}
                    {activeCategory === 'kin' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Key Attribute</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Typical Profession</th>
                    </>)}
                    {activeCategory === 'profession' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Key Attribute</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Skills</th>
                    </>)}
                    {activeCategory === 'skills' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Attribute</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Description</th>
                    </>)}
                    {activeCategory === 'monsters' && (<>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Category</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">HP</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Armor</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Size</th>
                    </>)}
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    let requirementDisplay: string | React.ReactNode = 'N/A';
                    if (activeCategory === 'abilities') {
                      requirementDisplay = formatAbilityRequirement((entry as any).requirement);
                    }

                    const monsterEntry = activeCategory === 'monsters' ? entry as MonsterData : null;

                    return (
                      <tr key={entry.id || entry.name} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2 align-top">{entry.name}</td>
                        {activeCategory === 'spells' && (<>
                          <td className="px-4 py-2 align-top">{(entry as any).magic_schools || 'General'}</td>
                          <td className="px-4 py-2 align-top">{(entry as any).rank === 0 ? 'Trick' : `Rank ${(entry as any).rank}`}</td>
                          <td className="px-4 py-2 align-top">{(entry as any).willpower_cost} WP</td>
                        </>)}
                        {activeCategory === 'items' && (<>
                          <td className="px-4 py-2 align-top">{(entry as any).category}</td>
                          <td className="px-4 py-2 align-top">{(entry as any).cost}</td>
                          <td className="px-4 py-2 align-top">{(entry as any).weight}</td>
                        </>)}
                        {activeCategory === 'abilities' && (<>
                          <td className="px-4 py-2 align-top">{(entry as any).willpower_cost ?? 'N/A'}</td>
                          <td className="px-4 py-2 align-top text-sm text-gray-600 max-w-xs truncate" title={typeof requirementDisplay === 'string' ? requirementDisplay : 'Invalid Data'}>
                            {requirementDisplay}
                          </td>
                        </>)}
                        {activeCategory === 'kin' && (<>
                          <td className="px-4 py-2 align-top">{(entry as any).key_attribute}</td>
                          <td className="px-4 py-2 align-top">{(entry as any).typical_profession}</td>
                        </>)}
                        {activeCategory === 'profession' && (<>
                          <td className="px-4 py-2 align-top">{(entry as any).key_attribute}</td>
                          <td className="px-4 py-2 align-top text-sm text-gray-600 max-w-xs truncate">{Array.isArray((entry as any).skills) ? (entry as any).skills.join(', ') : ''}</td>
                        </>)}
                        {activeCategory === 'skills' && (<>
                          <td className="px-4 py-2 align-top">{(entry as any).attribute || 'N/A'}</td>
                          <td className="px-4 py-2 align-top text-sm text-gray-600 truncate max-w-xs" title={(entry as any).description || ''}>{(entry as any).description}</td>
                        </>)}
                        {activeCategory === 'monsters' && monsterEntry && (<>
                          <td className="px-4 py-2 align-top">{monsterEntry.category}</td>
                          <td className="px-4 py-2 align-top">{monsterEntry.stats?.HP}</td>
                          <td className="px-4 py-2 align-top">{monsterEntry.stats?.ARMOR}</td>
                          <td className="px-4 py-2 align-top">{monsterEntry.stats?.SIZE}</td>
                        </>)}
                        <td className="px-4 py-2 align-top">
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" icon={Edit2} onClick={() => { setSaveError(null); setEditingEntry(entry); }} disabled={!entry.id}>
                              Edit
                            </Button>
                            <Button variant="danger" size="sm" icon={Trash2} onClick={() => entry.id && handleDelete(entry.id)} disabled={!entry.id || loading}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredEntries.length === 0 && !loading && !loadError && (
                <p className="text-center text-gray-500 py-4">
                  {searchTerm || selectedSubCategory ? `No ${activeCategory} found matching filters.` : `No entries for '${activeCategory}'.`}
                </p>
              )}
            </div>
          )}

          {editingEntry && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
              <div className="bg-white rounded-lg max-w-2xl w-full p-6 my-8 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 sticky top-0 bg-white py-2 z-10 border-b">
                  <h3 className="text-lg font-semibold">
                    {editingEntry.id ? `Edit ${activeCategory}` : `New ${activeCategory}`}
                  </h3>
                  <button onClick={closeModal} className="text-gray-500 hover:text-gray-700"><X className="w-6 h-6" /></button>
                </div>
                {saveError && <div className="mb-4"><ErrorMessage message={saveError} /></div>}
                <div className="flex-grow overflow-y-auto pr-2">{renderForm()}</div>
                <div className="flex justify-end gap-4 mt-6 sticky bottom-0 bg-white py-3 z-10 border-t">
                  <Button variant="secondary" onClick={closeModal} disabled={loading}>Cancel</Button>
                  <Button variant="primary" icon={Save} onClick={handleSave} disabled={loading}>
                    {loading ? 'Saving...' : (editingEntry.id ? 'Update Entry' : 'Save Entry')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
