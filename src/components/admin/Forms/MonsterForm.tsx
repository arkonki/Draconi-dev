import React, { useState, useEffect, useCallback } from 'react';
import {
  MonsterData,
  MonsterDamageBonusConfig,
  MonsterGearItem,
  MonsterHeroicAbilityEntry,
  MonsterSkillEntry,
  MonsterStats,
  MonsterAttackEntry,
  MonsterEffectEntry,
  MONSTER_SIZES,
} from '../../../types/bestiary';
import { Button } from '../../shared/Button';
import { PlusCircle, Search, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchItems, GameItem } from '../../../lib/api/items';
import { supabase } from '../../../lib/supabase';
import { fetchHeroicAbilities } from '../../../lib/api/abilities';
import type { Ability, AttributeName, DiceType } from '../../../types/character';

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
  WP: 0,
  IS_NPC: false,
  TYPE: '',
  SKILLS: '',
  SKILL_ENTRIES: [],
  HEROIC_ABILITIES: '',
  HEROIC_ABILITY_ITEMS: [],
  DAMAGE_BONUS: '',
  DAMAGE_BONUS_CONFIG: null,
  GEAR: '',
  GEAR_ITEMS: [],
});

const DAMAGE_BONUS_ATTRIBUTES: AttributeName[] = ['STR', 'AGL'];
const DAMAGE_BONUS_DICE: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12'];

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

const normalizeMonsterData = (entry: MonsterData): MonsterData => ({
  ...entry,
  effectsSummary: entry.effectsSummary || '',
  stats: {
    ...createEmptyStats(),
    ...(entry.stats || {}),
    SKILL_ENTRIES: (entry.stats?.SKILL_ENTRIES || []).map((skill) => ({
      ...skill,
      level: Math.max(1, skill.level || 1),
    })),
    HEROIC_ABILITY_ITEMS: entry.stats?.HEROIC_ABILITY_ITEMS || [],
    GEAR_ITEMS: (entry.stats?.GEAR_ITEMS || []).map((item) => ({
      ...item,
      quantity: Math.max(1, item.quantity || 1),
    })),
  },
  attacks: (entry.attacks || []).map((attack) => ({
    ...attack,
    id: attack.id || crypto.randomUUID(),
    effects: (attack.effects || []).map((effect) => ({
      ...effect,
      id: effect.id || crypto.randomUUID(),
    })),
  })),
});

export function MonsterForm({ entry, onChange }: MonsterFormProps) {
  const [monsterData, setMonsterData] = useState<MonsterData>(normalizeMonsterData(entry));
  const [gearSearch, setGearSearch] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const [abilitySearch, setAbilitySearch] = useState('');
  const { data: allItems = [], isLoading: isLoadingItems } = useQuery<GameItem[]>({
    queryKey: ['gameItems'],
    queryFn: fetchItems,
    staleTime: 1000 * 60 * 10,
  });
  const { data: allSkills = [], isLoading: isLoadingSkills } = useQuery<Array<{ id: string; name: string; attribute?: string | null }>>({
    queryKey: ['monsterFormSkills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_skills')
        .select('id, name, attribute')
        .order('name');
      if (error) {
        throw error;
      }
      return (data || []) as Array<{ id: string; name: string; attribute?: string | null }>;
    },
    staleTime: 1000 * 60 * 10,
  });
  const { data: allHeroicAbilities = [], isLoading: isLoadingAbilities } = useQuery<Ability[]>({
    queryKey: ['monsterFormHeroicAbilities'],
    queryFn: fetchHeroicAbilities,
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    setMonsterData(normalizeMonsterData(entry));
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

  const isNpcMonster = Boolean(monsterData.stats.IS_NPC);
  const selectedDamageBonus = monsterData.stats.DAMAGE_BONUS_CONFIG || null;
  const selectedSkillEntries = monsterData.stats.SKILL_ENTRIES || [];
  const selectedHeroicAbilities = monsterData.stats.HEROIC_ABILITY_ITEMS || [];
  const equippedGearItems = monsterData.stats.GEAR_ITEMS || [];

  const syncGearItems = useCallback(
    (gearItems: MonsterGearItem[]) => {
      handleStatsChange('GEAR_ITEMS', gearItems);
    },
    [handleStatsChange]
  );

  const addGearItem = useCallback(
    (item: GameItem) => {
      const existing = equippedGearItems.find((gearItem) => gearItem.item_id === item.id);
      if (existing) {
        syncGearItems(
          equippedGearItems.map((gearItem) =>
            gearItem.item_id === item.id
              ? { ...gearItem, quantity: gearItem.quantity + 1 }
              : gearItem
          )
        );
        return;
      }

      syncGearItems([
        ...equippedGearItems,
        {
          item_id: item.id,
          name: item.name,
          category: item.category,
          quantity: 1,
          description: item.description,
          damage: item.damage,
          armor_rating: item.armor_rating,
          range: item.range,
          grip: item.grip,
          durability: item.durability,
          features: item.features,
          effect: item.effect,
          skill: item.skill,
        },
      ]);
    },
    [equippedGearItems, syncGearItems]
  );

  const updateGearItemQuantity = useCallback(
    (itemId: string, quantity: number) => {
      syncGearItems(
        equippedGearItems.map((gearItem) =>
          gearItem.item_id === itemId
            ? { ...gearItem, quantity: Math.max(1, quantity || 1) }
            : gearItem
        )
      );
    },
    [equippedGearItems, syncGearItems]
  );

  const removeGearItem = useCallback(
    (itemId: string) => {
      syncGearItems(equippedGearItems.filter((gearItem) => gearItem.item_id !== itemId));
    },
    [equippedGearItems, syncGearItems]
  );

  const syncDamageBonusConfig = useCallback(
    (config: MonsterDamageBonusConfig | null) => {
      handleInputChange('stats', {
        ...monsterData.stats,
        DAMAGE_BONUS_CONFIG: config,
        DAMAGE_BONUS: config ? `${config.attribute} +${config.die.toUpperCase()}` : '',
      });
    },
    [handleInputChange, monsterData.stats]
  );

  const syncSkillEntries = useCallback(
    (entries: MonsterSkillEntry[]) => {
      handleInputChange('stats', {
        ...monsterData.stats,
        SKILL_ENTRIES: entries,
        SKILLS: entries.map((entry) => `${entry.name} ${entry.level}`).join('\n'),
      });
    },
    [handleInputChange, monsterData.stats]
  );

  const syncHeroicAbilityItems = useCallback(
    (entries: MonsterHeroicAbilityEntry[]) => {
      handleInputChange('stats', {
        ...monsterData.stats,
        HEROIC_ABILITY_ITEMS: entries,
        HEROIC_ABILITIES: entries.map((entry) => entry.name).join('\n'),
      });
    },
    [handleInputChange, monsterData.stats]
  );

  const addSkillEntry = useCallback(
    (skill: { id: string; name: string; attribute?: string | null }) => {
      if (selectedSkillEntries.some((entry) => entry.skill_id === skill.id)) {
        return;
      }

      syncSkillEntries([
        ...selectedSkillEntries,
        {
          skill_id: skill.id,
          name: skill.name,
          level: 1,
          attribute: skill.attribute ?? null,
        },
      ]);
    },
    [selectedSkillEntries, syncSkillEntries]
  );

  const updateSkillEntryLevel = useCallback(
    (skillId: string, level: number) => {
      syncSkillEntries(
        selectedSkillEntries.map((entry) =>
          entry.skill_id === skillId
            ? { ...entry, level: Math.max(1, level || 1) }
            : entry
        )
      );
    },
    [selectedSkillEntries, syncSkillEntries]
  );

  const removeSkillEntry = useCallback(
    (skillId: string) => {
      syncSkillEntries(selectedSkillEntries.filter((entry) => entry.skill_id !== skillId));
    },
    [selectedSkillEntries, syncSkillEntries]
  );

  const addHeroicAbilityItem = useCallback(
    (ability: Ability) => {
      if (selectedHeroicAbilities.some((entry) => entry.ability_id === ability.id)) {
        return;
      }

      syncHeroicAbilityItems([
        ...selectedHeroicAbilities,
        {
          ability_id: ability.id,
          name: ability.name,
          description: ability.description,
          willpower_cost: ability.willpower_cost,
        },
      ]);
    },
    [selectedHeroicAbilities, syncHeroicAbilityItems]
  );

  const removeHeroicAbilityItem = useCallback(
    (abilityId: string) => {
      syncHeroicAbilityItems(selectedHeroicAbilities.filter((entry) => entry.ability_id !== abilityId));
    },
    [selectedHeroicAbilities, syncHeroicAbilityItems]
  );

  const normalizedGearSearch = gearSearch.trim().toLowerCase();
  const filteredGearItems = allItems
    .filter((item) => {
      if (!normalizedGearSearch) {
        return true;
      }
      return [item.name, item.category, item.skill, item.damage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedGearSearch);
    })
    .slice(0, 20);
  const normalizedSkillSearch = skillSearch.trim().toLowerCase();
  const filteredSkills = allSkills
    .filter((skill) => {
      if (!normalizedSkillSearch) {
        return true;
      }
      return [skill.name, skill.attribute]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSkillSearch);
    })
    .slice(0, 20);
  const normalizedAbilitySearch = abilitySearch.trim().toLowerCase();
  const filteredHeroicAbilities = allHeroicAbilities
    .filter((ability) => {
      if (!normalizedAbilitySearch) {
        return true;
      }
      return [ability.name, ability.description, ability.kin]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedAbilitySearch);
    })
    .slice(0, 20);

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

      <div className="p-4 border rounded-md shadow-sm bg-amber-50/60 border-amber-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Entry Style</h3>
            <p className="text-sm text-gray-600 mt-1">
              Turn this on for humanoid or named NPC-style enemies that use skills, gear, and heroic abilities instead of a pure bestiary profile.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 whitespace-nowrap">
            <input
              type="checkbox"
              checked={isNpcMonster}
              onChange={(e) => handleStatsChange('IS_NPC', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            NPC monster
          </label>
        </div>
      </div>

      {isNpcMonster ? (
        <div className="p-4 border rounded-md shadow-sm">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">NPC Monster Profile</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <input
                type="text"
                value={monsterData.stats.TYPE || ''}
                onChange={(e) => handleStatsChange('TYPE', e.target.value)}
                placeholder="e.g., Veteran Guard, Cultist, Mercenary"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Damage Bonus</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedDamageBonus?.attribute || ''}
                  onChange={(e) => {
                    const attribute = e.target.value as AttributeName;
                    if (!attribute) {
                      syncDamageBonusConfig(null);
                      return;
                    }
                    syncDamageBonusConfig({
                      attribute,
                      die: selectedDamageBonus?.die || 'd4',
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">No bonus</option>
                  {DAMAGE_BONUS_ATTRIBUTES.map((attribute) => (
                    <option key={attribute} value={attribute}>{attribute}</option>
                  ))}
                </select>
                <select
                  value={selectedDamageBonus?.die || 'd4'}
                  onChange={(e) => {
                    if (!selectedDamageBonus?.attribute) {
                      return;
                    }
                    syncDamageBonusConfig({
                      attribute: selectedDamageBonus.attribute,
                      die: e.target.value as DiceType,
                    });
                  }}
                  disabled={!selectedDamageBonus?.attribute}
                  className="w-full px-3 py-2 border rounded-md disabled:bg-gray-100"
                >
                  {DAMAGE_BONUS_DICE.map((die) => (
                    <option key={die} value={die}>{die.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Only STR and AGL can grant weapon damage bonuses. Applied automatically in combat when the equipped weapon uses the same governing attribute.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HP</label>
              <input
                type="number"
                value={monsterData.stats.HP}
                onChange={(e) => handleStatsChange('HP', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WP</label>
              <input
                type="number"
                value={monsterData.stats.WP || 0}
                onChange={(e) => handleStatsChange('WP', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                      placeholder="Search skills by name or attribute..."
                      className="w-full pl-9 pr-4 py-2 border rounded-md"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-md bg-white divide-y">
                    {isLoadingSkills ? (
                      <div className="p-4 text-sm text-gray-500">Loading skills...</div>
                    ) : filteredSkills.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">No skills matched your search.</div>
                    ) : (
                      filteredSkills.map((skill) => (
                        <div key={skill.id} className="flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{skill.name}</div>
                            <div className="text-xs text-gray-500 mt-1">{skill.attribute || 'No attribute'}</div>
                          </div>
                          <Button type="button" size="sm" variant="secondary" onClick={() => addSkillEntry(skill)}>
                            Add
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Selected Skills</div>
                  <div className="max-h-64 overflow-y-auto border rounded-md bg-stone-50 divide-y">
                    {selectedSkillEntries.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">No skills selected yet.</div>
                    ) : (
                      selectedSkillEntries.map((skillEntry) => (
                        <div key={skillEntry.skill_id} className="p-3 space-y-2 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900">{skillEntry.name}</div>
                              <div className="text-xs text-gray-500 mt-1">{skillEntry.attribute || 'No attribute'}</div>
                            </div>
                            <Button type="button" size="sm" variant="danger_outline" onClick={() => removeSkillEntry(skillEntry.skill_id)}>
                              Remove
                            </Button>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="text-xs font-semibold uppercase text-gray-500">Level</label>
                            <input
                              type="number"
                              min="1"
                              value={skillEntry.level}
                              onChange={(e) => updateSkillEntryLevel(skillEntry.skill_id, parseInt(e.target.value, 10) || 1)}
                              className="w-24 px-2 py-1 border rounded-md text-sm"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Heroic Abilities</label>
              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={abilitySearch}
                      onChange={(e) => setAbilitySearch(e.target.value)}
                      placeholder="Search heroic abilities..."
                      className="w-full pl-9 pr-4 py-2 border rounded-md"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-md bg-white divide-y">
                    {isLoadingAbilities ? (
                      <div className="p-4 text-sm text-gray-500">Loading heroic abilities...</div>
                    ) : filteredHeroicAbilities.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">No heroic abilities matched your search.</div>
                    ) : (
                      filteredHeroicAbilities.map((ability) => (
                        <div key={ability.id} className="flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{ability.name}</div>
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{ability.description}</div>
                          </div>
                          <Button type="button" size="sm" variant="secondary" onClick={() => addHeroicAbilityItem(ability)}>
                            Add
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Selected Heroic Abilities</div>
                  <div className="max-h-64 overflow-y-auto border rounded-md bg-stone-50 divide-y">
                    {selectedHeroicAbilities.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">No heroic abilities selected yet.</div>
                    ) : (
                      selectedHeroicAbilities.map((abilityEntry) => (
                        <div key={abilityEntry.ability_id} className="p-3 space-y-2 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900">{abilityEntry.name}</div>
                              {abilityEntry.willpower_cost != null ? (
                                <div className="text-xs text-gray-500 mt-1">WP Cost: {abilityEntry.willpower_cost}</div>
                              ) : null}
                            </div>
                            <Button type="button" size="sm" variant="danger_outline" onClick={() => removeHeroicAbilityItem(abilityEntry.ability_id)}>
                              Remove
                            </Button>
                          </div>
                          {abilityEntry.description ? (
                            <div className="text-xs text-gray-600 leading-relaxed">{abilityEntry.description}</div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Gear Notes</label>
              <textarea
                value={monsterData.stats.GEAR || ''}
                onChange={(e) => handleStatsChange('GEAR', e.target.value)}
                rows={3}
                placeholder="Optional notes about valuables, consumables, or loose gear not tracked as equipped items"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          <div className="mt-5 pt-5 border-t">
            <h4 className="text-base font-semibold mb-3 text-gray-800">Equipped Gear From App Items</h4>
            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={gearSearch}
                    onChange={(e) => setGearSearch(e.target.value)}
                    placeholder="Search app items by name, category, skill, or damage..."
                    className="w-full pl-9 pr-4 py-2 border rounded-md"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto border rounded-md bg-white divide-y">
                  {isLoadingItems ? (
                    <div className="p-4 text-sm text-gray-500">Loading items...</div>
                  ) : filteredGearItems.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">No items matched your search.</div>
                  ) : (
                    filteredGearItems.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {item.category || 'Item'}
                            {item.skill ? ` • ${item.skill}` : ''}
                            {item.damage ? ` • ${item.damage}` : ''}
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="secondary" onClick={() => addGearItem(item)}>
                          Add
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700">Equipped Items</div>
                <div className="max-h-72 overflow-y-auto border rounded-md bg-stone-50 divide-y">
                  {equippedGearItems.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">
                      No equipped items yet. Add one or more app items to make this NPC use real gear in combat.
                    </div>
                  ) : (
                    equippedGearItems.map((gearItem) => (
                      <div key={gearItem.item_id} className="p-3 space-y-2 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{gearItem.name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {gearItem.category || 'Item'}
                              {gearItem.skill ? ` • ${gearItem.skill}` : ''}
                              {gearItem.damage ? ` • ${gearItem.damage}` : ''}
                            </div>
                          </div>
                          <Button type="button" size="sm" variant="danger_outline" onClick={() => removeGearItem(gearItem.item_id)}>
                            Remove
                          </Button>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-semibold uppercase text-gray-500">Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={gearItem.quantity}
                            onChange={(e) => updateGearItemQuantity(gearItem.item_id, parseInt(e.target.value, 10) || 1)}
                            className="w-20 px-2 py-1 border rounded-md text-sm"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t">
            <h4 className="text-base font-semibold mb-3 text-gray-800">Optional Combat Extras</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Armor</label>
                <input
                  type="number"
                  value={monsterData.stats.ARMOR}
                  onChange={(e) => handleStatsChange('ARMOR', parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Movement</label>
                <input
                  type="number"
                  value={monsterData.stats.MOVEMENT}
                  onChange={(e) => handleStatsChange('MOVEMENT', parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ferocity</label>
                <input
                  type="number"
                  value={monsterData.stats.FEROCITY}
                  onChange={(e) => handleStatsChange('FEROCITY', parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
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
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 border rounded-md shadow-sm">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ferocity</label>
              <input
                type="number"
                value={monsterData.stats.FEROCITY}
                onChange={(e) => handleStatsChange('FEROCITY', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Movement</label>
              <input
                type="number"
                value={monsterData.stats.MOVEMENT}
                onChange={(e) => handleStatsChange('MOVEMENT', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Armor</label>
              <input
                type="number"
                value={monsterData.stats.ARMOR}
                onChange={(e) => handleStatsChange('ARMOR', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
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
        </div>
      )}

      <div className="p-4 border rounded-md shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-1">Effects Summary</label>
        <textarea
          value={monsterData.effectsSummary || ''}
          onChange={(e) => handleInputChange('effectsSummary', e.target.value)}
          rows={3}
          placeholder="Describe any special effects, traits, or passive abilities here..."
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Attacks Section */}
      <div className="p-4 border rounded-md shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Attacks {isNpcMonster ? '(Optional)' : '(D6 Rollable Table)'}</h3>
          <Button variant="secondary" size="sm" icon={PlusCircle} onClick={addAttack}>Add Attack</Button>
        </div>
        {monsterData.attacks.length === 0 && (
          <p className="text-gray-500">
            {isNpcMonster
              ? 'No attacks defined. Leave this empty for manual combat handling, or add attacks if this NPC should use a monster-style attack table.'
              : 'No attacks defined. Click "Add Attack" to create one.'}
          </p>
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
