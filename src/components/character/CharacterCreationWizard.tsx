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
import { Save, AlertCircle, Info, ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AttributeName } from '../../types/character';
import { useQueryClient } from '@tanstack/react-query';

const steps = [
  { title: 'Kin', component: KinSelection, tooltip: 'Your Kin determines your innate ability and movement speed.' },
  { title: 'Profession', component: ProfessionSelection, tooltip: 'Your Profession defines your starting skills, gear, and heroic ability.' },
  { title: 'Name & Age', component: NameAgeSelection, tooltip: 'Age affects your starting attributes and skill points. Young = High Stats, Old = Many Skills.' },
  { title: 'Attributes', component: AttributesSelection, tooltip: 'Roll or assign scores. Attributes range from 3-18. High stats grant bonuses.' },
  { title: 'Magic', component: MagicSelection, tooltip: 'Only Mages select spells. Pick 3 Tricks and 3 Rank 1 Spells.' },
  { title: 'Trained Skills', component: TrainedSkillsSelection, tooltip: 'Trained skills start at double your base chance. Select based on your profession and age.' },
  { title: 'Gear', component: GearSelection, tooltip: 'Choose a starting equipment pack. You can roll for items or money.' },
  { title: 'Appearance', component: AppearanceSelection, tooltip: 'Define your look, memento, and weakness. This adds flavor to your character.' },
];

// --- UTILS ---
const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`;

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
        if (!error && data) setAllMagicSchools(data);
      });
  }, []);

  const canProceed = () => {
    switch (step) {
      case 0: return !!character.kin && character.kinAbilityNames !== undefined && character.kinAbilityNames.length > 0;
      case 1:
        const isMage = character.magicSchool !== null && character.magicSchool !== undefined;
        return !!character.profession && (isMage || character.professionHeroicAbilityName !== undefined);
      case 2: return !!character.name && character.name.trim().length > 0 && !!character.age;
      case 3: return character.attributes && Object.values(character.attributes).every(value => value > 0);
      case 4: 
        if (character.magicSchool) {
           const generalCount = character.spells?.general?.length || 0;
           const schoolCount = character.spells?.school?.spells?.length || 0;
           return (generalCount + schoolCount) === 6;
        }
        return true;
      case 5: return character.trainedSkills && character.trainedSkills.length >= 6 && !!character.attributes;
      case 6: return !!character.startingEquipment; 
      case 7:
        return !!character.appearance && character.appearance.trim().length > 0 &&
               !!character.mementos && character.mementos.length > 0 &&
               !!character.weak_spot && character.weak_spot.trim().length > 0;
      default:
        return false;
    }
  };

  const handleSave = async () => {
    const finalCharacterState = useCharacterCreation.getState().character;

    if (!user || !finalCharacterState.attributes) {
      setError('User or attributes missing.');
      return;
    }
    if (!canProceed()) {
      setError('Please complete all required fields.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // --- 1. Prepare Skills ---
      const initialSkillLevels: Record<string, number> = {};
      const trainedSkillsSet = new Set(finalCharacterState.trainedSkills || []);
      const isMage = !!finalCharacterState.magicSchool;
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

      // --- 2. Prepare Abilities ---
      const combinedHeroicAbilities = [
        ...(finalCharacterState.kinAbilityNames || []),
        ...(finalCharacterState.professionHeroicAbilityName ? [finalCharacterState.professionHeroicAbilityName] : [])
      ].filter(Boolean);

      // --- 3. HYDRATE EQUIPMENT ---
      const startingItemsRaw = finalCharacterState.startingEquipment?.items || [];
      const startingMoney = finalCharacterState.equipment?.money || { gold: 0, silver: 0, copper: 0 };

      const initialInventory = startingItemsRaw.map(item => {
        let name = '';
        let quantity = 1;

        if (typeof item === 'string') {
            const quantityRegex = /(?:(\d+)\s*x\s+)|(?:x\s*(\d+))|(?:[(\[]x?(\d+)[)\]])|^(\d+)\s+/;
            const match = item.match(quantityRegex);
            
            if (match) {
                const qStr = match[1] || match[2] || match[3] || match[4];
                if (qStr) quantity = parseInt(qStr, 10);
                name = item.replace(match[0], '').trim();
            } else {
                name = item.trim();
            }
        } else if (typeof item === 'object' && item !== null) {
            name = item.name || '';
            quantity = item.quantity || 1;
        }

        if (!name) return null;

        return {
          id: generateId(),
          name: name,
          quantity: quantity,
        };
      }).filter((i): i is NonNullable<typeof i> => i !== null);

      const validEquipment = {
        money: {
            gold: startingMoney.gold || 0,
            silver: startingMoney.silver || 0,
            copper: startingMoney.copper || 0
        },
        equipped: {
          armor: undefined,
          helmet: undefined,
          weapons: [],
          wornClothes: [],
          containers: [],
          animals: []
        },
        inventory: initialInventory
      };

      // --- 4. Build Payload ---
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
        equipment: validEquipment, 
        starting_equipment: finalCharacterState.startingEquipment || { items: [], money: { gold: 0, silver: 0, copper: 0 } },
        appearance: finalCharacterState.appearance?.trim(),
        conditions: { exhausted: false, sickly: false, dazed: false, angry: false, scared: false, disheartened: false },
        spells: finalCharacterState.spells || null,
        experience: { marked_skills: [] },
        max_hp: finalCharacterState.attributes.CON,
        current_hp: finalCharacterState.attributes.CON,
        max_wp: finalCharacterState.attributes.WIL,
        current_wp: finalCharacterState.attributes.WIL,
        heroic_ability: combinedHeroicAbilities,
        memento: finalCharacterState.mementos?.[0] || null,
        weak_spot: finalCharacterState.weak_spot || null,
      };

      const { data: savedCharacter, error: saveError } = await supabase
        .from('characters')
        .insert(characterData)
        .select()
        .single();

      if (saveError) throw saveError;

      await queryClient.invalidateQueries({ queryKey: ['characters', user.id] });
      resetCharacter();
      navigate(`/characters/${savedCharacter.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save character';
      console.error('Save Error:', err);
      setError(`Failed to save character: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:p-8">
      {/* HEADER: Title & Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Character Creation</h2>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Step {step + 1} of {steps.length}</span>
        </div>
        
        {/* Mobile-Friendly Progress Bar */}
        <div className="flex gap-1 h-2 mb-2">
          {steps.map((s, i) => (
            <div key={s.title} className="flex-1 rounded-full overflow-hidden bg-gray-200">
               <div className={`h-full transition-all duration-300 ${i < step ? 'bg-green-500' : i === step ? 'bg-blue-600' : 'bg-transparent'}`} />
            </div>
          ))}
        </div>
        <p className="text-center text-lg font-semibold text-gray-700">{steps[step].title}</p>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-800 text-sm">Action Required</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* TOOLTIP / INFO BOX */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-3 shadow-sm">
         <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
         <p className="text-sm text-blue-800 leading-relaxed">{steps[step].tooltip}</p>
      </div>

      {/* CONTENT AREA */}
      <div className="min-h-[300px] mb-8 bg-white rounded-lg shadow-sm border border-gray-100 p-4 md:p-6">
        <CurrentStep />
      </div>

      {/* FOOTER NAVIGATION */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200 sticky bottom-0 bg-white/95 backdrop-blur-sm p-4 -mx-4 md:mx-0 z-20">
        <button 
          onClick={() => setStep(step - 1)} 
          disabled={step === 0 || saving} 
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>

        {step === steps.length - 1 ? (
          <button 
            onClick={handleSave} 
            disabled={!canProceed() || saving} 
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold text-white rounded-lg shadow-md transition-all active:scale-95 ${saving ? 'bg-gray-400 cursor-not-allowed' : !canProceed() ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {saving ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Create Character'}
          </button>
        ) : (
          <button 
            onClick={() => setStep(step + 1)} 
            disabled={!canProceed() || saving} 
            className={`flex items-center gap-1 px-6 py-2 text-sm font-bold text-white rounded-lg shadow-md transition-all active:scale-95 ${!canProceed() || saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}