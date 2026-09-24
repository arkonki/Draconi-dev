import type { Character } from '../types/character';

const mocks = vi.hoisted(() => ({
  fetchCharacterById: vi.fn(),
  fetchItems: vi.fn(),
  fetchHeroicAbilities: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/api/characters', () => ({
  fetchCharacterById: mocks.fetchCharacterById,
  updateCharacter: vi.fn(),
}));

vi.mock('../lib/api/items', () => ({
  fetchItems: mocks.fetchItems,
}));

vi.mock('../lib/api/abilities', () => ({
  fetchHeroicAbilities: mocks.fetchHeroicAbilities,
}));

vi.mock('../lib/api/encounters', () => ({
  fetchActiveEncounterForParty: vi.fn(),
  fetchEncounterCombatants: vi.fn(),
  updateCombatant: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

import { useCharacterSheetStore } from './characterSheetStore';
import { queryClient } from '../lib/queryClient';

describe('characterSheetStore', () => {
  beforeEach(() => {
    mocks.fetchCharacterById.mockReset();
    mocks.fetchItems.mockReset();
    mocks.fetchHeroicAbilities.mockReset();
    mocks.rpc.mockReset();
    queryClient.clear();

    useCharacterSheetStore.setState({
      character: null,
      isLoading: false,
      error: null,
      markedSkillsThisSession: new Set(),
      allGameItems: [],
      isLoadingGameItems: false,
      allHeroicAbilities: [],
      isLoadingAbilities: false,
    });
  });

  it('loads a character when optional heroic ability data is unavailable', async () => {
    const character = {
      id: 'character-1',
      user_id: 'user-1',
      name: 'Anemone',
      party_id: null,
      marked_skills: [],
    } as unknown as Character;

    mocks.fetchItems.mockResolvedValue([]);
    mocks.fetchHeroicAbilities.mockRejectedValue(new Error('Catalogue request failed'));
    mocks.fetchCharacterById.mockResolvedValue(character);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await useCharacterSheetStore.getState().fetchCharacter(character.id, character.user_id);

    expect(useCharacterSheetStore.getState()).toMatchObject({
      character,
      isLoading: false,
      error: null,
      isLoadingAbilities: false,
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load character-sheet heroic abilities:',
      'Catalogue request failed',
    );

    consoleError.mockRestore();
  });

  it('coalesces concurrent requests for the same character and reference data', async () => {
    const character = {
      id: 'character-1',
      user_id: 'user-1',
      name: 'Anemone',
      party_id: null,
      marked_skills: [],
    } as unknown as Character;

    mocks.fetchItems.mockResolvedValue([]);
    mocks.fetchHeroicAbilities.mockResolvedValue([]);
    mocks.fetchCharacterById.mockResolvedValue(character);

    await Promise.all([
      useCharacterSheetStore.getState().fetchCharacter(character.id, character.user_id),
      useCharacterSheetStore.getState().fetchCharacter(character.id, character.user_id),
    ]);

    expect(mocks.fetchItems).toHaveBeenCalledTimes(1);
    expect(mocks.fetchHeroicAbilities).toHaveBeenCalledTimes(1);
    expect(mocks.fetchCharacterById).toHaveBeenCalledTimes(1);
  });

  it('spends Sole Survivor WP atomically and updates local character state', async () => {
    const character = {
      id: 'character-1',
      user_id: 'user-1',
      name: 'Anemone',
      party_id: 'party-1',
      current_wp: 7,
    } as unknown as Character;
    mocks.rpc.mockResolvedValue({ data: { current_wp: 4, spent_wp: 3 }, error: null });
    useCharacterSheetStore.setState({ character });

    await useCharacterSheetStore.getState().spendSoleSurvivorWillpower();

    expect(mocks.rpc).toHaveBeenCalledWith('spend_solo_survivor_wp', {
      p_character_id: character.id,
    });
    expect(useCharacterSheetStore.getState()).toMatchObject({
      character: { id: character.id, current_wp: 4 },
      isSaving: false,
      saveError: null,
    });
  });
});
