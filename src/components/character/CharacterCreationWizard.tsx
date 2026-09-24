import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCharacterCreation } from '../../stores/characterCreation';
import { KinSelection } from './steps/KinSelection';
import { ProfessionSelection } from './steps/ProfessionSelection';
import { NameAgeSelection } from './steps/NameAgeSelection';
import { AttributesSelection } from './steps/AttributesSelection';
import { MagicSelection } from './steps/MagicSelection';
import { TrainedSkillsSelection } from './steps/TrainedSkillsSelection';
import { GearSelection } from './steps/GearSelection';
import { AppearanceSelection } from './steps/AppearanceSelection';
import { useAuth } from '../../contexts/useAuth';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle, Info, ChevronRight, ChevronLeft, Check, Circle, X, UserRound, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AttributeName } from '../../types/character';
import { useQueryClient } from '@tanstack/react-query';

type WizardStepId = 'kin' | 'profession' | 'identity' | 'attributes' | 'magic' | 'skills' | 'gear' | 'appearance' | 'review';

interface WizardStepDefinition {
  id: WizardStepId;
  title: string;
  shortTitle: string;
  component: React.ComponentType;
  tooltip: string;
}

const steps: WizardStepDefinition[] = [
  { id: 'kin', title: 'Choose your Kin', shortTitle: 'Kin', component: KinSelection, tooltip: 'Your Kin determines your innate ability and movement speed.' },
  { id: 'profession', title: 'Choose your Profession', shortTitle: 'Profession', component: ProfessionSelection, tooltip: 'Your Profession defines your starting skills, gear, and heroic ability.' },
  { id: 'identity', title: 'Name & Age', shortTitle: 'Identity', component: NameAgeSelection, tooltip: 'Age affects your starting attributes and skill points. Young characters have higher attributes; older characters have more trained skills.' },
  { id: 'attributes', title: 'Assign Attributes', shortTitle: 'Attributes', component: AttributesSelection, tooltip: 'Roll or assign scores from 3–18. Age modifiers are applied automatically.' },
  { id: 'magic', title: 'Select Magic', shortTitle: 'Magic', component: MagicSelection, tooltip: 'Choose 3 Magic Tricks and 3 Rank 1 Spells for your mage.' },
  { id: 'skills', title: 'Select Trained Skills', shortTitle: 'Skills', component: TrainedSkillsSelection, tooltip: 'Trained skills start at double your base chance. Choose profession skills first, then age-based elective skills.' },
  { id: 'gear', title: 'Choose Starting Gear', shortTitle: 'Gear', component: GearSelection, tooltip: 'Choose a starting equipment package and resolve any item or money rolls.' },
  { id: 'appearance', title: 'Define your Character', shortTitle: 'Appearance', component: AppearanceSelection, tooltip: 'Define your appearance, memento, and weakness.' },
  { id: 'review', title: 'Review your Character', shortTitle: 'Review', component: CharacterReview, tooltip: 'Review your choices before creating the character. You can return to any completed section.' },
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

interface CharacterCreationWizardProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

function CharacterReview() {
  const { character } = useCharacterCreation();
  const attributes = character.attributes ? Object.entries(character.attributes) : [];
  const equipmentItems = character.startingEquipment?.items || [];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-bold text-gray-900">Ready for adventure?</h3>
        <p className="mt-1 text-sm text-gray-500">Check the details below. Use the step list to make changes before saving.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Identity</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Name</dt><dd className="font-semibold text-gray-900">{character.name || '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Kin</dt><dd className="font-semibold text-gray-900">{character.kin || '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Profession</dt><dd className="font-semibold text-gray-900">{character.profession || '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Age</dt><dd className="font-semibold text-gray-900">{character.age || '—'}</dd></div>
          </dl>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Attributes</h4>
          <div className="grid grid-cols-3 gap-2">
            {attributes.map(([name, value]) => (
              <div key={name} className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-slate-400">{name}</div>
                <div className="text-lg font-bold text-slate-800">{value}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Training & Abilities</h4>
          <p className="text-sm text-gray-700"><strong>{character.trainedSkills?.length || 0}</strong> trained skills</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(character.trainedSkills || []).map(skill => <span key={skill} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{skill}</span>)}
          </div>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Starting Gear</h4>
          <p className="text-sm text-gray-700"><strong>{equipmentItems.length}</strong> equipment entries selected</p>
          {character.magicSchool && <p className="mt-2 text-sm text-purple-700"><strong>{(character.spells?.general?.length || 0) + (character.spells?.school?.spells?.length || 0)}</strong> spells and tricks selected</p>}
        </section>
      </div>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h4 className="text-sm font-bold text-emerald-900">Character details</h4>
        <p className="mt-1 text-sm text-emerald-800">{character.appearance || 'No appearance entered.'}</p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-emerald-700">Memento:</span> <strong>{character.mementos?.[0] || '—'}</strong></p>
          <p><span className="text-emerald-700">Weakness:</span> <strong>{character.weak_spot || '—'}</strong></p>
        </div>
      </section>
    </div>
  );
}

function CharacterDraftSummary() {
  const { character } = useCharacterCreation();
  const completedAttributes = character.attributes ? Object.values(character.attributes).filter(value => value > 0).length : 0;
  const spellCount = (character.spells?.general?.length || 0) + (character.spells?.school?.spells?.length || 0);
  const rows = [
    ['Name', character.name],
    ['Kin', character.kin],
    ['Profession', character.profession],
    ['Age', character.age],
    ['Attributes', completedAttributes ? `${completedAttributes}/6 assigned` : null],
    ['Skills', character.trainedSkills?.length ? `${character.trainedSkills.length} trained` : null],
    ['Magic', character.magicSchool ? `${spellCount}/6 selected` : null],
    ['Gear', character.startingEquipment ? 'Selected' : null],
  ].filter(([, value]) => value);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700"><UserRound className="h-5 w-5" /></div>
        <div><h3 className="font-bold text-gray-900">Character draft</h3><p className="text-xs text-gray-500">Updates as you make choices</p></div>
      </div>
      {rows.length ? (
        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={String(label)} className="border-b border-gray-100 pb-2 last:border-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-gray-800">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Your choices will appear here.</p>}
    </div>
  );
}

export function CharacterCreationWizard({ onComplete, onCancel }: CharacterCreationWizardProps) {
  const { user } = useAuth();
  const { step, setStep, character, resetCharacter } = useCharacterCreation();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const visibleSteps = useMemo(
    () => steps.filter(candidate => candidate.id !== 'magic' || !!character.magicSchool),
    [character.magicSchool]
  );
  const activeStepIndex = Math.min(step, visibleSteps.length - 1);
  const activeStep = visibleSteps[activeStepIndex];
  const CurrentStep = activeStep.component;
  
  const [allMagicSchools, setAllMagicSchools] = useState<{id: string, name: string}[]>([]);
  
  useEffect(() => {
    supabase.from('magic_schools').select('id, name')
      .then(({ data, error }) => {
        if (!error && data) setAllMagicSchools(data);
      });
  }, []);

  useEffect(() => {
    if (step !== activeStepIndex) setStep(activeStepIndex);
  }, [activeStepIndex, setStep, step]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setError(null);
  }, [activeStepIndex]);

  const canProceed = (stepId: WizardStepId = activeStep.id) => {
    switch (stepId) {
      case 'kin': return !!character.kin && character.kinAbilityNames !== undefined && character.kinAbilityNames.length > 0;
      case 'profession': {
        const isMage = character.magicSchool !== null && character.magicSchool !== undefined;
        return !!character.profession && (isMage || character.professionHeroicAbilityName !== undefined);
      }
      case 'identity': return !!character.name && character.name.trim().length > 0 && !!character.age;
      case 'attributes': return !!character.attributes && Object.values(character.attributes).every(value => value > 0);
      case 'magic':
        if (character.magicSchool) {
           const generalCount = character.spells?.general?.length || 0;
           const schoolCount = character.spells?.school?.spells?.length || 0;
           return (generalCount + schoolCount) === 6;
        }
        return true;
      case 'skills': return !!character.trainedSkills && character.trainedSkills.length >= 6 && !!character.attributes;
      case 'gear': return !!character.startingEquipment;
      case 'appearance':
        return !!character.appearance && character.appearance.trim().length > 0 &&
               !!character.mementos && character.mementos.length > 0 &&
               !!character.weak_spot && character.weak_spot.trim().length > 0;
      case 'review': return canProceed('appearance');
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
    if (!canProceed('review')) {
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
            const quantityRegex = /(?:(\d+)\s*x\s+)|(?:x\s*(\d+))|(?:[([]x?(\d+)[)\]])|^(\d+)\s+/;
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
        given_name: finalCharacterState.given_name?.trim() || null,
        nickname: finalCharacterState.nickname?.trim() || null,
        family_name: finalCharacterState.family_name?.trim() || null,
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
      onComplete?.();
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
    <div className="mx-auto h-[calc(100dvh-9rem)] min-h-[26rem] w-full max-w-[1600px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:h-[calc(100dvh-8rem)] lg:min-h-[32rem]">
      <div className="grid h-full lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_280px]">
        <aside className="hidden min-h-0 border-r border-gray-200 bg-slate-50/80 p-5 lg:flex lg:flex-col">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2.5 text-white"><ScrollText className="h-5 w-5" /></div>
            <div><h2 className="font-extrabold text-gray-900">Create Character</h2><p className="text-xs text-gray-500">Build your adventurer</p></div>
          </div>
          <nav aria-label="Character creation progress" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {visibleSteps.map((wizardStep, index) => {
              const isActive = index === activeStepIndex;
              const isComplete = index < activeStepIndex;
              return (
                <button
                  key={wizardStep.id}
                  type="button"
                  disabled={index > activeStepIndex}
                  onClick={() => index <= activeStepIndex && setStep(index)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${isActive ? 'bg-indigo-100 font-bold text-indigo-800' : isComplete ? 'text-gray-700 hover:bg-white' : 'cursor-not-allowed text-gray-400'}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${isActive ? 'border-indigo-600 bg-indigo-600 text-white' : isComplete ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white'}`}>
                    {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  {wizardStep.shortTitle}
                </button>
              );
            })}
          </nav>
          {onCancel && <button type="button" onClick={onCancel} className="mt-4 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-white hover:text-gray-800"><X className="h-4 w-4" /> Exit wizard</button>}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600"><span>Step {activeStepIndex + 1} of {visibleSteps.length}</span><Circle className="h-1.5 w-1.5 fill-current" /><span className="truncate">{activeStep.shortTitle}</span></div>
                <h2 className="mt-1 text-xl font-extrabold text-gray-900 sm:text-2xl">{activeStep.title}</h2>
              </div>
              {onCancel && <button type="button" onClick={onCancel} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 lg:hidden" aria-label="Exit character creation"><X className="h-5 w-5" /></button>}
            </div>
            <div className="mt-3 flex h-1.5 gap-1 lg:hidden">
              {visibleSteps.map((wizardStep, index) => <div key={wizardStep.id} className={`flex-1 rounded-full ${index < activeStepIndex ? 'bg-emerald-500' : index === activeStepIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />)}
            </div>
            <div className="mt-3 flex items-start gap-2 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <p>{activeStep.tooltip}</p>
            </div>
            <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 xl:hidden">
              <summary className="cursor-pointer text-xs font-bold text-slate-600">Character so far</summary>
              <div className="mt-3"><CharacterDraftSummary /></div>
            </details>
          </header>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div><h4 className="text-sm font-semibold text-red-800">Action required</h4><p className="mt-1 text-sm text-red-700">{error}</p></div>
              </div>
            )}
            <div className="h-full"><CurrentStep /></div>
          </div>

          <footer className="fixed inset-x-0 bottom-0 z-40 flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-white/95 py-3 pl-4 pr-20 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:pl-6 sm:pr-24 lg:static lg:z-20 lg:px-8 lg:shadow-none">
        <button 
          onClick={() => setStep(activeStepIndex - 1)}
          disabled={activeStepIndex === 0 || saving}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Previous</span>
        </button>

        {activeStep.id === 'review' ? (
          <button 
            onClick={handleSave} 
            disabled={!canProceed('review') || saving}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-lg shadow-md transition-all active:scale-95 ${saving ? 'bg-gray-400 cursor-not-allowed' : !canProceed('review') ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {saving ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Create Character'}
          </button>
        ) : (
          <button 
            onClick={() => setStep(activeStepIndex + 1)}
            disabled={!canProceed() || saving} 
            className={`flex items-center gap-1 px-5 py-2.5 text-sm font-bold text-white rounded-lg shadow-md transition-all active:scale-95 ${!canProceed() || saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            <span className="hidden sm:inline">Continue to </span>{visibleSteps[activeStepIndex + 1]?.shortTitle}<ChevronRight className="w-4 h-4" />
          </button>
        )}
          </footer>
        </main>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-5 xl:block">
          <CharacterDraftSummary />
        </aside>
      </div>
    </div>
  );
}
