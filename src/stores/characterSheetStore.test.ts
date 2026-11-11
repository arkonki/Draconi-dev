import type { Character } from '../types/character';

const mocks = vi.hoisted(() => ({
  fetchCharacterById: vi.fn(),
  updateCharacter: vi.fn(),
  StaleCharacterError: class StaleCharacterError extends Error {},
  fetchItems: vi.fn(),
  fetchHeroicAbilities: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/api/characters', () => ({
  fetchCharacterById: mocks.fetchCharacterById,
  updateCharacter: mocks.updateCharacter,
  StaleCharacterError: mocks.StaleCharacterError,
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
    mocks.updateCharacter.mockReset();
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

  describe('saving without overwriting someone else', () => {
    const loaded = {
      id: 'character-1',
      user_id: 'user-1',
      name: 'Anemone',
      party_id: null,
      notes: 'old notes',
      current_hp: 10,
      updated_at: '2026-03-01T10:00:00.000Z',
    } as unknown as Character;

    beforeEach(() => {
      useCharacterSheetStore.setState({ character: loaded, isSaving: false, saveError: null });
    });

    it('sends the version of the character the sheet has', async () => {
      const saved = { ...loaded, notes: 'new notes', updated_at: '2026-03-01T10:05:00.000Z' };
      mocks.updateCharacter.mockResolvedValue(saved);

      await useCharacterSheetStore.getState().updateNotes('new notes');

      expect(mocks.updateCharacter).toHaveBeenCalledWith('character-1', { notes: 'new notes' }, { ifUnchangedSince: '2026-03-01T10:00:00.000Z' });
      expect(useCharacterSheetStore.getState().character).toEqual(saved);
    });

    it('saves again when the other change touched different fields', async () => {
      // The GM lowered hit points while the player was writing notes.
      const newer = { ...loaded, current_hp: 4, updated_at: '2026-03-01T10:03:00.000Z' };
      const saved = { ...newer, notes: 'new notes', updated_at: '2026-03-01T10:05:00.000Z' };
      mocks.updateCharacter.mockRejectedValueOnce(new mocks.StaleCharacterError('stale')).mockResolvedValueOnce(saved);
      mocks.fetchCharacterById.mockResolvedValue(newer);

      await useCharacterSheetStore.getState().updateNotes('new notes');

      expect(mocks.updateCharacter).toHaveBeenLastCalledWith('character-1', { notes: 'new notes' }, { ifUnchangedSince: '2026-03-01T10:03:00.000Z' });
      expect(useCharacterSheetStore.getState().character).toEqual(saved);
      expect(useCharacterSheetStore.getState().saveError).toBeNull();
    });

    it('keeps the other change and reports it when both changed the same field', async () => {
      const newer = { ...loaded, notes: 'notes from another device', updated_at: '2026-03-01T10:03:00.000Z' };
      mocks.updateCharacter.mockRejectedValueOnce(new mocks.StaleCharacterError('stale'));
      mocks.fetchCharacterById.mockResolvedValue(newer);

      await expect(useCharacterSheetStore.getState().updateNotes('new notes')).rejects.toThrow('changed somewhere else');

      expect(mocks.updateCharacter).toHaveBeenCalledTimes(1);
      expect(useCharacterSheetStore.getState().character).toEqual(newer);
      expect(useCharacterSheetStore.getState().saveError).toContain('changed somewhere else');
      expect(useCharacterSheetStore.getState().isSaving).toBe(false);
    });

    it('sends quick edits one after another, each with the version the last one returned', async () => {
      const first = { ...loaded, current_hp: 9, updated_at: '2026-03-01T10:01:00.000Z' };
      const second = { ...first, current_hp: 8, updated_at: '2026-03-01T10:02:00.000Z' };
      mocks.updateCharacter.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

      const store = useCharacterSheetStore.getState();
      await Promise.all([store.updateCurrentHP(9), store.updateCurrentHP(8)]);

      expect(mocks.updateCharacter).toHaveBeenNthCalledWith(1, 'character-1', { current_hp: 9 }, { ifUnchangedSince: '2026-03-01T10:00:00.000Z' });
      expect(mocks.updateCharacter).toHaveBeenNthCalledWith(2, 'character-1', { current_hp: 8 }, { ifUnchangedSince: '2026-03-01T10:01:00.000Z' });
      expect(useCharacterSheetStore.getState().character).toEqual(second);
    });

    it('lets the next save through after one fails', async () => {
      mocks.updateCharacter.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValueOnce({ ...loaded, notes: 'second' });

      const store = useCharacterSheetStore.getState();
      await expect(store.updateNotes('first')).rejects.toThrow('Network request failed');
      await store.updateNotes('second');

      expect(useCharacterSheetStore.getState().character?.notes).toBe('second');
    });
  });
});
