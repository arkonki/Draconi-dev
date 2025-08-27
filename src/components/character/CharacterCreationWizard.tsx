import React, { useState, useEffect } from 'react';
import { useCharacterCreation } from '../../stores/characterCreation';
import { KinSelection } from './steps/KinSelection';
import { ProfessionSelection } from './steps/ProfessionSelection';
import { NameAgeSelection } from './steps/NameAgeSelection';
import { AttributesSelection } from './steps/AttributesSelection';
import { MagicSelection } from './steps/MagicSelection';
import { TrainedSkillsSelection } from './steps/TrainedSkillsSelection';
import { GearSelection } from './steps/GearSelection';
import { AppearanceSelection } from './steps/AppearanceSelection';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AttributeName } from '../../types/character';
import { useQueryClient } from '@tanstack/react-query';

const steps = [
  { title: 'Kin', component: KinSelection },
  { title: 'Profession', component: ProfessionSelection },
  { title: 'Name & Age', component: NameAgeSelection },
  { title: 'Attributes', component: AttributesSelection },
  { title: 'Magic', component: MagicSelection },
  { title: 'Trained Skills', component: TrainedSkillsSelection },
  { title: 'Gear', component: GearSelection },
  { title: 'Appearance', component: AppearanceSelection },
];

const getBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

const skillAttributeMap: Record<string, AttributeName> = {
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT',
    'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL',
    'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT',
    'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL',
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR',
    'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR',
    'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL'
};

const magicSkillNames = ['Mentalism', 'Animism', 'Elementalism'];


export function CharacterCreationWizard() {
  const { user } = useAuth();
  // We still use 'character' for validation checks, which is fine as it triggers re-renders for the 'canProceed' logic.
  const { step, setStep, character, resetCharacter } = useCharacterCreation();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const CurrentStep = steps[step].component;
  const [allMagicSchools, setAllMagicSchools] = useState<{id: string, name: string}[]>([]);
  
  useEffect(() => {
    supabase.from('magic_schools').select('id, name')
      .then(({ data, error }) => {
        if (error) console.error("Failed to fetch magic schools in wizard:", error);
        else setAllMagicSchools(data || []);
      });
  }, []);

  const canProceed = () => {
    // ... canProceed logic remains the same
    switch (step) {
      case 0: return !!character.kin && character.kinAbilityNames !== undefined && character.kinAbilityNames.length > 0;
      case 1:
        const isMage = character.magicSchool !== null && character.magicSchool !== undefined;
        return !!character.profession && (isMage || character.professionHeroicAbilityName !== undefined);
      case 2: return !!character.name && character.name.trim().length > 0 && !!character.age;
      case 3: return character.attributes && Object.values(character.attributes).every(value => value > 0);
      case 4:
        if (character.magicSchool) return character.spells?.general && character.spells.general.length >= 3;
        return true;
      case 5: return character.trainedSkills && character.trainedSkills.length >= 6 && !!character.attributes;
      case 6: return character.startingEquipment && character.startingEquipment.items.length >= 0; // This now works correctly
      case 7:
        return !!character.appearance && character.appearance.trim().length > 0 &&
               !!character.mementos && character.mementos.length > 0 &&
               !!character.weak_spot && character.weak_spot.trim().length > 0;
      default:
        return false;
    }
  };

  const handleSave = async () => {
    // --- FIX: Get the absolute latest character state directly from the store ---
    // This avoids using the potentially stale 'character' object from the component's render scope.
    const finalCharacterState = useCharacterCreation.getState().character;

    if (!user || !finalCharacterState.attributes) {
      setError('User or attributes missing.');
      return;
    }
    // We can still use 'canProceed' as it's driven by the reactive 'character' object
    if (!canProceed()) {
      setError('Please complete all required fields for the final step before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const initialSkillLevels: Record<string, number> = {};
      const trainedSkillsSet = new Set(finalCharacterState.trainedSkills || []);
      const isMage = finalCharacterState.profession?.toLowerCase().includes('mage');
      const magicSchoolName = isMage && typeof finalCharacterState.magicSchool === 'string'
        ? allMagicSchools.find(s => s.id === finalCharacterState.magicSchool)?.name
        : null;

      for (const skillName in skillAttributeMap) {
        const attribute = skillAttributeMap[skillName];
        const isThisASkillTheCharacterShouldHave =
          !magicSkillNames.includes(skillName) ||
          (isMage && skillName === magicSchoolName);
        
        if (isThisASkillTheCharacterShouldHave) {
          const attributeValue = finalCharacterState.attributes[attribute] ?? 10;
          const baseChance = getBaseChance(attributeValue);
          initialSkillLevels[skillName] = trainedSkillsSet.has(skillName) ? baseChance * 2 : baseChance;
        }
      }

      const combinedHeroicAbilities = [
        ...(finalCharacterState.kinAbilityNames || []),
        ...(finalCharacterState.professionHeroicAbilityName ? [finalCharacterState.professionHeroicAbilityName] : [])
      ].filter(Boolean);

      // --- FIX: Build the final data object using the fresh `finalCharacterState` ---
      const characterData = {
        user_id: user.id,
        name: finalCharacterState.name?.trim(),
        kin: finalCharacterState.kin,
        profession: finalCharacterState.profession,
        magic_school: isMage ? finalCharacterState.magicSchool : null,
        age: finalCharacterState.age,
        attributes: finalCharacterState.attributes,
        trained_skills: finalCharacterState.trainedSkills || [],
        skill_levels: initialSkillLevels,
        equipment: finalCharacterState.equipment || { inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 } },
        appearance: finalCharacterState.appearance?.trim(),
        conditions: { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false },
        spells: finalCharacterState.spells || null,
        starting_equipment: finalCharacterState.startingEquipment || { items: [], money: { gold: 0, silver: 0, copper: 0 } },
        experience: { marked_skills: [] },
        current_hp: finalCharacterState.attributes.CON,
        current_wp: finalCharacterState.attributes.WIL,
        heroic_ability: combinedHeroicAbilities,
        memento: finalCharacterState.mementos?.[0] || null,
        weak_spot: finalCharacterState.weak_spot || null,
      };

      const { data: savedCharacter, error: saveError } = await supabase.from('characters').insert(characterData).select().single();
      if (saveError) throw saveError;

      await queryClient.invalidateQueries({ queryKey: ['characters', user.id] });
      resetCharacter();
      navigate(`/characters/${savedCharacter.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save character';
      setError(`Failed to save character: ${message}`);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-6 md:p-8 my-8">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-3xl font-bold text-gray-800">Create New Character</h2>
          <span className="text-sm font-medium text-gray-500">Step {step + 1} of {steps.length}</span>
        </div>
        <div className="flex space-x-1">
          {steps.map((s, i) => (
            <div key={s.title} className="flex-1 h-2 rounded-full overflow-hidden bg-gray-200">
               <div className={`h-full rounded-full transition-all duration-300 ${i < step ? 'bg-blue-500' : i === step ? 'bg-blue-300' : 'bg-gray-200'}`} style={{ width: i === step ? '50%' : '100%' }}/>
            </div>
          ))}
        </div>
         <p className="text-center text-lg font-semibold mt-3 text-gray-700">{steps[step].title}</p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-lg shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-800">Creation Error</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="min-h-[400px] mb-8">
        <CurrentStep />
      </div>

      <div className="flex justify-between items-center mt-8 border-t pt-6">
        <button onClick={() => setStep(step - 1)} disabled={step === 0 || saving} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
          Previous
        </button>

        {step === steps.length - 1 ? (
          <button onClick={handleSave} disabled={!canProceed() || saving} className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-150 ${saving ? 'bg-gray-400 cursor-not-allowed' : !canProceed() ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving Character...' : 'Create Character'}
          </button>
        ) : (
          <button onClick={() => setStep(step + 1)} disabled={!canProceed() || saving} className={`inline-flex items-center px-5 py-2 text-sm font-medium text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150 ${!canProceed() || saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            Next Step
          </button>
        )}
      </div>
    </div>
  );
}
