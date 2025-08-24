import React, { useState } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { User, Ruler, Palette, Sparkles, Save, AlertCircle, Info, Dices, ToggleLeft, ToggleRight, HeartCrack, Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchBioData } from '../../../lib/api/compendium';
import { Button } from '../../shared/Button';

// Interfaces for component state
interface AppearanceDetails {
  height: string;
  build: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  skinTone: string;
  distinctiveFeatures: string;
  clothing: string; // Now fully separate
  memento: string;
  flaw: string;
}

interface InputModes {
  distinctiveFeatures: 'manual' | 'select';
  clothing: 'manual' | 'select';
  memento: 'manual' | 'select';
  flaw: 'manual' | 'select';
}

// --- EXPANDED & NEW OPTION LISTS ---

const heightOptions = ['Diminutive', 'Short', 'Below Average', 'Average', 'Above Average', 'Tall', 'Towering'];
const buildOptions = ['Gaunt', 'Slight', 'Lean', 'Wiry', 'Average', 'Athletic', 'Muscular', 'Stocky', 'Heavy'];
const hairColorOptions = ['Raven Black', 'Chestnut Brown', 'Sandy Blonde', 'Fiery Red', 'Ash Gray', 'Snow White', 'Auburn'];
const hairStyleOptions = ['Slicked Back', 'Short & Spiky', 'Long & Flowing', 'Ornate Braids', 'Messy Bun', 'Curly Mop', 'Shaved Sides', 'Tonsure', 'Bald'];
const eyeColorOptions = ['Chocolate Brown', 'Sky Blue', 'Emerald Green', 'Stormy Gray', 'Warm Hazel', 'Amber'];
const skinToneOptions = ['Pale', 'Fair', 'Light', 'Olive', 'Ruddy', 'Tan', 'Dark', 'Ebony'];

// Fantasy color options for randomizer flair
const unusualHairColorOptions = ['Deep Blue', 'Crimson', 'Silver', 'Violet', 'Pastel Pink'];
const unusualEyeColorOptions = ['Lilac', 'Gold', 'Silver', 'Blood Red', 'All White (No Pupil)'];

// NEW: Dedicated clothing options list
const clothingOptions = [
    "Simple traveler's clothes", "Ragged commoner's garb", "Well-made leather armor", "Sturdy chainmail hauberk", "Flamboyant noble's attire",
    "Scholar's robes and spectacles", "Mysterious hooded cloak", "Practical hunter's leathers", "Grim ritual vestments", "Colorful entertainer's outfit",
    "Tailored city guard uniform", "Patched and worn adventurer's gear"
];


// Reusable component for dropdown or manual textarea inputs
const SelectOrManualInput = ({
  label, placeholder, options, value, onChange, mode, onModeChange, onRandomize, isLoading = false, rows = 3,
}: {
  label: string; placeholder: string; options: string[]; value: string; onChange: (value: string) => void;
  mode: 'manual' | 'select'; onModeChange: (mode: 'manual' | 'select') => void; onRandomize: () => void;
  isLoading?: boolean; rows?: number;
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <button onClick={() => onModeChange(mode === 'manual' ? 'select' : 'manual')} className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600" title={`Switch to ${mode === 'manual' ? 'selection' : 'manual'} mode`}>
          {mode === 'manual' ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
          <span>{mode === 'manual' ? 'Manual' : 'Select'}</span>
        </button>
      </div>
      {mode === 'manual' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border border-gray-300 rounded-md" rows={rows}/>
      ) : (
        <div className="flex items-center gap-2">
          <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" disabled={isLoading || options.length === 0}>
            <option value="">{isLoading ? 'Loading...' : 'Select an option...'}</option>
            {options.map((option) => (<option key={option} value={option}>{option}</option>))}
          </select>
          <Button variant="secondary" size="icon" onClick={onRandomize} disabled={isLoading || options.length === 0} aria-label={`Randomize ${label}`} icon={Dices}/>
        </div>
      )}
    </div>
  );
};


export function AppearanceSelection() {
  const { character, updateCharacter } = useCharacterCreation();

  const { data: bioOptions, isLoading: isLoadingBio } = useQuery({
    queryKey: ['bioData'],
    queryFn: fetchBioData,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [appearance, setAppearance] = useState<AppearanceDetails>({
    height: '', build: '', hairColor: '', hairStyle: '', eyeColor: '', skinTone: '',
    distinctiveFeatures: '', clothing: '', memento: '', flaw: '',
  });

  const [modes, setModes] = useState<InputModes>({
    distinctiveFeatures: 'select', clothing: 'select', memento: 'select', flaw: 'select',
  });

  const handleAppearanceChange = (field: keyof AppearanceDetails, value: string) => {
    setAppearance(prev => ({ ...prev, [field]: value }));
  };

  const handleModeChange = (field: keyof InputModes, mode: 'manual' | 'select') => {
    setModes(prev => ({ ...prev, [field]: mode }));
    setAppearance(prev => ({ ...prev, [field]: '' }));
  };

  const getRandomOption = (options: string[]) => {
    if (!options || options.length === 0) return '';
    return options[Math.floor(Math.random() * options.length)];
  };
  
  const handleRandomize = (field: keyof AppearanceDetails, options: string[] | undefined) => {
    if (options && options.length > 0) {
      setAppearance(prev => ({ ...prev, [field]: getRandomOption(options) }));
    }
  };

  const handleRandomizeBody = () => {
    setAppearance(prev => ({ ...prev, height: getRandomOption(heightOptions), build: getRandomOption(buildOptions) }));
  };

  const handleRandomizeFace = () => {
    const hair = Math.random() < 0.05 ? getRandomOption(unusualHairColorOptions) : getRandomOption(hairColorOptions);
    const eyes = Math.random() < 0.05 ? getRandomOption(unusualEyeColorOptions) : getRandomOption(eyeColorOptions);
    setAppearance(prev => ({ ...prev, hairColor: hair, hairStyle: getRandomOption(hairStyleOptions), eyeColor: eyes, skinTone: getRandomOption(skinToneOptions) }));
  };
  
  // UPDATED: generateDescription to handle separated clothing
  const generateDescription = () => {
    const parts: string[] = [];
    if (appearance.height && appearance.build) parts.push(`A ${appearance.height.toLowerCase()}, ${appearance.build.toLowerCase()} individual`);
    if (appearance.hairStyle && appearance.hairColor) {
      if (appearance.hairStyle.toLowerCase() === 'bald') parts.push('with a bald head');
      else parts.push(`with ${appearance.hairStyle.toLowerCase()} ${appearance.hairColor.toLowerCase()} hair`);
    }
    if (appearance.eyeColor) parts.push(`${appearance.eyeColor.toLowerCase()} eyes`);
    if (appearance.skinTone) parts.push(`and ${appearance.skinTone.toLowerCase()} skin`);

    let description = parts.join(', ').replace(/,([^,]*)$/, ' and$1') + '.';
    
    // Append distinctive features and clothing as separate sentences for clarity
    if(appearance.distinctiveFeatures) {
        description += ` They are notable for ${appearance.distinctiveFeatures.toLowerCase()}.`;
    }
    if(appearance.clothing) {
        description += ` They typically wear ${appearance.clothing.toLowerCase()}.`;
    }
    
    return description;
  };

  const handleSave = () => {
    const description = generateDescription();
    updateCharacter({
      appearance: description,
      mementos: appearance.memento ? [appearance.memento] : [],
      weak_spot: appearance.flaw,
    });
  };

  const isComplete = () => {
    return Object.values(appearance).every(value => value.trim() !== '');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800">Character Appearance</h2>
        <p className="mt-2 text-gray-600">Describe your character's physical appearance, clothing, and defining traits.</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Character Details</h4>
          <p className="text-sm text-blue-700">{character.kin} • {character.age} • {character.profession}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
        {/* Physical Characteristics */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium flex items-center gap-2 text-gray-800"><Ruler className="w-5 h-5 text-gray-500" />Physical Characteristics</h4>
            <Button variant="secondary" size="sm" icon={Dices} onClick={handleRandomizeBody}>Randomize</Button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
            <select value={appearance.height} onChange={(e) => handleAppearanceChange('height', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
              <option value="">Select height...</option>
              {heightOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Build</label>
            <select value={appearance.build} onChange={(e) => handleAppearanceChange('build', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
              <option value="">Select build...</option>
              {buildOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>

        {/* Hair and Face */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium flex items-center gap-2 text-gray-800"><User className="w-5 h-5 text-gray-500" />Hair and Face</h4>
            <Button variant="secondary" size="sm" icon={Dices} onClick={handleRandomizeFace}>Randomize</Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hair Color</label>
              <select value={appearance.hairColor} onChange={(e) => handleAppearanceChange('hairColor', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="">Select color...</option>
                {[...hairColorOptions, ...unusualHairColorOptions].map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hair Style</label>
              <select value={appearance.hairStyle} onChange={(e) => handleAppearanceChange('hairStyle', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="">Select style...</option>
                {hairStyleOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eye Color</label>
              <select value={appearance.eyeColor} onChange={(e) => handleAppearanceChange('eyeColor', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="">Select color...</option>
                {[...eyeColorOptions, ...unusualEyeColorOptions].map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skin Tone</label>
              <select value={appearance.skinTone} onChange={(e) => handleAppearanceChange('skinTone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="">Select tone...</option>
                {skinToneOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>
        </div>
        
        <div className="space-y-4 md:col-span-2"><h4 className="font-medium flex items-center gap-2 text-gray-800 border-b pb-2"><Sparkles className="w-5 h-5 text-gray-500" />Traits & Possessions</h4></div>
        
        <SelectOrManualInput label="Distinctive Feature" placeholder="Scars, tattoos, birthmarks..." options={bioOptions?.appearance || []} value={appearance.distinctiveFeatures} onChange={(v) => handleAppearanceChange('distinctiveFeatures', v)} mode={modes.distinctiveFeatures} onModeChange={(m) => handleModeChange('distinctiveFeatures', m)} onRandomize={() => handleRandomize('distinctiveFeatures', bioOptions?.appearance)} isLoading={isLoadingBio} />
        {/* UPDATED: Clothing now uses its own options and is not dependent on isLoadingBio */}
        <SelectOrManualInput label="Typical Clothing" placeholder="Describe typical clothing..." options={clothingOptions} value={appearance.clothing} onChange={(v) => handleAppearanceChange('clothing', v)} mode={modes.clothing} onModeChange={(m) => handleModeChange('clothing', m)} onRandomize={() => handleRandomize('clothing', clothingOptions)} />
        <SelectOrManualInput label="Memento" placeholder="A locket, a worn coin..." options={bioOptions?.mementos || []} value={appearance.memento} onChange={(v) => handleAppearanceChange('memento', v)} mode={modes.memento} onModeChange={(m) => handleModeChange('memento', m)} onRandomize={() => handleRandomize('memento', bioOptions?.mementos)} isLoading={isLoadingBio} />
        <SelectOrManualInput label="Flaw / Weak Spot" placeholder="A fear of heights, a gambling problem..." options={bioOptions?.flaws || []} value={appearance.flaw} onChange={(v) => handleAppearanceChange('flaw', v)} mode={modes.flaw} onModeChange={(m) => handleModeChange('flaw', m)} onRandomize={() => handleRandomize('flaw', bioOptions?.flaws)} isLoading={isLoadingBio} />
      </div>

      {isComplete() ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
          <h4 className="font-medium text-green-800 mb-1">Appearance Preview</h4>
          <p className="text-sm text-green-700">{generateDescription()}</p>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Incomplete Description</h4>
            <p className="text-sm text-amber-700">Please fill in all appearance details to see a preview and save.</p>

          </div>
        </div>
      )}

      <Button onClick={handleSave} disabled={!isComplete()} icon={Save} className="w-full justify-center">Save Appearance</Button>
    </div>
  );
}
