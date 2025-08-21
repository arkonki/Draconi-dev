import React, { useState } from 'react';
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
  Trash2 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CompendiumEntry, CompendiumTemplate } from '../../types/compendium';
import { Button } from '../shared/Button';
import { ArmorHelmetsForm } from './ItemForms/ArmorHelmetsForm';
import { MeleeWeaponsForm } from './ItemForms/MeleeWeaponsForm';
import { RangedWeaponsForm } from './ItemForms/RangedWeaponsForm';
import { ClothesForm } from './ItemForms/ClothesForm';
import { MusicalInstrumentsForm } from './ItemForms/MusicalInstrumentsForm';
import { TradeGoodsForm } from './ItemForms/TradeGoodsForm';
import { StudiesMagicForm } from './ItemForms/StudiesMagicForm';
import { LightSourcesForm } from './ItemForms/LightSourcesForm';
import { ToolsForm } from './ItemForms/ToolsForm';
import { ContainersForm } from './ItemForms/ContainersForm';
import { MedicineForm } from './ItemForms/MedicineForm';
import { ServicesForm } from './ItemForms/ServicesForm';
import { HuntingFishingForm } from './ItemForms/HuntingFishingForm';
import { MeansOfTravelForm } from './ItemForms/MeansOfTravelForm';
import { AnimalsForm } from './ItemForms/AnimalsForm';
import { ItemForm } from './ItemForms/ItemForm';

type DataCategory = 'spells' | 'items' | 'abilities';

interface GameDataEntry {
  id: string;
  name: string;
  description?: string;
  [key: string]: any;
}

interface ItemFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

const itemCategories = [
  'ARMOR & HELMETS',
  'MELEE WEAPONS',
  'RANGED WEAPONS',
  'CLOTHES',
  'MUSICAL INSTRUMENTS',
  'TRADE GOODS',
  'STUDIES & MAGIC',
  'LIGHT SOURCES',
  'TOOLS',
  'CONTAINERS',
  'MEDICINE',
  'SERVICES',
  'HUNTING & FISHING',
  'MEANS OF TRAVEL',
  'ANIMALS'
];

const itemFormComponents: Record<string, React.ComponentType<ItemFormProps>> = {
  'ARMOR & HELMETS': ArmorHelmetsForm,
  'MELEE WEAPONS': MeleeWeaponsForm,
  'RANGED WEAPONS': RangedWeaponsForm,
  'CLOTHES': ClothesForm,
  'MUSICAL INSTRUMENTS': MusicalInstrumentsForm,
  'TRADE GOODS': TradeGoodsForm,
  'STUDIES & MAGIC': StudiesMagicForm,
  'LIGHT SOURCES': LightSourcesForm,
  'TOOLS': ToolsForm,
  'CONTAINERS': ContainersForm,
  'MEDICINE': MedicineForm,
  'SERVICES': ServicesForm,
  'HUNTING & FISHING': HuntingFishingForm,
  'MEANS OF TRAVEL': MeansOfTravelForm,
  'ANIMALS': AnimalsForm
};

export function CompendiumAdmin({ onEntryAdded }: CompendiumAdminProps) {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<DataCategory>('items');
  const [entries, setEntries] = useState<GameDataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState<GameDataEntry | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadEntries();
  }, [activeCategory]);

  async function loadEntries() {
    try {
      setLoading(true);
      setError(null);

      let query;
      switch (activeCategory) {
        case 'spells':
          query = supabase
            .from('game_spells')
            .select(`
              *,
              magic_schools (
                name
              )
            `)
            .order('name');
          break;
        case 'items':
          query = supabase
            .from('game_items')
            .select('*')
            .order('name');
          break;
        case 'abilities':
          query = supabase
            .from('game_heroic_abilities')
            .select('*')
            .order('name');
          break;
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    if (!editingEntry) return;

    try {
      setError(null);
      const { id, ...data } = editingEntry;
      let table;

      switch (activeCategory) {
        case 'spells':
          table = 'game_spells';
          break;
        case 'items':
          table = 'game_items';
          break;
        case 'abilities':
          table = 'game_heroic_abilities';
          break;
      }

      if (id) {
        const { error } = await supabase
          .from(table)
          .update(data)
          .eq('id', id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .insert([data]);

        if (error) throw error;
      }

      setEditingEntry(null);
      loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
      console.error("Error during save:", err); // Log the error for more details
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError(null);
      const { error } = await supabase
        .from(activeCategory === 'spells' ? 'game_spells' : 
              activeCategory === 'items' ? 'game_items' : 
              'game_heroic_abilities')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  };

  const handleItemFieldChange = (field: string, value: any) => {
    setEditingEntry(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const renderForm = () => {
    if (!editingEntry) return null;

    switch (activeCategory) {
      case 'spells':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={editingEntry.name}
                onChange={(e) => setEditingEntry({ ...editingEntry, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                School
              </label>
              <select
                value={editingEntry.school_id || ''}
                onChange={(e) => setEditingEntry({ ...editingEntry, school_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">General Magic</option>
                <option value="animism">Animism</option>
                <option value="elementalism">Elementalism</option>
                <option value="mentalism">Mentalism</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rank
              </label>
              <select
                value={editingEntry.rank !== undefined ? editingEntry.rank : 1}
                onChange={(e) => setEditingEntry({ ...editingEntry, rank: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="0">Trick</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>Rank {i + 1}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={editingEntry.description}
                onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Casting Time
                </label>
                <input
                  type="text"
                  value={editingEntry.casting_time}
                  onChange={(e) => setEditingEntry({ ...editingEntry, casting_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Range
                </label>
                <input
                  type="text"
                  value={editingEntry.range}
                  onChange={(e) => setEditingEntry({ ...editingEntry, range: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration
                </label>
                <input
                  type="text"
                  value={editingEntry.duration}
                  onChange={(e) => setEditingEntry({ ...editingEntry, duration: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Willpower Cost
                </label>
                <input
                  type="number"
                  value={editingEntry.willpower_cost}
                  onChange={(e) => setEditingEntry({ ...editingEntry, willpower_cost: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                  min="0"
                />
              </div>
            </div>
          </div>
        );
      case 'items':
        return (
          <ItemForm
            entry={editingEntry}
            onChange={handleItemFieldChange}
          />
        );
      // Add similar form sections for items and abilities
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Game Data Management</h2>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setEditingEntry({})}
        >
          Add Entry
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveCategory('spells')}
          className={`px-4 py-2 font-medium ${
            activeCategory === 'spells'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            Spells
          </div>
        </button>
        <button
          onClick={() => setActiveCategory('items')}
          className={`px-4 py-2 font-medium ${
            activeCategory === 'items'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sword className="w-5 h-5" />
            Items
          </div>
        </button>
        <button
          onClick={() => setActiveCategory('abilities')}
          className={`px-4 py-2 font-medium ${
            activeCategory === 'abilities'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Abilities
          </div>
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search entries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10 pr-8 py-2 border rounded-lg appearance-none bg-white"
          >
            <option value="all">All</option>
            {activeCategory === 'spells' && (
              <>
                <option value="general">General Magic</option>
                <option value="animism">Animism</option>
                <option value="elementalism">Elementalism</option>
                <option value="mentalism">Mentalism</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left">Name</th>
              {activeCategory === 'spells' && (
                <>
                  <th className="px-4 py-2 text-left">School</th>
                  <th className="px-4 py-2 text-left">Rank</th>
                  <th className="px-4 py-2 text-left">WP Cost</th>
                </>
              )}
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t">
                <td className="px-4 py-2">{entry.name}</td>
                {activeCategory === 'spells' && (
                  <>
                    <td className="px-4 py-2">{entry.magic_schools?.name || 'General Magic'}</td>
                    <td className="px-4 py-2">{entry.rank === 0 ? 'Trick' : `Rank ${entry.rank}`}</td>
                    <td className="px-4 py-2">{entry.willpower_cost} WP</td>
                  </>
                )}
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Edit2}
                      onClick={() => setEditingEntry(entry)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDelete(entry.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {editingEntry.id ? 'Edit Entry' : 'New Entry'}
              </h3>
              <button
                onClick={() => setEditingEntry(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {renderForm()}

            <div className="flex justify-end gap-4 mt-6">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-5 h-5" />
                {editingEntry.id ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
