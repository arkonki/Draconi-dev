import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../../types/character';
import { SkillsModal } from './SkillsModal';

const toggleDiceRoller = vi.fn();
const updateCharacterData = vi.fn();
const markSkillThisSession = vi.fn();

const character = {
  id: 'character-1',
  user_id: 'user-1',
  name: 'Test Hero',
  attributes: { STR: 12, CON: 12, AGL: 12, INT: 12, WIL: 12, CHA: 12 },
  conditions: {
    exhausted: false,
    sickly: false,
    dazed: false,
    angry: false,
    scared: false,
    disheartened: false,
  },
  trainedSkills: [],
  skill_levels: { Acrobatics: 5, Awareness: 6 },
  marked_skills: [],
  equipment: { equipped: {} },
} as unknown as Character;

vi.mock('../../dice/useDice', () => ({
  useDice: () => ({ toggleDiceRoller }),
}));

vi.mock('../../../stores/characterSheetStore', () => ({
  useCharacterSheetStore: () => ({ character, updateCharacterData, markSkillThisSession }),
}));

vi.mock('../../../lib/api/items', () => ({
  fetchItems: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

function renderSkills(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SkillsModal onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('SkillsModal', () => {
  beforeEach(() => {
    toggleDiceRoller.mockClear();
    updateCharacterData.mockClear();
    markSkillThisSession.mockClear();
  });

  it('keeps the skills dialog mounted when opening a roll', async () => {
    const { onClose } = renderSkills();
    const skill = await screen.findByRole('button', { name: /Acrobatics/i });

    fireEvent.click(skill);

    expect(toggleDiceRoller).toHaveBeenCalledWith(expect.objectContaining({
      rollMode: 'skillCheck',
      skillName: 'Acrobatics',
      targetValue: 5,
    }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Skill Checks' })).toBeInTheDocument();
  });

  it('keeps search available and filters skills', async () => {
    renderSkills();
    await screen.findByRole('button', { name: /Acrobatics/i });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search skills' }), {
      target: { value: 'acro' },
    });

    expect(screen.getByRole('button', { name: /Acrobatics/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Awareness/i })).not.toBeInTheDocument());
  });
});
