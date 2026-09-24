import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CharacterCreationData } from '../types/character'; // Import CharacterCreationData

interface CharacterCreationStore {
  step: number;
  character: CharacterCreationData; // Use the extended type
  setStep: (step: number) => void;
  updateCharacter: (updates: CharacterCreationData) => void; // Use the extended type
  resetCharacter: () => void;
}

export const useCharacterCreation = create<CharacterCreationStore>()(
  persist(
    (set) => ({
      step: 0,
      character: {},
      setStep: (step) => set({ step }),
      updateCharacter: (updates) =>
        set((state) => ({
          character: { ...state.character, ...updates },
        })),
      resetCharacter: () => set({ character: {}, step: 0 }),
    }),
    {
      name: 'draconi-character-creation',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
