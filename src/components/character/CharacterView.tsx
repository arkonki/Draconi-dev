import React, { useState } from 'react';
import { Character } from '../../types/character';
import { Navigation } from '../Navigation';
import { CharacterSheet } from './CharacterSheet';
import { InventoryModal } from './InventoryModal';
import { EquipmentModal } from './EquipmentModal';
import { ConditionsModal } from './ConditionsModal';
import { ExperienceModal } from './ExperienceModal';
import { SpellsView } from './SpellsView';
import { HeroicAbilitiesView } from './HeroicAbilitiesView';
import { AdvancementSystem } from './AdvancementSystem';
import { 
  Dices, 
  ScrollText, 
  Package,
  User,
  PenTool,
  GraduationCap,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Edit,
  Plus,
  Check,
  AlertTriangle,
  Sparkles,
  Swords
} from 'lucide-react';

interface CharacterViewProps {
  character: Character;
}

export function CharacterView({ character }: CharacterViewProps) {
  const [activeTab, setActiveTab] = useState<'sheet' | 'spells' | 'heroic' | 'advancement'>('sheet');
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [showConditionsModal, setShowConditionsModal] = useState(false);
  const [showExperienceModal, setShowExperienceModal] = useState(false);

  // Check if any conditions are active
  const hasActiveConditions = Object.values(character.conditions).some(condition => condition);

  const handleCharacterUpdate = (updatedCharacter: Character) => {
    // Reload the page to reflect changes
    // In a real application, you'd want to use proper state management
    window.location.reload();
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <CharacterSheet character={character} onUpdate={handleCharacterUpdate} />

      {/* Modals */}
      {showInventoryModal && (
        <InventoryModal
          character={character}
          onClose={() => setShowInventoryModal(false)}
          onUpdate={handleCharacterUpdate}
        />
      )}

      {showEquipModal && (
        <EquipmentModal
          character={character}
          onClose={() => setShowEquipModal(false)}
          onUpdate={handleCharacterUpdate}
        />
      )}

      {showConditionsModal && (
        <ConditionsModal
          character={character}
          onClose={() => setShowConditionsModal(false)}
          onUpdate={handleCharacterUpdate}
        />
      )}

      {showExperienceModal && (
        <ExperienceModal
          character={character}
          onClose={() => setShowExperienceModal(false)}
          onUpdate={handleCharacterUpdate}
        />
      )}
    </div>
  );
}
