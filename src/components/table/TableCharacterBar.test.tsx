import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TableCharacterBar } from './TableCharacterBar';
import type { QuickCharacter } from '../../hooks/useTableCharacters';

const character = (overrides: Partial<QuickCharacter>): QuickCharacter => ({
  id: 'c1', user_id: 'u1', name: 'Anna', portrait_url: null, current_hp: 9, max_hp: 12, current_wp: 6, max_wp: 10,
  conditions: {}, death_rolls_passed: 0, death_rolls_failed: 0, is_rallied: false, ...overrides,
});

const party = [
  character({ id: 'c1', user_id: 'u1', name: 'Anna', conditions: { dazed: true } }),
  character({ id: 'c2', user_id: 'u2', name: 'Borin', current_hp: 0, death_rolls_passed: 1, death_rolls_failed: 2 }),
];

describe('TableCharacterBar', () => {
  it('shows a player only their own character, with its quick stats', () => {
    render(<TableCharacterBar characters={party} isGm={false} currentUserId="u1" onOpenSheet={vi.fn()} />);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.queryByText('Borin')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'HP 9 of 12' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'WP 6 of 10' })).toBeInTheDocument();
    expect(screen.getByText('Dazed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /combat/i })).not.toBeInTheDocument();
  });

  it('shows the GM every character, and flags the one who is dying', () => {
    render(<TableCharacterBar characters={party} isGm currentUserId="gm" onOpenSheet={vi.fn()} onOpenCombat={vi.fn()} />);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Borin')).toBeInTheDocument();
    expect(screen.getByText(/Dying/)).toBeInTheDocument();
  });

  it('opens the right character sheet', () => {
    const onOpenSheet = vi.fn();
    render(<TableCharacterBar characters={party} isGm currentUserId="gm" onOpenSheet={onOpenSheet} />);
    fireEvent.click(screen.getByRole('button', { name: "Open Borin's character sheet" }));
    expect(onOpenSheet).toHaveBeenCalledWith('c2');
  });

  it('lets the GM open the combat page', () => {
    const onOpenCombat = vi.fn();
    render(<TableCharacterBar characters={party} isGm currentUserId="gm" onOpenSheet={vi.fn()} onOpenCombat={onOpenCombat} combatActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the combat page' }));
    expect(onOpenCombat).toHaveBeenCalled();
  });

  it('renders nothing for a player who has no character in the party', () => {
    const { container } = render(<TableCharacterBar characters={party} isGm={false} currentUserId="someone-else" onOpenSheet={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
