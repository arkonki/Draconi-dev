import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../types/character';
import type { Spell } from '../../types/magic';
import { SpellcastingView } from './SpellcastingView';

const mocks = vi.hoisted(() => ({
  toggleDiceRoller: vi.fn(),
  closeDiceRoller: vi.fn(),
  updateCharacterData: vi.fn(),
  setActiveStatusMessage: vi.fn(),
}));

const character = {
  id: 'character-1',
  user_id: 'user-1',
  name: 'Test Mage',
  current_wp: 8,
  attributes: { STR: 10, CON: 10, AGL: 10, INT: 14, WIL: 12, CHA: 10 },
  conditions: { scared: false },
  trainedSkills: ['Animism'],
  skill_levels: { Animism: 12 },
  prepared_spells: ['spell-2'],
  spells: { general: ['Light', 'Ember', 'Stone Shield'] },
} as unknown as Character;

const spells = [
  {
    id: 'spell-1',
    name: 'Light',
    rank: 0,
    description: 'Create a clear light.',
    castingTime: 'Action',
    range: '10 meters',
    duration: 'Stretch',
    willpowerCost: 1,
    requirement: 'Word',
    powerLevel: null,
    dice: null,
  },
  {
    id: 'spell-2',
    name: 'Ember',
    rank: 1,
    description: 'Hurl a burning ember.',
    castingTime: 'Action',
    range: '20 meters',
    duration: 'Instant',
    willpowerCost: 2,
    requirement: 'Gesture',
    powerLevel: '1',
    dice: 'D6',
  },
  {
    id: 'spell-3',
    name: 'Stone Shield',
    rank: 1,
    description: 'Raise a wall of stone.',
    castingTime: 'Action',
    range: 'Self',
    duration: 'Round',
    willpowerCost: 2,
    requirement: 'Focus',
    powerLevel: null,
    dice: null,
  },
] as unknown as Spell[];

vi.mock('../dice/useDice', () => ({
  useDice: () => ({
    toggleDiceRoller: mocks.toggleDiceRoller,
    closeDiceRoller: mocks.closeDiceRoller,
  }),
}));

vi.mock('../../hooks/useSpells', () => ({
  useSpells: () => ({ learnedSpells: spells, loading: false }),
}));

vi.mock('../../stores/characterSheetStore', () => {
  const useCharacterSheetStore = () => ({
    character,
    updateCharacterData: mocks.updateCharacterData,
    isSaving: false,
    setActiveStatusMessage: mocks.setActiveStatusMessage,
  });
  useCharacterSheetStore.getState = () => ({ character });
  return { useCharacterSheetStore };
});

vi.mock('../../lib/api/chat', () => ({ sendMessage: vi.fn() }));

describe('SpellcastingView', () => {
  beforeEach(() => {
    mocks.toggleDiceRoller.mockClear();
    mocks.closeDiceRoller.mockClear();
    mocks.updateCharacterData.mockClear();
    mocks.setActiveStatusMessage.mockClear();
  });

  it('keeps spell search available and filters the current list', () => {
    render(<SpellcastingView onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search spells' }), {
      target: { value: 'ember' },
    });

    expect(screen.getByRole('button', { name: 'View details for Ember' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View details for Light' })).not.toBeInTheDocument();
  });

  it('returns from internal spell details with query and scroll position intact', async () => {
    const { container } = render(<SpellcastingView onClose={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search spells' });
    const list = container.querySelector<HTMLDivElement>('.spellcasting-modal-list');
    expect(list).not.toBeNull();
    if (!list) return;

    fireEvent.change(search, { target: { value: 'ember' } });
    list.scrollTop = 180;
    fireEvent.click(screen.getByRole('button', { name: 'View details for Ember' }));

    expect(screen.getByRole('region', { name: 'Ember spell details' })).toBeInTheDocument();
    expect(screen.getByText('8 WP available')).toBeInTheDocument();
    expect(screen.getByText('2 WP base cost')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to spell list' }));

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Search spells' })).toHaveValue('ember');
      expect(container.querySelector<HTMLDivElement>('.spellcasting-modal-list')?.scrollTop).toBe(180);
      expect(screen.getByRole('button', { name: 'View details for Ember' })).toHaveFocus();
    });
  });

  it('changes legacy power-level spells between levels and recalculates WP cost', () => {
    render(<SpellcastingView onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Increase Ember power level' })).toBeEnabled();
    expect(screen.getByText('Cost 2 WP · 8 available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cast L1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Increase Ember power level' }));

    expect(screen.getByText('Cost 4 WP · 8 available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cast L2/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Decrease Ember power level' }));

    expect(screen.getByText('Cost 2 WP · 8 available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cast L1/i })).toBeInTheDocument();
  });
});
