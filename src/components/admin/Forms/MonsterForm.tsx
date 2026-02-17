import React, { useState, useEffect, useCallback } from 'react';
import {
  MonsterData,
  MonsterStats,
  MonsterAttackEntry,
  MonsterEffectEntry,
  MONSTER_SIZES,
} from '../../../types/bestiary';
import { Button } from '../../shared/Button';
import { PlusCircle, Trash2 } from 'lucide-react';

interface MonsterFormProps {
  entry: MonsterData;
  onChange: (field: string, value: unknown) => void;
}

const createEmptyStats = (): MonsterStats => ({
  FEROCITY: 0,
  SIZE: 'Normal',
  MOVEMENT: 0,
  ARMOR: 0,
  HP: 0,
});

const createEmptyAttack = (): MonsterAttackEntry => ({
  id: crypto.randomUUID(),
  roll_values: '',
  name: '',
  description: '',
  effects: [],
});

const createEmptyEffect = (): MonsterEffectEntry => ({
  id: crypto.randomUUID(),
  roll_values: '',
  name: '',
  description: '',
});

export function MonsterForm({ entry, onChange }: MonsterFormProps) {
  const [monsterData, setMonsterData] = useState<MonsterData>({
    ...entry,
    stats: entry.stats || createEmptyStats(),
    attacks: (entry.attacks || []).map((attack) => ({
      ...attack,
      id: attack.id || crypto.randomUUID(),
      effects: (attack.effects || []).map((effect) => ({
        ...effect,
        id: effect.id || crypto.randomUUID(),
      })),
    })),
  });

  useEffect(() => {
    setMonsterData({
      ...entry,
      stats: entry.stats || createEmptyStats(),
      attacks: (entry.attacks || []).map((attack) => ({
        ...attack,
        id: attack.id || crypto.randomUUID(),
        effects: (attack.effects || []).map((effect) => ({
          ...effect,
          id: effect.id || crypto.randomUUID(),
        })),
      })),
    });
  }, [entry]);

  const handleInputChange = useCallback(
    (field: keyof MonsterData, value: MonsterData[keyof MonsterData]) => {
      const updatedData = { ...monsterData, [field]: value };
      setMonsterData(updatedData);
      onChange(field, value);
    },
    [monsterData, onChange]
  );

  const handleStatsChange = useCallback(
    (field: keyof MonsterStats, value: MonsterStats[keyof MonsterStats]) => {
      const newStats = { ...monsterData.stats, [field]: value };
      handleInputChange('stats', newStats);
    },
    [monsterData.stats, handleInputChange]
  );

  const addAttack = useCallback(() => {
    const newAttacks = [...monsterData.attacks, createEmptyAttack()];
    handleInputChange('attacks', newAttacks);
  }, [monsterData.attacks, handleInputChange]);

  const updateAttack = useCallback(
    (index: number, field: keyof MonsterAttackEntry, value: MonsterAttackEntry[keyof MonsterAttackEntry]) => {
      const newAttacks = [...monsterData.attacks];
      newAttacks[index] = { ...newAttacks[index], [field]: value };
      handleInputChange('attacks', newAttacks);
    },
    [monsterData.attacks, handleInputChange]
  );

  const removeAttack = useCallback(
    (index: number) => {
      const newAttacks = monsterData.attacks.filter((_, i) => i !== index);
      handleInputChange('attacks', newAttacks);
    },
    [monsterData.attacks, handleInputChange]
  );

  const addEffect = useCallback(
    (attackIndex: number) => {
      const newAttacks = [...monsterData.attacks];
      newAttacks[attackIndex].effects = [
        ...(newAttacks[attackIndex].effects || []),
        createEmptyEffect(),
      ];
      handleInputChange('attacks', newAttacks);
    },
    [monsterData.attacks, handleInputChange]
  );

  const updateEffect = useCallback(
    (
      attackIndex: number,
      effectIndex: number,
      field: keyof MonsterEffectEntry,
      value: MonsterEffectEntry[keyof MonsterEffectEntry]
    ) => {
      const newAttacks = [...monsterData.attacks];
      if (newAttacks[attackIndex].effects) {
        newAttacks[attackIndex].effects![effectIndex] = {
          ...newAttacks[attackIndex].effects![effectIndex],
          [field]: value,
        };
        handleInputChange('attacks', newAttacks);
      }
    },
    [monsterData.attacks, handleInputChange]
  );

  const removeEffect = useCallback(
    (attackIndex: number, effectIndex: number) => {
      const newAttacks = [...monsterData.attacks];
      if (newAttacks[attackIndex].effects) {
        newAttacks[attackIndex].effects = newAttacks[attackIndex].effects!.filter(
          (_, i) => i !== effectIndex
        );
        handleInputChange('attacks', newAttacks);
      }
    },
    [monsterData.attacks, handleInputChange]
  );

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={monsterData.name || ''}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <input
          type="text"
          value={monsterData.category || ''}
          onChange={(e) => handleInputChange('category', e.target.value)}
          placeholder="e.g., Beast, Undead, Humanoid"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={monsterData.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Stats Section */}
<div className="p-4 border rounded-md shadow-sm">
  <h3 className="text-lg font-semibold mb-3 text-gray-800">Statistics</h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Ferocity */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Ferocity</label>
      <input
        type="number"
        value={monsterData.stats.FEROCITY}
        onChange={(e) => handleStatsChange('FEROCITY', parseInt(e.target.value, 10) || 0)}
        className="w-full px-3 py-2 border rounded-md"
      />
    </div>
    {/* Size */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
      <select
        value={monsterData.stats.SIZE}
        onChange={(e) => handleStatsChange('SIZE', e.target.value as MonsterData['stats']['SIZE'])}
        className="w-full px-3 py-2 border rounded-md"
      >
        {MONSTER_SIZES.map((size) => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>
    </div>
    {/* Movement */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Movement</label>
      <input
        type="number"
        value={monsterData.stats.MOVEMENT}
        onChange={(e) => handleStatsChange('MOVEMENT', parseInt(e.target.value, 10) || 0)}
        className="w-full px-3 py-2 border rounded-md"
      />
    </div>
    {/* Armor */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Armor</label>
      <input
        type="number"
        value={monsterData.stats.ARMOR}
        onChange={(e) => handleStatsChange('ARMOR', parseInt(e.target.value, 10) || 0)}
        className="w-full px-3 py-2 border rounded-md"
      />
    </div>
    {/* HP */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">HP</label>
      <input
        type="number"
        value={monsterData.stats.HP}
        onChange={(e) => handleStatsChange('HP', parseInt(e.target.value, 10) || 0)}
        className="w-full px-3 py-2 border rounded-md"
      />
    </div>
  </div>

  {/* Effect Text Entry */}
  <div className="mt-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">Effects Summary</label>
    <textarea
      value={monsterData.effectsSummary || ''}
      onChange={(e) => handleInputChange('effectsSummary', e.target.value)}
      rows={3}
      placeholder="Describe any special effects or abilities here..."
      className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
</div>

      {/* Attacks Section */}
      <div className="p-4 border rounded-md shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Attacks (D6 Rollable Table)</h3>
          <Button variant="secondary" size="sm" icon={PlusCircle} onClick={addAttack}>Add Attack</Button>
        </div>
        {monsterData.attacks.length === 0 && (
          <p className="text-gray-500">No attacks defined. Click "Add Attack" to create one.</p>
        )}
        {monsterData.attacks.map((attack, attackIndex) => (
          <div key={attack.id} className="p-3 border rounded-md mb-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
              <input
                type="text"
                placeholder="Roll Values (e.g., 1, 2-3)"
                value={attack.roll_values}
                onChange={(e) => updateAttack(attackIndex, 'roll_values', e.target.value)}
                className="px-3 py-2 border rounded-md"
              />
              <input
                type="text"
                placeholder="Attack Name"
                value={attack.name}
                onChange={(e) => updateAttack(attackIndex, 'name', e.target.value)}
                className="md:col-span-2 px-3 py-2 border rounded-md"
              />
            </div>
            <textarea
              placeholder="Attack Description"
              value={attack.description}
              onChange={(e) => updateAttack(attackIndex, 'description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-md mb-2"
            />

            {/* Effects Sub-section */}
            <div className="ml-4 mt-2 p-3 border-l-2 border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-md font-semibold text-gray-700">Effects (Optional D6 Table)</h4>
                <Button variant="outline" size="xs" icon={PlusCircle} onClick={() => addEffect(attackIndex)}>Add Effect</Button>
              </div>
              {attack.effects.length === 0 && (
                <p className="text-gray-500">No effects for this attack. Click "Add Effect" to create one.</p>
              )}
              {attack.effects.map((effect, effectIndex) => (
                <div key={effect.id} className="p-2 border rounded-md mb-2 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-1">
                    <input
                      type="text"
                      placeholder="Roll (e.g., 1-2)"
                      value={effect.roll_values}
                      onChange={(e) => updateEffect(attackIndex, effectIndex, 'roll_values', e.target.value)}
                      className="px-2 py-1 border rounded-md text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Effect Name"
                      value={effect.name}
                      onChange={(e) => updateEffect(attackIndex, effectIndex, 'name', e.target.value)}
                      className="md:col-span-2 px-2 py-1 border rounded-md text-sm"
                    />
                  </div>
                  <textarea
                    placeholder="Effect Description"
                    value={effect.description}
                    onChange={(e) => updateEffect(attackIndex, effectIndex, 'description', e.target.value)}
                    rows={1}
                    className="w-full px-2 py-1 border rounded-md text-sm"
                  />
                  <div className="text-right mt-1">
                    <Button variant="danger" size="xs" icon={Trash2} onClick={() => removeEffect(attackIndex, effectIndex)}>
                      Remove Effect
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-right">
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => removeAttack(attackIndex)}>
                Remove Attack
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonsterForm;
