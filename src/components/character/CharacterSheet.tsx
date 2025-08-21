import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Character, AttributeName } from '../../types/character'; // Import AttributeName
import { calculateMovement } from '../../lib/movement';
import {
  Shield, Heart, Swords, Brain, Zap, Users, Moon, Sun, Clock, Skull, Package, Book, GraduationCap, Star, Sparkles, X, Bed, Award, ShieldCheck, HeartPulse, UserCog, Dumbbell, Feather // Added icons
} from 'lucide-react';
import { useDice } from '../dice/DiceContext';
import { SkillsModal } from './modals/SkillsModal';
import { SpellcastingView } from './SpellcastingView';
import { InventoryModal } from './InventoryModal';
import { EquipmentSection } from './EquipmentSection';
import { HeroicAbilitiesView } from './HeroicAbilitiesView';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { AdvancementSystem } from './AdvancementSystem';
import { DeathRollTracker } from './DeathRollTracker';
import { StatusPanelView } from './StatusPanelView'; // Import the StatusPanelView component

interface CharacterSheetProps {
  // No props needed, relies solely on store
}

export function CharacterSheet({}: CharacterSheetProps) {
  const navigate = useNavigate();
  const { toggleDiceRoller } = useDice();

  // Get everything from the Zustand store
  const {
    character,
    adjustStat,
    toggleCondition,
    performRest,
    updateCharacterData,
    isLoading,
    error,
    isSaving,
    saveError,
    setActiveStatusMessage, // Get the action to set status messages
  } = useCharacterSheetStore();

  // Local UI state
  const [showSpellcastingModal, setShowSpellcastingModal] = useState(false);
  const [showRestOptionsModal, setShowRestOptionsModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showAdvancementSystem, setShowAdvancementSystem] = useState(false);
  const [showHeroicAbilitiesModal, setShowHeroicAbilitiesModal] = useState(false);
  const [healerPresent, setHealerPresent] = useState(false);


  if (isLoading) {
      return <div className="p-4 text-center">Loading character...</div>;
  }
  if (error) {
       return <div className="p-4 text-center text-red-500">Error loading character: {error}</div>;
  }
  if (!character) {
      return <div className="p-4 text-center">Character data is not available. Please select a character.</div>;
  }


  const getBaseChance = (value: number): number => {
    if (value <= 5) return 3;
    if (value <= 8) return 4;
    if (value <= 12) return 5;
    if (value <= 15) return 6;
    return 7;
  };

  const handleConditionToggle = (condition: keyof Character['conditions']) => {
    toggleCondition(condition);
  };

  const handleRest = async (type: 'round' | 'stretch' | 'shift') => {
    setShowRestOptionsModal(false);
    await performRest(type, type === 'stretch' ? healerPresent : undefined);
    setHealerPresent(false);
  };


  const renderAttribute = (
    name: AttributeName,
    value: number | undefined,
    icon: React.ReactNode,
    conditionKey: keyof Character['conditions']
  ) => {
    const displayValue = value ?? 10;
    const conditionActive = character.conditions?.[conditionKey] ?? false;

    return (
        <div className="relative">
          <div className="p-4 bg-gray-800 rounded-lg text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{name}</span>
              <span className="text-xl">{displayValue}</span>
            </div>
            <div className="text-sm h-5">
              {(name === 'STR' || name === 'AGL') && displayValue > 12 && (
                <div className="text-blue-400">
                  Damage Bonus: {displayValue <= 15 ? '+D4' : '+D6'}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => handleConditionToggle(conditionKey)}
            className={`absolute -bottom-3 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              conditionActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isSaving}
            title={`Toggle ${conditionKey.charAt(0).toUpperCase() + conditionKey.slice(1)}`}
          >
            {conditionKey.toUpperCase().substring(0, 3)}
          </button>
        </div>
    );
  };


  const renderRestOptionsModal = () => {
    if (!showRestOptionsModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Bed className="w-6 h-6" /> Choose Rest Type
            </h3>
            <button
              onClick={() => {
                setShowRestOptionsModal(false);
                setHealerPresent(false);
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>



          <div className="space-y-4 mb-6">
            <div>
              <button
                onClick={() => handleRest('shift')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                disabled={isSaving}
              >
                <Clock className="w-5 h-5" />
                {isSaving ? 'Resting...' : 'Take Shift Rest'}
              </button>
              <p className="text-sm text-gray-600 mt-2">
                <strong>Shift Rest (~6 hours):</strong> Requires a safe location. Recovers all HP & WP, heals all standard conditions. Resets death roll state. Interruption negates effects.
              </p>
            </div>

            <div>
              <button
                onClick={() => handleRest('stretch')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                disabled={isSaving || (character?.current_hp ?? 0) <= 0}
              >
                <Sun className="w-5 h-5" />
                {isSaving ? 'Resting...' : `Take Stretch Rest`}
              </button>
               <p className="text-sm text-gray-600 mt-2">
                <strong>Stretch Rest (~15 mins):</strong> Heal {healerPresent ? '2d6' : '1d6'} HP, recover 1d6 WP, heal one standard condition. Can only be done once per Shift. Cannot be taken while dying. Interruption negates effects.
              </p>
            </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={healerPresent}
                onChange={(e) => setHealerPresent(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Healer present for Stretch Rest (requires successful HEALING roll)</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">Check this if another character is tending to you and succeeds on a HEALING roll during a Stretch Rest.</p>
          </div>

            <div>
              <button
                onClick={() => handleRest('round')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                disabled={isSaving}
              >
                <Moon className="w-5 h-5" />
                {isSaving ? 'Resting...' : 'Take Round Rest'}
              </button>
               <p className="text-sm text-gray-600 mt-2">
                <strong>Round Rest (~10 secs):</strong> Recover 1d6 WP. No HP recovery. Can only be done once per Shift.
              </p>
            </div>
          </div>

          {isSaving && <div className="mt-4 text-sm text-center text-gray-500">Saving...</div>}
          {saveError && <div className="mt-4 text-sm text-center text-red-500">Error: {saveError}</div>}

        </div>
      </div>
    );
  };

  const canCastSpells = () => {
    const trainedSkillsArray = Array.isArray(character?.trainedSkills) ? character.trainedSkills : [];
    return (
      character?.profession === 'Mage' ||
      trainedSkillsArray.some(skillName =>
        typeof skillName === 'string' && ['ELEMENTALISM', 'ANIMISM', 'MENTALISM'].includes(skillName.toUpperCase())
      )
    );
  };

  const currentHP = character?.current_hp ?? 0;
  const currentWP = character?.current_wp ?? 0;
  const maxHP = character?.max_hp ?? (character?.attributes?.CON ?? 10); // Fallback if max_hp isn't set directly
  const maxWP = character?.max_wp ?? (character?.attributes?.WIL ?? 10);   // Fallback if max_wp isn't set directly


  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">{character.name}</h1>
          <p className="text-gray-600 text-lg">
            {character.kin || 'Unknown Kin'} {character.profession || 'Unknown Profession'} - Age: {character.age || 'Unknown'}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setShowInventoryModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors"
          >
            <Package className="w-4 h-4" />
            Inventory
          </button>
          <button
            onClick={() => setShowRestOptionsModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm transition-colors"
          >
            <Bed className="w-4 h-4" />
            Rest
          </button>
          <button
            onClick={() => setShowAdvancementSystem(true)}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 text-sm transition-colors"
          >
            <Award className="w-4 h-4" />
            Session
          </button>
        </div>
      </div>

      <StatusPanelView />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-6">
        {renderAttribute('STR', character.attributes?.STR, <Dumbbell />, 'exhausted')}
        {renderAttribute('CON', character.attributes?.CON, <Heart />, 'sickly')}
        {renderAttribute('AGL', character.attributes?.AGL, <Feather />, 'dazed')}
        {renderAttribute('INT', character.attributes?.INT, <Brain />, 'angry')}
        {renderAttribute('WIL', character.attributes?.WIL, <Zap />, 'scared')}
        {renderAttribute('CHA', character.attributes?.CHA, <UserCog />, 'disheartened')}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <div className="md:col-span-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowSkillsModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors"
              >
                <Book className="w-4 h-4" />
                Skills
              </button>
              {canCastSpells() && (
                <button
                  onClick={() => setShowSpellcastingModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Spells
                </button>
              )}
              <button
                onClick={() => setShowHeroicAbilitiesModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Abilities
              </button>
            </div>
             <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm self-start">
               <span className="font-medium">Movement:</span>
               <span className="font-bold text-lg">
                 {calculateMovement(character.kin, character.attributes?.AGL)}m
               </span>
             </div>
        </div>


        <div className="md:col-span-6 grid grid-cols-2 gap-4">
          {currentHP > 0 ? (
            <div className="p-3 rounded-lg shadow bg-white">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold flex items-center gap-1 text-sm">
                  <HeartPulse className="w-4 h-4 text-red-600" />
                  HP
                </h3>
                <span className="text-sm font-medium">
                  {currentHP} / {maxHP}
                </span>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => adjustStat('current_hp', -1)}
                  className="flex-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                  disabled={isSaving || currentHP <= 0}
                  title="Decrease HP"
                >
                  -
                </button>
                <button
                  onClick={() => adjustStat('current_hp', 1)}
                  className="flex-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                  disabled={currentHP >= maxHP || isSaving}
                  title="Increase HP"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <DeathRollTracker character={character} />
          )}

          <div className="p-3 bg-white rounded-lg shadow">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold flex items-center gap-1 text-sm">
                <Zap className="w-4 h-4 text-blue-600" />
                WP
              </h3>
              <span className="text-sm font-medium">
                {currentWP} / {maxWP}
              </span>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => adjustStat('current_wp', -1)}
                className="flex-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                disabled={currentWP === 0 || isSaving}
                title="Decrease WP"
              >
                -
              </button>
              <button
                onClick={() => adjustStat('current_wp', 1)}
                className="flex-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                disabled={currentWP >= maxWP || isSaving}
                title="Increase WP"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <EquipmentSection character={character} />

      {showSkillsModal && (
        <SkillsModal
          onClose={() => setShowSkillsModal(false)}
        />
      )}

      {showSpellcastingModal && (
        <SpellcastingView
          onClose={() => setShowSpellcastingModal(false)}
        />
      )}

      {showInventoryModal && (
        <InventoryModal
          onClose={() => setShowInventoryModal(false)}
        />
      )}

      {showAdvancementSystem && (
        <AdvancementSystem
          character={character}
          onClose={() => setShowAdvancementSystem(false)}
        />
      )}

      {showHeroicAbilitiesModal && (
        <HeroicAbilitiesView
          onClose={() => setShowHeroicAbilitiesModal(false)}
        />
      )}

      {renderRestOptionsModal()}

      {isSaving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md text-sm z-50 animate-pulse">
          Saving...
        </div>
      )}
      {saveError && (
         <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-md text-sm z-50">
           Save Error: {saveError}
         </div>
       )}
    </div>
  );
}
