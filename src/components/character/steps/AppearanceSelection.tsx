import React, { useState, useEffect } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { User, Ruler, Palette, Sparkles, Save, AlertCircle, Info, Dices, CheckCircle2, ToggleLeft, ToggleRight, Shirt, HeartCrack, Gem, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchBioData } from '../../../lib/api/compendium';
import { Button } from '../../shared/Button';
import { LoadingSpinner } from '../../shared/LoadingSpinner';

// --- OPTIONS LISTS ---
const heightOptions = ['Diminutive', 'Short', 'Below Average', 'Average', 'Above Average', 'Tall', 'Towering'];
const buildOptions = ['Gaunt', 'Slight', 'Lean', 'Wiry', 'Average', 'Athletic', 'Muscular', 'Stocky', 'Heavy'];
const hairColorOptions = ['Raven Black', 'Chestnut Brown', 'Sandy Blonde', 'Fiery Red', 'Ash Gray', 'Snow White', 'Auburn'];
const hairStyleOptions = ['Slicked Back', 'Short & Spiky', 'Long & Flowing', 'Ornate Braids', 'Messy Bun', 'Curly Mop', 'Shaved Sides', 'Tonsure', 'Bald'];
const eyeColorOptions = ['Chocolate Brown', 'Sky Blue', 'Emerald Green', 'Stormy Gray', 'Warm Hazel', 'Amber'];
const skinToneOptions = ['Pale', 'Fair', 'Light', 'Olive', 'Ruddy', 'Tan', 'Dark', 'Ebony'];
const unusualHairColorOptions = ['Deep Blue', 'Crimson', 'Silver', 'Violet', 'Pastel Pink'];
const unusualEyeColorOptions = ['Lilac', 'Gold', 'Silver', 'Blood Red', 'All White (No Pupil)'];

const clothingOptions = [
    "Simple traveler's clothes", "Ragged commoner's garb", "Well-made leather armor", "Sturdy chainmail hauberk", "Flamboyant noble's attire",
    "Scholar's robes and spectacles", "Mysterious hooded cloak", "Practical hunter's leathers", "Grim ritual vestments", "Colorful entertainer's outfit",
    "Tailored city guard uniform", "Patched and worn adventurer's gear"
];

// --- TYPES ---
interface AppearanceDetails {
  height: string; build: string; hairColor: string; hairStyle: string; eyeColor: string; skinTone: string;
  distinctiveFeatures: string; clothing: string; memento: string; flaw: string;
}

interface InputModes {
  distinctiveFeatures: 'manual' | 'select';
  clothing: 'manual' | 'select';
  memento: 'manual' | 'select';
  flaw: 'manual' | 'select';
}

// --- SUB-COMPONENT: SelectOrManualInput ---
const SelectOrManualInput = ({
  label, icon: Icon, placeholder, options, value, onChange, mode, onModeChange, onRandomize, isLoading = false, rows = 2,
}: {
  label: string; icon?: any; placeholder: string; options: string[]; value: string; onChange: (value: string) => void;
  mode: 'manual' | 'select'; onModeChange: (mode: 'manual' | 'select') => void; onRandomize: () => void;
  isLoading?: boolean; rows?: number;
}) => {
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-blue-500" />} {label}
        </label>
        <button 
          onClick={() => onModeChange(mode === 'manual' ? 'select' : 'manual')} 
          className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded transition-colors touch-manipulation"
        >
          {mode === 'manual' ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
          {mode === 'manual' ? 'Type' : 'List'}
        </button>
      </div>
      
      {mode === 'manual' ? (
        <textarea 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          placeholder={placeholder} 
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
          rows={rows}
        />
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
             <select 
                value={value} 
                onChange={(e) => onChange(e.target.value)} 
                className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-md appearance-none bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100" 
                disabled={isLoading || options.length === 0}
             >
                <option value="">{isLoading ? 'Loading options...' : 'Select an option...'}</option>
                {options.map((option) => (<option key={option} value={option}>{option}</option>))}
             </select>
             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
             </div>
          </div>
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={onRandomize} 
            disabled={isLoading || options.length === 0} 
            className="flex-shrink-0 w-10 h-10"
            title="Randomize"
          >
            <Dices size={18} />
          </Button>
        </div>
      )}
    </div>
  );
};

// --- MAIN COMPONENT ---
export function AppearanceSelection() {
  const { character, updateCharacter } = useCharacterCreation();

  const { data: bioOptions, isLoading: isLoadingBio } = useQuery({
    queryKey: ['bioData'],
    queryFn: fetchBioData,
    staleTime: 1000 * 60 * 5,
  });

  const [appearance, setAppearance] = useState<AppearanceDetails>({
    height: '', build: '', hairColor: '', hairStyle: '', eyeColor: '', skinTone: '',
    distinctiveFeatures: '', clothing: '', memento: '', flaw: '',
  });

  const [modes, setModes] = useState<InputModes>({
    distinctiveFeatures: 'select', clothing: 'select', memento: 'select', flaw: 'select',
  });

  // Sync initial state if coming back to step
  useEffect(() => {
     if (character.appearance) {
        // NOTE: Parsing a full description string back into fields is hard. 
        // For now, we assume if they are editing, they might start fresh or we rely on them re-selecting.
        // Ideally, store individual fields in character state too, but for this wizard flow, 
        // we persist mainly the final string.
     }
  }, []);

  const handleAppearanceChange = (field: keyof AppearanceDetails, value: string) => {
    setAppearance(prev => ({ ...prev, [field]: value }));
  };

  const handleModeChange = (field: keyof InputModes, mode: 'manual' | 'select') => {
    setModes(prev => ({ ...prev, [field]: mode }));
    setAppearance(prev => ({ ...prev, [field]: '' }));
  };

  const getRandomOption = (options: string[]) => options && options.length > 0 ? options[Math.floor(Math.random() * options.length)] : '';
  
  const handleRandomize = (field: keyof AppearanceDetails, options: string[] | undefined) => {
    if (options && options.length > 0) handleAppearanceChange(field, getRandomOption(options));
  };

  const handleRandomizeBody = () => {
    handleAppearanceChange('height', getRandomOption(heightOptions));
    handleAppearanceChange('build', getRandomOption(buildOptions));
  };

  const handleRandomizeFace = () => {
    const hair = Math.random() < 0.05 ? getRandomOption(unusualHairColorOptions) : getRandomOption(hairColorOptions);
    const eyes = Math.random() < 0.05 ? getRandomOption(unusualEyeColorOptions) : getRandomOption(eyeColorOptions);
    setAppearance(prev => ({ ...prev, hairColor: hair, hairStyle: getRandomOption(hairStyleOptions), eyeColor: eyes, skinTone: getRandomOption(skinToneOptions) }));
  };
  
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
    
    if(appearance.distinctiveFeatures) description += ` They are notable for ${appearance.distinctiveFeatures.toLowerCase()}.`;
    if(appearance.clothing) description += ` They typically wear ${appearance.clothing.toLowerCase()}.`;
    
    return description;
  };

  const handleSave = () => {
    updateCharacter({
      appearance: generateDescription(),
      mementos: appearance.memento ? [appearance.memento] : [],
      weak_spot: appearance.flaw,
    });
  };

  const isComplete = () => Object.values(appearance).every(value => value.trim() !== '');

  return (
    <div className="space-y-6 pb-20"> {/* pb-20 for fixed footer clearance */}
      <div className="text-center md:text-left">
        <h2 className="text-xl font-bold text-gray-800">Character Appearance</h2>
        <p className="mt-1 text-sm text-gray-600">Describe your character's physical look, clothing, and traits.</p>
      </div>

      {/* Info Badge */}
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
        <User className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-blue-900 text-sm">{character.name}</h4>
          <p className="text-xs text-blue-700">{character.kin} • {character.age} • {character.profession}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* SECTION 1: PHYSICAL BODY */}
        <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                <h4 className="font-bold text-gray-700 flex items-center gap-2"><Ruler className="w-4 h-4" /> Body</h4>
                <Button variant="secondary" size="xs" icon={Dices} onClick={handleRandomizeBody}>Roll</Button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Height</label>
                    <select value={appearance.height} onChange={(e) => handleAppearanceChange('height', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">Select...</option>
                        {heightOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Build</label>
                    <select value={appearance.build} onChange={(e) => handleAppearanceChange('build', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">Select...</option>
                        {buildOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            </div>
        </div>

        {/* SECTION 2: FACE & HAIR */}
        <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                <h4 className="font-bold text-gray-700 flex items-center gap-2"><Palette className="w-4 h-4" /> Face & Hair</h4>
                <Button variant="secondary" size="xs" icon={Dices} onClick={handleRandomizeFace}>Roll</Button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Hair Color</label>
                    <select value={appearance.hairColor} onChange={(e) => handleAppearanceChange('hairColor', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">Select...</option>
                        {[...hairColorOptions, ...unusualHairColorOptions].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Hair Style</label>
                    <select value={appearance.hairStyle} onChange={(e) => handleAppearanceChange('hairStyle', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">Select...</option>
                        {hairStyleOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Eye Color</label>
                    <select value={appearance.eyeColor} onChange={(e) => handleAppearanceChange('eyeColor', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">Select...</option>
                        {[...eyeColorOptions, ...unusualEyeColorOptions].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Skin Tone</label>
                    <select value={appearance.skinTone} onChange={(e) => handleAppearanceChange('skinTone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">Select...</option>
                        {skinToneOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            </div>
        </div>

        {/* SECTION 3: TRAITS & STORY (Full Width) */}
        <div className="lg:col-span-2 space-y-6 pt-4 border-t border-gray-200">
            <h4 className="font-bold text-gray-700 flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4" /> Personal Details</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SelectOrManualInput 
                    label="Distinctive Feature" 
                    icon={Eye}
                    placeholder="Scars, tattoos, birthmarks..." 
                    options={bioOptions?.appearance || []} 
                    value={appearance.distinctiveFeatures} 
                    onChange={(v) => handleAppearanceChange('distinctiveFeatures', v)} 
                    mode={modes.distinctiveFeatures} 
                    onModeChange={(m) => handleModeChange('distinctiveFeatures', m)} 
                    onRandomize={() => handleRandomize('distinctiveFeatures', bioOptions?.appearance)} 
                    isLoading={isLoadingBio} 
                />
                
                <SelectOrManualInput 
                    label="Typical Clothing" 
                    icon={Shirt}
                    placeholder="Describe typical clothing..." 
                    options={clothingOptions} 
                    value={appearance.clothing} 
                    onChange={(v) => handleAppearanceChange('clothing', v)} 
                    mode={modes.clothing} 
                    onModeChange={(m) => handleModeChange('clothing', m)} 
                    onRandomize={() => handleRandomize('clothing', clothingOptions)} 
                />
                
                <SelectOrManualInput 
                    label="Memento" 
                    icon={Gem}
                    placeholder="A locket, a worn coin..." 
                    options={bioOptions?.mementos || []} 
                    value={appearance.memento} 
                    onChange={(v) => handleAppearanceChange('memento', v)} 
                    mode={modes.memento} 
                    onModeChange={(m) => handleModeChange('memento', m)} 
                    onRandomize={() => handleRandomize('memento', bioOptions?.mementos)} 
                    isLoading={isLoadingBio} 
                />
                
                <SelectOrManualInput 
                    label="Flaw / Weak Spot" 
                    icon={HeartCrack}
                    placeholder="A fear of heights, a gambling problem..." 
                    options={bioOptions?.flaws || []} 
                    value={appearance.flaw} 
                    onChange={(v) => handleAppearanceChange('flaw', v)} 
                    mode={modes.flaw} 
                    onModeChange={(m) => handleModeChange('flaw', m)} 
                    onRandomize={() => handleRandomize('flaw', bioOptions?.flaws)} 
                    isLoading={isLoadingBio} 
                />
            </div>
        </div>
      </div>

      {/* PREVIEW BOX */}
      {isComplete() ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2 mt-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
             <CheckCircle2 className="w-5 h-5 text-green-600" />
             <h4 className="font-bold text-green-800">Preview</h4>
          </div>
          <p className="text-sm text-green-800 italic bg-white/50 p-3 rounded border border-green-100">
            "{generateDescription()}"
          </p>
          <div className="flex gap-4 text-xs text-green-700 mt-2">
             <span><strong>Memento:</strong> {appearance.memento}</span>
             <span><strong>Flaw:</strong> {appearance.flaw}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mt-6">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm text-amber-800">Incomplete Description</h4>
            <p className="text-xs text-amber-700 mt-1">Please fill in all details to generate your character's description.</p>
          </div>
        </div>
      )}

      {/* Manual Save Button for intermediate saving if needed (Wizard handles final save) */}
      <Button 
        onClick={handleSave} 
        disabled={!isComplete()} 
        className={`w-full justify-center py-3 mt-4 font-bold shadow-md ${isComplete() ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 text-gray-500'}`}
      >
        <Save className="w-4 h-4 mr-2" /> Confirm Appearance
      </Button>
    </div>
  );
}
