import React from 'react';
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

// Helper function to calculate base skill chance
const getBaseChance = (value: number): number => {
  if (value <= 5) return 3;
  if (value <= 8) return 4;
  if (value <= 12) return 5;
  if (value <= 15) return 6;
  return 7;
};

// Define the skill-attribute mapping
const skillAttributeMap: Record<string, AttributeName> = {
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT',
    'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL',
    'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT',
    'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT',
    'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL',
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR',
    'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR'
};

// Define all base skills
const allBaseSkills = Object.keys(skillAttributeMap);


export function CharacterCreationWizard() {
  const { user } = useAuth();
  const { step, setStep, character, resetCharacter } = useCharacterCreation();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const CurrentStep = steps[step].component;

  // Validation for each step
  const canProceed = () => {
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
      case 6: return character.startingEquipment && character.startingEquipment.items.length >= 0;
      case 7:
        // Final step validation: ensure all appearance fields, including memento and weak_spot, are filled.
        return !!character.appearance && character.appearance.trim().length > 0 &&
               !!character.mementos && character.mementos.length > 0 &&
               !!character.weak_spot && character.weak_spot.trim().length > 0;
      default:
        return false;
    }
  };

  const handleSave = async () => {
    if (!user) {
      setError('You must be logged in to create a character');
      return;
    }
    if (!canProceed()) {
        setError('Please complete all required fields for the final step before saving.');
        return;
    }
    if (!character.attributes) {
        setError('Attributes must be set before saving.');
        return;
    }

    try {
      setSaving(true);
      setError(null);
      console.log('[CharacterSave] Starting character save process...');

      // --- Calculate Initial Skill Levels ---
      const initialSkillLevels: Record<string, number> = {};
      const trainedSkillsSet = new Set(character.trainedSkills || []);
      allBaseSkills.forEach(skillName => {
          const attribute = skillAttributeMap[skillName];
          if (!attribute) return;
          const attributeValue = character.attributes?.[attribute] ?? 0;
          const baseChance = getBaseChance(attributeValue);
          initialSkillLevels[skillName] = trainedSkillsSet.has(skillName) ? baseChance * 2 : baseChance;
      });
      console.log('[CharacterSave] Calculated initial skill levels:', initialSkillLevels);

      // Combine Kin and Profession heroic abilities
      const combinedHeroicAbilities = [
        ...(character.kinAbilityNames || []),
        ...(character.professionHeroicAbilityName ? [character.professionHeroicAbilityName] : [])
      ].filter(Boolean);
      console.log('[CharacterSave] Combined heroic abilities:', combinedHeroicAbilities);

      // Prepare character data for Supabase insert.
      const characterData = {
        user_id: user.id,
        name: character.name?.trim(),
        kin: character.kin,
        profession: character.profession,
        magic_school: character.magicSchool,
        age: character.age,
        attributes: character.attributes,
        trained_skills: character.trainedSkills || [],
        other_skills: character.otherSkills || [],
        skill_levels: initialSkillLevels,
        equipment: character.equipment || {
          inventory: [], equipped: { weapons: [] }, money: { gold: 0, silver: 0, copper: 0 }
        },
        appearance: character.appearance?.trim(),
        conditions: character.conditions || {
          exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false
        },
        spells: character.spells || null,
        starting_equipment: character.startingEquipment || { items: [], money: { gold: 0, silver: 0, copper: 0 } },
        experience: { marked_skills: [] },
        current_hp: character.attributes?.CON ?? 10,
        current_wp: character.attributes?.WIL ?? 10,
        heroic_ability: combinedHeroicAbilities,

        // FIX: Map frontend state names to the correct database column names.
        // The database expects 'memento' and 'weak_spot'.
        memento: character.mementos?.[0] || null, // Take the first memento string from the array
        weak_spot: character.weak_spot || null,       // Map weak_spot state to the 'weak_spot' column
      };
      console.log('[CharacterSave] Prepared character data for insert:', characterData);

      // Save character to the database.
      console.log('[CharacterSave] Inserting character into Supabase...');
      const { data: savedCharacter, error: saveError } = await supabase
        .from('characters')
        .insert(characterData)
        .select()
        .single();

      if (saveError) {
          console.error('[CharacterSave] Supabase insert error:', saveError);
          throw saveError;
      }
      if (!savedCharacter) {
          console.error('[CharacterSave] Character insert succeeded but no data returned.');
          throw new Error('Character not created or data not returned.');
      }
      console.log('[CharacterSave] Character saved successfully:', savedCharacter);

      // --- Post-Save Actions ---
      console.log('[CharacterSave] Invalidating characters query cache...');
      await queryClient.invalidateQueries({ queryKey: ['characters', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['characters'] });

      console.log('[CharacterSave] Resetting character creation store...');
      resetCharacter();

      const newCharacterId = savedCharacter.id;
      console.log(`[CharacterSave] Navigating to /characters/${newCharacterId}`);
      navigate(`/characters/${newCharacterId}`);

    } catch (err) {
      console.error('[CharacterSave] Save process failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to save character';
      setError(`Failed to save character: ${message}`);
    } finally {
      console.log('[CharacterSave] Save process finished (finally block).');
      setSaving(false);
    }
  };


  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-6 md:p-8 my-8">
      {/* Header & Progress */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-3xl font-bold text-gray-800">Create New Character</h2>
          <span className="text-sm font-medium text-gray-500">
            Step {step + 1} of {steps.length}
          </span>
        </div>
        <div className="flex space-x-1">
          {steps.map((s, i) => (
            <div key={s.title} className="flex-1 h-2 rounded-full overflow-hidden bg-gray-200">
               <div
                 className={`h-full rounded-full transition-all duration-300 ${
                   i < step ? 'bg-blue-500' : i === step ? 'bg-blue-300' : 'bg-gray-200'
                 }`}
                 style={{ width: i === step ? '50%' : '100%' }}
               />
            </div>
          ))}
        </div>
         <p className="text-center text-lg font-semibold mt-3 text-gray-700">{steps[step].title}</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-lg shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-800">Creation Error</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Render the current step component */}
      <div className="min-h-[400px] mb-8">
        <CurrentStep />
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mt-8 border-t pt-6">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0 || saving}
          className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        {step === steps.length - 1 ? (
          // Final Step: Create Character Button
          <button
            onClick={handleSave}
            disabled={!canProceed() || saving}
            className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-150 ${
              saving ? 'bg-gray-400 cursor-not-allowed' : !canProceed() ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving Character...' : 'Create Character'}
          </button>
        ) : (
          // Intermediate Steps: Next Button
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed() || saving}
            className={`inline-flex items-center px-5 py-2 text-sm font-medium text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150 ${
              !canProceed() || saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Next Step
          </button>
        )}
      </div>
    </div>
  );
}
