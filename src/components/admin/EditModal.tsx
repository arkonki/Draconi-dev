import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '../shared/Button';
import SpellForm from './Forms/SpellForm';
import ItemForm from './Forms/ItemForm';
import AbilityForm from './Forms/AbilityForm';
import KinForm from './Forms/KinForm';
import ProfessionForm from './Forms/ProfessionForm';
import { DataCategory, GameDataEntry } from '../hooks/useGameData';

interface EditModalProps {
  activeCategory: DataCategory;
  entry: GameDataEntry;
  onClose: () => void;
  onSave: (entry: GameDataEntry) => void;
}

const EditModal: React.FC<EditModalProps> = ({ activeCategory, entry, onClose, onSave }) => {
  // Create a local copy of the entry for editing.
  const [localEntry, setLocalEntry] = useState<GameDataEntry>(entry);

  // Sync localEntry if the parent entry changes.
  useEffect(() => {
    setLocalEntry(entry);
  }, [entry]);

  // Local change handler updates only local state.
  const handleFieldChange = (field: string, value: any) => {
    setLocalEntry((prev) => ({ ...prev, [field]: value }));
  };

  const renderForm = () => {
    switch (activeCategory) {
      case 'spells':
        return <SpellForm entry={localEntry} onChange={handleFieldChange} />;
      case 'items':
        return <ItemForm entry={localEntry} onChange={handleFieldChange} />;
      case 'abilities':
        return <AbilityForm entry={localEntry} onChange={handleFieldChange} />;
      case 'kin':
        return <KinForm entry={localEntry} onChange={handleFieldChange} />;
      case 'profession':
        return <ProfessionForm entry={localEntry} onChange={handleFieldChange} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {localEntry.id ? 'Edit Entry' : 'New Entry'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        {renderForm()}
        <div className="flex justify-end gap-4 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Save} onClick={() => onSave(localEntry)}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
