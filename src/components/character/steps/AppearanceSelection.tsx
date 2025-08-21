import React, { useState } from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { User, Ruler, Scale, Palette, Sparkles, Save, AlertCircle, Info } from 'lucide-react';

interface AppearanceDetails {
  height: string;
  build: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  skinTone: string;
  distinctiveFeatures: string;
  clothing: string;
}

const heightOptions = ['Short', 'Below Average', 'Average', 'Above Average', 'Tall'];
const buildOptions = ['Slight', 'Lean', 'Average', 'Athletic', 'Muscular', 'Heavy'];
const hairColorOptions = ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Other'];
const hairStyleOptions = ['Short', 'Medium', 'Long', 'Braided', 'Curly', 'Straight', 'Bald'];
const eyeColorOptions = ['Brown', 'Blue', 'Green', 'Gray', 'Hazel', 'Other'];
const skinToneOptions = ['Fair', 'Light', 'Medium', 'Tan', 'Dark', 'Other'];

export function AppearanceSelection() {
  const { character, updateCharacter } = useCharacterCreation();
  const [appearance, setAppearance] = useState<AppearanceDetails>({
    height: '',
    build: '',
    hairColor: '',
    hairStyle: '',
    eyeColor: '',
    skinTone: '',
    distinctiveFeatures: '',
    clothing: ''
  });

  const generateDescription = () => {
    const parts = [];
    
    // Basic physical description
    if (appearance.height && appearance.build) {
      parts.push(`A ${appearance.height.toLowerCase()}, ${appearance.build.toLowerCase()} individual`);
    }

    // Hair description
    if (appearance.hairStyle && appearance.hairColor) {
      if (appearance.hairStyle.toLowerCase() === 'bald') {
        parts.push('Bald');
      } else {
        parts.push(`${appearance.hairStyle.toLowerCase()} ${appearance.hairColor.toLowerCase()} hair`);
      }
    }

    // Eyes and skin
    if (appearance.eyeColor) {
      parts.push(`${appearance.eyeColor.toLowerCase()} eyes`);
    }
    if (appearance.skinTone) {
      parts.push(`${appearance.skinTone.toLowerCase()} skin`);
    }

    // Distinctive features
    if (appearance.distinctiveFeatures) {
      parts.push(appearance.distinctiveFeatures);
    }

    // Clothing
    if (appearance.clothing) {
      parts.push(`Typically wearing ${appearance.clothing}`);
    }

    return parts.join('. ') + '.';
  };

  const handleSave = () => {
    const description = generateDescription();
    updateCharacter({ appearance: description });
  };

  const isComplete = () => {
    return (
      appearance.height &&
      appearance.build &&
      appearance.hairColor &&
      appearance.hairStyle &&
      appearance.eyeColor &&
      appearance.skinTone &&
      appearance.distinctiveFeatures &&
      appearance.clothing
    );
  };

  return (
    <div className="space-y-6">
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Character Appearance</h3>
        <p className="text-gray-600">
          Describe your character's physical appearance. This will help bring your character to life
          during gameplay.
        </p>
      </div>

      {/* Character Race/Age Info */}
      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">Character Details</h4>
          <p className="text-sm text-blue-700">
            {character.kin} • {character.age} • {character.profession}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Physical Characteristics */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Ruler className="w-5 h-5 text-gray-500" />
            Physical Characteristics
          </h4>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Height
            </label>
            <select
              value={appearance.height}
              onChange={(e) => setAppearance({ ...appearance, height: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select height...</option>
              {heightOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Build
            </label>
            <select
              value={appearance.build}
              onChange={(e) => setAppearance({ ...appearance, build: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select build...</option>
              {buildOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Hair and Face */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <User className="w-5 h-5 text-gray-500" />
            Hair and Face
          </h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hair Color
              </label>
              <select
                value={appearance.hairColor}
                onChange={(e) => setAppearance({ ...appearance, hairColor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select color...</option>
                {hairColorOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hair Style
              </label>
              <select
                value={appearance.hairStyle}
                onChange={(e) => setAppearance({ ...appearance, hairStyle: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select style...</option>
                {hairStyleOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Eye Color
              </label>
              <select
                value={appearance.eyeColor}
                onChange={(e) => setAppearance({ ...appearance, eyeColor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select color...</option>
                {eyeColorOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skin Tone
              </label>
              <select
                value={appearance.skinTone}
                onChange={(e) => setAppearance({ ...appearance, skinTone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select tone...</option>
                {skinToneOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Distinctive Features */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gray-500" />
            Distinctive Features
          </h4>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notable Features
            </label>
            <textarea
              value={appearance.distinctiveFeatures}
              onChange={(e) => setAppearance({ ...appearance, distinctiveFeatures: e.target.value })}
              placeholder="Scars, tattoos, birthmarks, or other distinctive features..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          </div>
        </div>

        {/* Clothing and Equipment */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Palette className="w-5 h-5 text-gray-500" />
            Clothing Style
          </h4>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Typical Attire
            </label>
            <textarea
              value={appearance.clothing}
              onChange={(e) => setAppearance({ ...appearance, clothing: e.target.value })}
              placeholder="Describe your character's typical clothing and style..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      {isComplete() && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-medium text-green-800 mb-2">Appearance Preview</h4>
          <p className="text-green-700">{generateDescription()}</p>
        </div>
      )}

      {/* Incomplete Warning */}
      {!isComplete() && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Incomplete Description</h4>
            <p className="text-sm text-amber-700">
              Please fill in all appearance details to continue.
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!isComplete()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save className="w-5 h-5" />
        Save Appearance
      </button>
    </div>
  );
}
