import React from 'react';
import { Button } from '../shared/Button';
import { Edit2, Trash2 } from 'lucide-react';
import { DataCategory, GameDataEntry } from '../../hooks/useGameData';

interface DataTableProps {
  activeCategory: DataCategory;
  entries: GameDataEntry[];
  onEdit: (entry: GameDataEntry) => void;
  onDelete: (id: string) => void;
}

const DataTable: React.FC<DataTableProps> = ({ activeCategory, entries, onEdit, onDelete }) => {
  return (
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
            {activeCategory === 'abilities' && (
              <th className="px-4 py-2 text-left">WP Cost</th>
            )}
            {activeCategory === 'kin' && (
              <th className="px-4 py-2 text-left">Heroic Ability</th>
            )}
            {activeCategory === 'profession' && (
              <th className="px-4 py-2 text-left">Key Attribute</th>
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
                  <td className="px-4 py-2">
                    {entry.rank === 0 ? 'Trick' : `Rank ${entry.rank}`}
                  </td>
                  <td className="px-4 py-2">{entry.willpower_cost} WP</td>
                </>
              )}
              {activeCategory === 'abilities' && (
                <td className="px-4 py-2">{entry.willpower_cost} WP</td>
              )}
              {activeCategory === 'kin' && (
                <td className="px-4 py-2">{entry.heroic_ability}</td>
              )}
              {activeCategory === 'profession' && (
                <td className="px-4 py-2">{entry.key_attribute}</td>
              )}
              <td className="px-4 py-2">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Edit2}
                    onClick={() => onEdit(entry)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    onClick={() => onDelete(entry.id!)}
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
  );
};

export default DataTable;
