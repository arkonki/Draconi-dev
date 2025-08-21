import React, { useState, useEffect } from 'react';
import { findEquipment } from '../../../data/equipment'; // if needed
import { Button } from '../../shared/Button';
import { X } from 'react-feather';

interface ItemFormProps {
  entry: any;
  onChange: (field: string, value: any) => void;
}

export function ItemForm({ entry, onChange }: ItemFormProps) {
  const [itemData, setItemData] = useState(entry);
  const [cost, setCost] = useState({
    gold: 0,
    silver: 0,
    copper: 0
  });
  const [features, setFeatures] = useState<string[]>([]);

  useEffect(() => {
    setItemData(entry);
    if (entry.cost) {
      const costParts = entry.cost.split(',').map(part => part.trim());
      const newCost = { gold: 0, silver: 0, copper: 0 };

      costParts.forEach(part => {
        if (part.includes('gold')) {
          newCost.gold = parseInt(part.replace('gold', '').trim()) || 0;
        } else if (part.includes('silver')) {
          newCost.silver = parseInt(part.replace('silver', '').trim()) || 0;
        } else if (part.includes('copper')) {
          newCost.copper = parseInt(part.replace('copper', '').trim()) || 0;
        }
      });
      setCost(newCost);
    }
    if (entry.features) {
      setFeatures(entry.features);
    }
  }, [entry]);

  const handleCostChange = (type: 'gold' | 'silver' | 'copper', value: string) => {
    const numValue = parseInt(value) || 0;
    // Update the local cost state first.
    const updatedCost = { ...cost, [type]: numValue };
    setCost(updatedCost);
    // Then notify the parent.
    onChange('cost', `${updatedCost.gold} gold, ${updatedCost.silver} silver, ${updatedCost.copper} copper`);
  };

  const handleFeatureRemove = (index: number) => {
    const updatedFeatures = features.filter((_, i) => i !== index);
    setFeatures(updatedFeatures);
    onChange('features', updatedFeatures);
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          type="text"
          value={itemData.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category
        </label>
        <select
          value={itemData.category || ''}
          onChange={(e) => onChange('category', e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Select Category</option>
          <option value="ARMOR & HELMETS">Armor & Helmets</option>
          <option value="MELEE WEAPONS">Melee Weapons</option>
          <option value="RANGED WEAPONS">Ranged Weapons</option>
          <option value="CLOTHES">Clothes</option>
          <option value="MUSICAL INSTRUMENTS">Musical Instruments</option>
          <option value="TRADE GOODS">Trade Goods</option>
          <option value="STUDIES & MAGIC">Studies & Magic</option>
          <option value="LIGHT SOURCES">Light Sources</option>
          <option value="TOOLS">Tools</option>
          <option value="CONTAINERS">Containers</option>
          <option value="MEDICINE">Medicine</option>
          <option value="SERVICES">Services</option>
          <option value="HUNTING & FISHING">Hunting & Fishing</option>
          <option value="MEANS OF TRAVEL">Means of Travel</option>
          <option value="ANIMALS">Animals</option>
        </select>
      </div>

      {/* Conditional Fields */}
      {itemData.category === 'ARMOR & HELMETS' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Armor Rating
          </label>
          <input
            type="number"
            value={itemData.armor_rating || ''}
            onChange={(e) => onChange('armor_rating', parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>
      )}

      {itemData.category === 'MELEE WEAPONS' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grip
            </label>
            <select
              value={itemData.grip || '1H'}
              onChange={(e) => onChange('grip', e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="1H">1H</option>
              <option value="2H">2H</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              STR Requirement
            </label>
            <input
              type="number"
              value={itemData.strength_requirement || ''}
              onChange={(e) => onChange('strength_requirement', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Range
            </label>
            <input
              type="text"
              value={itemData.range || ''}
              onChange={(e) => onChange('range', e.target.value)}
              placeholder="Enter range value or STR"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Damage
            </label>
            <input
              type="text"
              value={itemData.damage || ''}
              onChange={(e) => onChange('damage', e.target.value)}
              placeholder="e.g. D6, D8, 2D8"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Durability
            </label>
            <input
              type="number"
              value={itemData.durability || ''}
              onChange={(e) => onChange('durability', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </>
      )}

      {itemData.category === 'RANGED WEAPONS' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grip
            </label>
            <select
              value={itemData.grip || '1H'}
              onChange={(e) => onChange('grip', e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="1H">1H</option>
              <option value="2H">2H</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              STR Requirement
            </label>
            <input
              type="number"
              value={itemData.strength_requirement || ''}
              onChange={(e) => onChange('strength_requirement', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Range
            </label>
            <input
              type="text"
              value={itemData.range || ''}
              onChange={(e) => onChange('range', e.target.value)}
              placeholder="Enter range value or STR"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Damage
            </label>
            <input
              type="text"
              value={itemData.damage || ''}
              onChange={(e) => onChange('damage', e.target.value)}
              placeholder="e.g. D6, D8, 2D8"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Durability
            </label>
            <input
              type="number"
              value={itemData.durability || ''}
              onChange={(e) => onChange('durability', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </>
      )}

      {/* Cost */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cost
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex">
            <input
              type="number"
              value={cost.gold}
              onChange={(e) => handleCostChange('gold', e.target.value)}
              className="w-full px-3 py-2 border rounded-l-md"
              placeholder="0"
            />
            <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md text-gray-700">
              Gold
            </span>
          </div>
          <div className="flex">
            <input
              type="number"
              value={cost.silver}
              onChange={(e) => handleCostChange('silver', e.target.value)}
              className="w-full px-3 py-2 border rounded-l-md"
              placeholder="0"
            />
            <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md text-gray-700">
              Silver
            </span>
          </div>
          <div className="flex">
            <input
              type="number"
              value={cost.copper}
              onChange={(e) => handleCostChange('copper', e.target.value)}
              className="w-full px-3 py-2 border rounded-l-md"
              placeholder="0"
            />
            <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md text-gray-700">
              Copper
            </span>
          </div>
        </div>
      </div>

      {/* Supply */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Supply
        </label>
        <select
          value={itemData.supply || ''}
          onChange={(e) => onChange('supply', e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Select Supply</option>
          <option value="Common">Common</option>
          <option value="Uncommon">Uncommon</option>
          <option value="Rare">Rare</option>
          <option value="Unique">Unique</option>
        </select>
      </div>

      {/* Weight */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Weight
        </label>
        <input
          type="number"
          value={itemData.weight || ''}
          onChange={(e) => onChange('weight', parseFloat(e.target.value))}
          className="w-full px-3 py-2 border rounded-md"
          min="0"
          step="0.1"
        />
      </div>

      {/* Effect/Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Effect/Description
        </label>
        <textarea
          value={itemData.effect || ''}
          onChange={(e) => onChange('effect', e.target.value.toUpperCase())}
          rows={3}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {/* Features */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Features
        </label>
        <div className="flex flex-wrap gap-2">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1 text-sm">
              <span>{feature}</span>
              <button
                type="button"
                onClick={() => handleFeatureRemove(index)}
                className="ml-2 text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <input
            type="text"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                e.preventDefault();
                const newFeature = e.currentTarget.value.trim();
                const updatedFeatures = [...features, newFeature];
                setFeatures(updatedFeatures);
                onChange('features', updatedFeatures);
                e.currentTarget.value = '';
              }
            }}
            className="px-3 py-2 border rounded-md"
            placeholder="Add feature..."
          />
        </div>
      </div>
    </div>
  );
}

export default ItemForm;
