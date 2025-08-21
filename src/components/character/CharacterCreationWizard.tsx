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
import { AttributeName } from '../../types/character'; // Import AttributeName
import { useQueryClient } from '@tanstack/react-query'; // Import queryClient hook

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
  const queryClient = useQueryClient(); // Get query client instance
  const CurrentStep = steps[step].component;

  // Validation for each step
  const canProceed = () => {
    switch (step) {
      case 0: // Kin
        return !!character.kin && character.kinAbilityNames !== undefined && character.kinAbilityNames.length > 0; // Ensure kin and abilities are set
      case 1: // Profession
        const isMage = character.magicSchool !== null && character.magicSchool !== undefined;
        // Profession must be selected.
        // If it's NOT a mage, EITHER a heroic ability name is selected OR we need to know no abilities were offered/required.
        // The ProfessionSelection component handles the logic of setting professionHeroicAbilityName to null if none are selected/available.
        // So, we check if profession is set. If not a mage, professionHeroicAbilityName must not be undefined (it can be null).
        return !!character.profession &&
               (isMage || character.professionHeroicAbilityName !== undefined);
      case 2: // Name & Age
        // Check if name exists and is not just whitespace, and if age category is selected (truthy)
        return !!character.name && character.name.trim().length > 0 && !!character.age;
      case 3: // Attributes
        return character.attributes && Object.values(character.attributes).every(value => value > 0);
      case 4: // Magic
        if (character.magicSchool) {
          // Mage needs 3 general spells selected
          return character.spells?.general && character.spells.general.length >= 3;
        }
        return true; // Non-mages always pass this step
      case 5: // Trained Skills
        // Ensure at least 6 skills are selected AND attributes are defined (needed for level calc)
        return character.trainedSkills && character.trainedSkills.length >= 6 && !!character.attributes;
      case 6: // Gear
        // Ensure starting equipment is defined and has items (or explicitly empty if allowed)
        return character.startingEquipment && character.startingEquipment.items.length >= 0; // Allow empty starting gear
      case 7: // Appearance
        return !!character.appearance && character.appearance.trim().length > 0;
      default:
        return false;
    }
  };


const handleSave = async () => {
  if (!user) {
    setError('You must be logged in to create a character');
    return;
  }
  // Final validation check before attempting save
  if (!canProceed()) {
      setError('Please complete all required fields for the final step before saving.');
      return;
  }
  // Ensure attributes are present before calculating skill levels
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
        if (!attribute) {
            console.warn(`[CharacterSave] Missing attribute mapping for skill: ${skillName}`);
            return; // Skip if mapping is missing
        }
        // Use optional chaining and nullish coalescing for safety
        const attributeValue = character.attributes?.[attribute] ?? 0;
        const baseChance = getBaseChance(attributeValue);
        const isTrained = trainedSkillsSet.has(skillName);
        initialSkillLevels[skillName] = isTrained ? baseChance * 2 : baseChance;
    });
    console.log('[CharacterSave] Calculated initial skill levels:', initialSkillLevels);
    // --- End Calculate Initial Skill Levels ---


    // Combine Kin and Profession heroic abilities (filter out null/undefined)
    const combinedHeroicAbilities = [
      ...(character.kinAbilityNames || []),
      ...(character.professionHeroicAbilityName ? [character.professionHeroicAbilityName] : [])
    ].filter(Boolean); // Ensure only valid strings are included
    console.log('[CharacterSave] Combined heroic abilities:', combinedHeroicAbilities);


    // Prepare character data for Supabase insert.
    const characterData = {
      user_id: user.id,
      name: character.name?.trim(), // Trim name
      kin: character.kin,
      profession: character.profession,
      magic_school: character.magicSchool, // This should be the ID
      age: character.age, // Store the age category string ('Young', 'Adult', 'Old')
      attributes: character.attributes,
      trained_skills: character.trainedSkills || [],
      other_skills: character.otherSkills || [],
      skill_levels: initialSkillLevels, // Add calculated skill levels
      // Ensure equipment structure is valid, provide defaults
      equipment: character.equipment || {
        inventory: [],
        equipped: { weapons: [] }, // Ensure equipped has weapons array
        money: { gold: 0, silver: 0, copper: 0 }
      },
      appearance: character.appearance?.trim(), // Trim appearance
      // Ensure conditions structure is valid
      conditions: character.conditions || {
        exhausted: false, sickly: false, dazed: false,
        angry: false, scared: false, disheartened: false
      },
      spells: character.spells || null, // Use null if no spells selected/mage
      starting_equipment: character.startingEquipment || { items: [], money: { gold: 0, silver: 0, copper: 0 } }, // Provide default structure
      experience: {
        marked_skills: [] // Initialize marked_skills as empty array
      },
			// Calculate initial HP/WP based on attributes, default to 10 if attributes somehow missing
			current_hp: character.attributes?.CON ?? 10,
			current_wp: character.attributes?.WIL ?? 10,
      heroic_ability: combinedHeroicAbilities, // Use the combined array
      // created_at is handled by Supabase
    };
    console.log('[CharacterSave] Prepared character data for insert:', characterData);


    // Remove undefined keys just in case (though defaults should prevent this)
    Object.keys(characterData).forEach(key => {
      if (characterData[key as keyof typeof characterData] === undefined) {
        console.warn(`[CharacterSave] Removing undefined key: ${key}`);
        delete characterData[key as keyof typeof characterData];
      }
    });


    // Save character to the database and return the inserted row.
    console.log('[CharacterSave] Inserting character into Supabase...');
    const { data: savedCharacter, error: saveError } = await supabase
      .from('characters')
      .insert(characterData) // Insert the prepared data object directly
      .select() // Select all columns of the newly inserted row
      .single(); // Expecting a single row back

    if (saveError) {
        console.error('[CharacterSave] Supabase insert error:', saveError);
        throw saveError; // Throw the error to be caught below
    }
    if (!savedCharacter) {
        console.error('[CharacterSave] Character insert succeeded but no data returned.');
        throw new Error('Character not created or data not returned.');
    }

    console.log('[CharacterSave] Character saved successfully:', savedCharacter);

    // --- Post-Save Actions ---
    // 1. Invalidate character list query cache so the list updates elsewhere
    console.log('[CharacterSave] Invalidating characters query cache...');
    await queryClient.invalidateQueries({ queryKey: ['characters', user.id] }); // Invalidate user-specific list
    await queryClient.invalidateQueries({ queryKey: ['characters'] }); // Invalidate general list if used

    // 2. Reset the creation wizard state
    console.log('[CharacterSave] Resetting character creation store...');
    resetCharacter();

    // 3. Navigate to the newly created character's page
    const newCharacterId = savedCharacter.id;
    console.log(`[CharacterSave] Navigating to /characters/${newCharacterId}`);
    navigate(`/characters/${newCharacterId}`);
    // --- End Post-Save Actions ---

  } catch (err) {
    console.error('[CharacterSave] Save process failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to save character';
    //// Provide more specific error messages based on common Supabase errors
    if (message.includes('violates check constraint') && message.includes('attributes_check')) {
       setError('Failed to save character: Invalid attribute values. Please ensure all attributes are set correctly.');
    } else if (message.includes('violates not-null constraint')) {
       // Extract column name if possible (might require parsing message)
       const columnMatch = message.match(/null value in column "(\w+)"/);
       const columnName = columnMatch ? columnMatch[1] : 'a required field';
       setError(`Failed to save character: ${columnName} is missing. Please review your selections. Details: ${message}`);
    } else if (message.includes('unique constraint')) {
        setError(`Failed to save character: A character with this name might already exist or another unique field conflicts.`);
    }
     else {
       setError(`Failed to save character: ${message}`);
    }
  } finally {
    console.log('[CharacterSave] Save process finished (finally block).');
    setSaving(false); // Ensure saving indicator is turned off
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
        {/* Progress Bar */}
        <div className="flex space-x-1">
          {steps.map((s, i) => (
            <div key={s.title} className="flex-1 h-2 rounded-full overflow-hidden bg-gray-200">
               <div
                 className={`h-full rounded-full transition-all duration-300 ${
                   i < step ? 'bg-blue-500' : i === step ? 'bg-blue-300' : 'bg-gray-200'
                 }`}
                 style={{ width: i === step ? '50%' : '100%' }} // Show partial progress on current step
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
      <div className="min-h-[400px] mb-8"> {/* Ensure consistent height */}
        <CurrentStep />
      </div>


      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mt-8 border-t pt-6">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0 || saving} // Disable while saving
          className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        {step === steps.length - 1 ? (
          // Final Step: Create Character Button
          <button
            onClick={handleSave}
            disabled={!canProceed() || saving}
            className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-150 ${
              saving
                ? 'bg-gray-400 cursor-not-allowed'
                : !canProceed()
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving Character...' : 'Create Character'}
          </button>
        ) : (
          // Intermediate Steps: Next Button
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed() || saving} // Disable while saving
            className={`inline-flex items-center px-5 py-2 text-sm font-medium text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150 ${
              saving
                ? 'bg-gray-400 cursor-not-allowed' // Consistent disabled style
                : !canProceed()
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Next Step
          </button>
        )}
      </div>
    </div>
  );
}
