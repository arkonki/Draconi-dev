import React from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';

export function OtherSkillsSelection() {
  const { character, updateCharacter } = useCharacterCreation();

  return (
    <div>
      <h3>Select Other Skills</h3>
      {/* Other skills selection UI will be implemented here */}
    </div>
  );
}
