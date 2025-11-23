import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
    Wand2, Sword, Shield, Search, Filter, Plus, Save, X, Edit2, Trash2, Users, Briefcase, Scroll, Skull, BookUser
} from 'lucide-react';
import { Button } from '../shared/Button';
import { ItemForm } from './Forms/ItemForm';
import { KinForm } from './Forms/KinForm';
import { ProfessionForm } from './Forms/ProfessionForm';
import { AbilityForm } from './Forms/AbilityForm';
import { SpellForm } from './Forms/SpellForm';
import { SkillForm } from './Forms/SkillForm';
import { MonsterForm } from './Forms/MonsterForm';
import { BioForm } from './Forms/BioForm';
import { useGameData } from '../../hooks/useGameData';
import { ErrorMessage } from '../shared/ErrorMessage';
import { isSkillNameRequirement } from '../../types/character';

// --- CONSTANTS ---
const CATEGORIES = [
    { id: 'items', label: 'Items', icon: Sword },
    { id: 'spells', label: 'Spells', icon: Wand2 },
    { id: 'abilities', label: 'Abilities', icon: Shield },
    { id: 'kin', label: 'Kin', icon: Users },
    { id: 'profession', label: 'Professions', icon: Briefcase },
    { id: 'skills', label: 'Skills', icon: Scroll },
    { id: 'monsters', label: 'Monsters', icon: Skull },
    { id: 'bio', label: 'Bio Options', icon: BookUser },
];

// --- HELPER FUNCTIONS ---
const formatAbilityRequirement = (requirement: any) => {
    try {
        if (isSkillNameRequirement(requirement)) {
            const skills = Object.entries(requirement);
            if (skills.length === 0) return 'None';
            return skills
                .map(([name, level]) => `${name}${level !== null ? ` (Lvl ${level})` : ''}`)
                .join(', ') || 'None';
        }
        if (typeof requirement === 'string' && requirement) return requirement;
        if (typeof requirement === 'object' && requirement !== null) {
            const keys = Object.keys(requirement);
            if (keys.length > 0) {
                if (/^[0-9a-fA-F]{8}-/.test(keys[0])) return `${keys.length} skill(s) (Legacy UUIDs)`;
                if (keys.length === 1 && typeof requirement[keys[0]] === 'object') return `Requirement: ${keys[0]} (Invalid Format)`;
                return `${keys.length} requirement(s) (Unknown format)`;
            }
        }
        return 'None';
    } catch (error) {
        console.error("Error formatting requirement:", requirement, error);
        return "Error: Invalid Format";
    }
};

// --- CUSTOM HOOK FOR LOGIC ---
const useGameDataManagement = () => {
    const [editingEntry, setEditingEntry] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState('');
    const [itemCategories, setItemCategories] = useState<string[]>([]);
    const [magicSchools, setMagicSchools] = useState<any[]>([]);
    const [monsterCategories, setMonsterCategories] = useState<string[]>([]);

    const {
        entries, loading, error: loadError, handleSave: saveData, handleDelete: deleteData, switchCategory, activeCategory
    } = useGameData('items');

    const fetchData = useCallback(async (category: string, setter: React.Dispatch<React.SetStateAction<any[]>>) => {
        const { data, error } = await supabase.from(category).select('category');
        if (error) console.error(`Error fetching ${category} categories:`, error);
        else if (data) setter([...new Set(data.map((item: any) => item.category).filter(Boolean))]);
    }, []);

    const fetchMagicSchools = useCallback(async () => {
        const { data, error } = await supabase.from('magic_schools').select('id, name').order('name');
        if (error) console.error("Error fetching magic schools:", error);
        else if (data) setMagicSchools(data);
    }, []);

    useEffect(() => {
        setSelectedSubCategory('');
        if (activeCategory === 'items') fetchData('game_items', setItemCategories);
        else if (activeCategory === 'spells') fetchMagicSchools();
        else if (activeCategory === 'monsters') fetchData('monsters', setMonsterCategories);
    }, [activeCategory, fetchData, fetchMagicSchools]);

    const handleSaveSuccess = useCallback(() => {
        setEditingEntry(null);
        setSaveError(null);
        if (activeCategory === 'items') fetchData('game_items', setItemCategories);
        if (activeCategory === 'monsters') fetchData('monsters', setMonsterCategories);
    }, [activeCategory, fetchData]);

    const handleSave = useCallback(async () => {
        if (!editingEntry) return;

        let dataToSave = editingEntry;
        // Remove helper properties if necessary before saving
        if (activeCategory === 'spells') {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { magic_schools, ...cleanEntry } = editingEntry;
            dataToSave = cleanEntry;
        }

        await saveData(activeCategory, dataToSave, handleSaveSuccess, setSaveError);
    }, [editingEntry, activeCategory, saveData, handleSaveSuccess]);

    const handleDelete = useCallback(async (id: string) => {
        if (!id) return;
        if(!window.confirm("Are you sure you want to delete this entry?")) return;
        await deleteData(activeCategory, id);
        if (activeCategory === 'items') fetchData('game_items', setItemCategories);
        if (activeCategory === 'monsters') fetchData('monsters', setMonsterCategories);
    }, [activeCategory, deleteData, fetchData]);

    const handleFieldChange = useCallback((field: string, value: any) => {
        setEditingEntry((prev: any) => prev ? ({ ...prev, [field]: value }) : null);
    }, []);

    const createNewEntry = useCallback(() => {
        setSaveError(null);
        let newEntry: any = { name: '' };
        switch (activeCategory) {
            case 'spells': newEntry = { ...newEntry, description: '', rank: 1, school_id: null, casting_time: '', range: '', duration: '', willpower_cost: 0 }; break;
            case 'items': newEntry = { ...newEntry, description: '', category: '', cost: 0, weight: 0 }; break;
            case 'abilities': newEntry = { ...newEntry, description: '', willpower_cost: null, requirement: {}, profession: null, kin: null }; break;
            case 'kin': newEntry = { ...newEntry, description: '', key_attribute: '', typical_profession: '', kin_abilities: [] }; break;
            case 'profession': newEntry = { ...newEntry, description: '', key_attribute: '', skills: [] }; break;
            case 'skills': newEntry = { ...newEntry, description: '', attribute: null }; break;
            case 'monsters': newEntry = { name: '', description: '', category: '', stats: { FEROCITY: 0, SIZE: 'Normal', MOVEMENT: 0, ARMOR: 0, HP: 10 }, attacks: [] }; break;
            case 'bio': newEntry = { name: '', appearance: [], mementos: [], flaws: [] }; break;
            default: break;
        }
        setEditingEntry(newEntry);
    }, [activeCategory]);

    const filteredEntries = useMemo(() => entries.filter((entry: any) => {
        const nameMatch = entry.name?.toLowerCase().includes(searchTerm.toLowerCase());
        if (!nameMatch) return false;

        if (selectedSubCategory) {
            if (activeCategory === 'items') {
                return entry.category?.toLowerCase() === selectedSubCategory.toLowerCase();
            }
            if (activeCategory === 'spells') {
                if (selectedSubCategory === 'General') {
                    return !entry.school_id;
                }
                const school = magicSchools.find(s => s.id === entry.school_id);
                return school?.name?.toLowerCase() === selectedSubCategory.toLowerCase();
            }
            if (activeCategory === 'monsters') {
                return entry.category?.toLowerCase() === selectedSubCategory.toLowerCase();
            }
        }
        return true;
    }), [entries, searchTerm, selectedSubCategory, activeCategory, magicSchools]);

    const closeModal = useCallback(() => {
        setEditingEntry(null);
        setSaveError(null);
    }, []);

    return {
        editingEntry, setEditingEntry, searchTerm, setSearchTerm, saveError, setSaveError,
        selectedSubCategory, setSelectedSubCategory, itemCategories, magicSchools, monsterCategories,
        entries, loading, loadError, handleSave, handleDelete, switchCategory, activeCategory,
        handleFieldChange, createNewEntry, filteredEntries, closeModal
    };
};

// --- CHILD COMPONENTS ---

const CategoryTabs = ({ activeCategory, switchCategory, loading }: { activeCategory: string, switchCategory: (cat: string) => void, loading: boolean }) => (
    <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map(({ id: cat, label, icon: Icon }) => (
            <button key={cat} onClick={() => switchCategory(cat)}
                className={`
                    px-4 py-2.5 text-sm font-medium rounded-t-lg flex items-center gap-2 whitespace-nowrap transition-colors
                    ${activeCategory === cat 
                        ? 'bg-white border-x border-t border-gray-200 text-indigo-600 border-b-white -mb-px relative z-10' 
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }
                `}
                disabled={loading}>
                <Icon className="w-4 h-4" />{label}
            </button>
        ))}
    </div>
);

const SearchAndFilter = ({ searchTerm, setSearchTerm, activeCategory, loading, currentSubCategories, selectedSubCategory, setSelectedSubCategory }: any) => (
    <div className="flex flex-col sm:flex-row gap-4 mb-6 p-1">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
                type="text" 
                placeholder={`Search ${activeCategory}...`} 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow" 
                disabled={loading} 
            />
        </div>
        {currentSubCategories.length > 0 && (
            <div className="relative flex-1 sm:flex-none sm:w-56">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select 
                    value={selectedSubCategory} 
                    onChange={(e) => setSelectedSubCategory(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none cursor-pointer" 
                    disabled={loading}
                >
                    <option value="">All {activeCategory === 'spells' ? 'Schools' : 'Categories'}</option>
                    {currentSubCategories.map((subCat: string) => (<option key={subCat} value={subCat}>{subCat}</option>))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                </div>
            </div>
        )}
    </div>
);

const DataTable = ({ columns, entries, onEdit, onDelete, loading, activeCategory, searchTerm, selectedSubCategory, loadError }: any) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white">
        <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        {columns.map((col: any) => (
                            <th key={col.header} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{col.header}</th>
                        ))}
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {entries.map((entry: any) => (
                        <tr key={entry.id || entry.name} className="hover:bg-gray-50 transition-colors">
                            {columns.map((col: any) => (
                                <td key={col.header} className={`px-4 py-3 text-sm text-gray-700 align-top ${col.className || ''}`} title={col.titleAccessor ? col.titleAccessor(entry) : undefined}>
                                    {col.accessor(entry)}
                                </td>
                            ))}
                            <td className="px-4 py-3 text-sm align-top text-right whitespace-nowrap">
                                <div className="flex justify-end gap-2">
                                    <Button variant="secondary" size="sm" icon={Edit2} onClick={() => onEdit(entry)} disabled={!entry.id}>Edit</Button>
                                    <Button variant="danger_outline" size="sm" icon={Trash2} onClick={() => entry.id && onDelete(entry.id)} disabled={!entry.id || loading}>Delete</Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        {entries.length === 0 && !loading && !loadError && (
            <div className="text-center py-12 bg-white">
                <div className="text-gray-400 mb-2">
                    {searchTerm || selectedSubCategory ? <Search className="w-8 h-8 mx-auto opacity-20"/> : <Plus className="w-8 h-8 mx-auto opacity-20"/>}
                </div>
                <p className="text-gray-500 text-sm">
                    {searchTerm || selectedSubCategory ? `No ${activeCategory} found matching your filters.` : `No entries found for '${activeCategory}'.`}
                </p>
            </div>
        )}
    </div>
);

const EditModal = ({ entry, onClose, onSave, loading, activeCategory, saveError, onFieldChange, magicSchools }: any) => {
    const renderForm = useCallback(() => {
        if (!entry) return null;
        switch (activeCategory) {
            case 'spells': return <SpellForm entry={entry} onChange={onFieldChange} magicSchools={magicSchools} />;
            case 'items': return <ItemForm entry={entry} onChange={onFieldChange} />;
            case 'abilities': return <AbilityForm entry={entry} onChange={onFieldChange} />;
            case 'kin': return <KinForm entry={entry} onChange={onFieldChange} />;
            case 'profession': return <ProfessionForm entry={entry} onChange={onFieldChange} />;
            case 'skills': return <SkillForm entry={entry} onChange={onFieldChange} />;
            case 'monsters': return <MonsterForm entry={entry} onChange={onFieldChange} />;
            case 'bio': return <BioForm entry={entry} onChange={onFieldChange} />;
            default: return <p className="text-gray-500 italic text-center py-8">No form available for this category.</p>;
        }
    }, [entry, activeCategory, onFieldChange, magicSchools]);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 capitalize">{entry.id ? `Edit ${activeCategory}` : `New ${activeCategory}`}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-grow overflow-y-auto p-6">
                   {saveError && (
                       <div className="mb-6">
                           <ErrorMessage message={saveError} />
                       </div>
                   )}
                   {renderForm()}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                    <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button variant="primary" icon={Save} onClick={onSave} disabled={loading}>
                        {loading ? 'Saving...' : (entry.id ? 'Update' : 'Create')}
                    </Button>
                </div>
            </div>
        </div>
    );
};


// --- MAIN COMPONENT ---
export function GameDataManager() {
    const {
        editingEntry, setEditingEntry, searchTerm, setSearchTerm, saveError, setSaveError,
        selectedSubCategory, setSelectedSubCategory, itemCategories, magicSchools, monsterCategories,
        entries, loading, loadError, handleSave, handleDelete, switchCategory, activeCategory,
        handleFieldChange, createNewEntry, filteredEntries, closeModal
    } = useGameDataManagement();

    const currentSubCategories = useMemo(() => {
        if (activeCategory === 'items') return itemCategories.sort();
        if (activeCategory === 'spells') return ['General', ...magicSchools.map((s: any) => s.name)].sort();
        if (activeCategory === 'monsters') return monsterCategories.sort();
        return [];
    }, [activeCategory, itemCategories, magicSchools, monsterCategories]);

    const tableColumns = useMemo(() => {
        const baseCols = [{ header: 'Name', accessor: (e: any) => <span className="font-medium text-gray-900">{e.name}</span> }];
        const commonTruncateClass = "text-sm text-gray-500 max-w-xs truncate";

        switch (activeCategory) {
            case 'spells':
                return [...baseCols,
                    {
                        header: 'School',
                        accessor: (e: any) => {
                            if (!e.school_id) return <span className="text-gray-400 italic">General</span>;
                            const school = magicSchools.find((s: any) => s.id === e.school_id);
                            return <span className="text-indigo-600 font-medium">{school?.name || 'Unknown'}</span>;
                        }
                    },
                    { header: 'Rank', accessor: (e: any) => e.rank === 0 ? <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">Trick</span> : `Rank ${e.rank}` },
                    { header: 'Cost', accessor: (e: any) => `${e.willpower_cost} WP` },
                ];
            case 'items':
                return [...baseCols,
                    { header: 'Category', accessor: (e: any) => <span className="capitalize">{e.category}</span> },
                    { header: 'Cost', accessor: (e: any) => `${e.cost}g` },
                    { header: 'Weight', accessor: (e: any) => e.weight },
                ];
            case 'abilities':
                return [...baseCols,
                    { header: 'Cost', accessor: (e: any) => e.willpower_cost ? `${e.willpower_cost} WP` : <span className="text-gray-400">-</span> },
                    { header: 'Requirement', accessor: (e: any) => formatAbilityRequirement(e.requirement), className: commonTruncateClass, titleAccessor: (e: any) => formatAbilityRequirement(e.requirement) },
                ];
            case 'kin':
                return [...baseCols,
                    { header: 'Key Attribute', accessor: (e: any) => <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{e.key_attribute}</span> },
                    { header: 'Typical Profession', accessor: (e: any) => e.typical_profession },
                ];
            case 'profession':
                return [...baseCols,
                    { header: 'Key Attribute', accessor: (e: any) => <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{e.key_attribute}</span> },
                    { header: 'Skills', accessor: (e: any) => Array.isArray(e.skills) ? e.skills.join(', ') : '', className: commonTruncateClass },
                ];
            case 'skills':
                return [...baseCols,
                    { header: 'Attribute', accessor: (e: any) => e.attribute ? <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{e.attribute}</span> : <span className="text-gray-400">-</span> },
                    { header: 'Description', accessor: (e: any) => e.description, className: commonTruncateClass, titleAccessor: (e: any) => e.description || '' },
                ];
            case 'monsters':
                return [...baseCols,
                    { header: 'Category', accessor: (e: any) => <span className="capitalize">{e.category}</span> },
                    { header: 'HP', accessor: (e: any) => <span className="font-bold text-red-600">{e.stats?.HP}</span> },
                    { header: 'Armor', accessor: (e: any) => e.stats?.ARMOR },
                    { header: 'Size', accessor: (e: any) => e.stats?.SIZE },
                ];
            case 'bio':
                return [...baseCols,
                    { header: 'Appearance', accessor: (e: any) => `${(e.appearance || []).length} options` },
                    { header: 'Mementos', accessor: (e: any) => `${(e.mementos || []).length} options` },
                    { header: 'Flaws', accessor: (e: any) => `${(e.flaws || []).length} options` },
                ];
            default:
                return baseCols;
        }
    }, [activeCategory, magicSchools]);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 min-h-[calc(100vh-4rem)]">
            
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Game Data</h1>
                    <p className="text-gray-500 mt-1">Manage core rules, items, and compendium data.</p>
                </div>
                <Button variant="primary" icon={Plus} onClick={createNewEntry} disabled={loading} className="shadow-sm">Add Entry</Button>
            </div>

            {/* Error Banner */}
            {loadError && <ErrorMessage message={`Error loading data: ${loadError}`} />}

            {/* Main Content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                
                {/* Tabs */}
                <div className="bg-gray-50 px-4 pt-2 border-b border-gray-200">
                    <CategoryTabs activeCategory={activeCategory} switchCategory={switchCategory} loading={loading} />
                </div>

                {/* Toolbar */}
                <div className="p-4 bg-white border-b border-gray-100">
                    <SearchAndFilter
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        activeCategory={activeCategory}
                        loading={loading}
                        currentSubCategories={currentSubCategories}
                        selectedSubCategory={selectedSubCategory}
                        setSelectedSubCategory={setSelectedSubCategory}
                    />
                </div>

                {/* Data Table */}
                <div>
                    {loading && !entries.length ? (
                        <div className="flex justify-center items-center h-64 text-gray-400">
                            <p>Loading {activeCategory}...</p>
                        </div>
                    ) : (
                        <DataTable
                            columns={tableColumns}
                            entries={filteredEntries}
                            onEdit={(entry: any) => { setSaveError(null); setEditingEntry(entry); }}
                            onDelete={handleDelete}
                            loading={loading}
                            activeCategory={activeCategory}
                            searchTerm={searchTerm}
                            selectedSubCategory={selectedSubCategory}
                            loadError={loadError}
                        />
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editingEntry && (
                <EditModal
                    entry={editingEntry}
                    onClose={closeModal}
                    onSave={handleSave}
                    loading={loading}
                    activeCategory={activeCategory}
                    saveError={saveError}
                    onFieldChange={handleFieldChange}
                    magicSchools={magicSchools}
                />
            )}
        </div>
    );
}
